/* Application controller: setup, playback gating, the three-context form,
   progress, navigation and export. */
(function () {
  "use strict";

  const cfg = window.REVIEW_CONFIG;
  const schema = window.REVIEW_SCHEMA;
  const assignment = window.REVIEW_ASSIGNMENT;
  const storage = window.REVIEW_STORAGE;
  const exporter = window.REVIEW_EXPORT;
  const manifest = window.REVIEW_PAIRS || { pairs: [] };

  const PAIRS = manifest.pairs || [];
  const TOTAL_JUDGMENTS = PAIRS.length * schema.CONTEXTS.length;

  const $ = (id) => document.getElementById(id);
  const el = {};
  [
    "study-title", "study-subtitle", "session-badges", "badge-reviewer", "badge-set",
    "badge-save", "btn-quick-backup", "btn-exit",
    "screen-setup", "screen-review", "screen-finish",
    "setup-form", "reviewer-id", "reviewer-id-hint", "assignment-preview",
    "assignment-value", "assignment-note", "resume-box", "resume-detail",
    "btn-resume", "btn-discard", "ack-blinding", "btn-begin", "btn-import",
    "import-file", "setup-error", "storage-warning", "instr-pair-count",
    "progress-done", "progress-total", "progress-remaining", "progress-fill",
    "pair-chips", "btn-goto-finish", "pair-title", "pair-meta",
    "video", "video-error", "btn-playpause", "btn-replay", "seek", "seek-fill",
    "time-display", "rates", "coverage", "watch-text", "watch-status",
    "btn-watch-override", "context-tabs", "context-panels",
    "btn-prev", "btn-next", "pair-nav-status",
    "finish-summary", "finish-outstanding", "outstanding-list", "finish-ready",
    "btn-submit", "btn-export-json", "btn-back-to-review", "submitted-note",
  ].forEach((id) => { el[id] = $(id); });

  const state = {
    session: null,
    index: 0,
    context: schema.CONTEXTS[0].code,
    player: null,
    saveFlashTimer: null,
    /* The watch override is an escape hatch for broken playback, so it stays
       hidden until playback actually looks broken -- otherwise it reads as a
       legitimate shortcut past the instruction to watch the whole clip. */
    overrideOffered: false,
    overrideTimer: null,
  };

  /* ---------------------------------------------------------------- utils */

  const responseKey = (pairId, contextCode) => pairId + "|" + contextCode;

  function currentPair() {
    return PAIRS[state.index] || null;
  }

  function getResponse(pairId, contextCode) {
    return state.session.responses[responseKey(pairId, contextCode)] || null;
  }

  function isJudgmentComplete(r) {
    if (!r || !r.preference || !r.confidence || !r.stage) return false;
    if (!r.reasons || r.reasons.length < (cfg.minReasons || 1)) return false;
    if (cfg.requireExplanation && !String(r.explanation || "").trim()) return false;
    return true;
  }

  function pairCompletion(pairId) {
    let done = 0;
    schema.CONTEXTS.forEach((c) => {
      if (isJudgmentComplete(getResponse(pairId, c.code))) done += 1;
    });
    return { done: done, total: schema.CONTEXTS.length };
  }

  function totalComplete() {
    return PAIRS.reduce((n, p) => n + pairCompletion(p.pair_id).done, 0);
  }

  function watchRecord(pairId) {
    if (!state.session.watch[pairId]) {
      state.session.watch[pairId] = { covered: [], full: false, override: false };
    }
    return state.session.watch[pairId];
  }

  function isUnlocked(pairId) {
    const w = state.session.watch[pairId];
    return !!(w && (w.full || w.override));
  }

  function persist(flash) {
    const ok = storage.save(state.session);
    if (flash !== false) flashSaved(ok);
  }

  function flashSaved(ok) {
    const badge = el["badge-save"];
    if (!badge) return;
    badge.textContent = ok ? "Saved" : "Not saved";
    badge.classList.toggle("is-error", !ok);
    badge.classList.add("is-flash");
    window.clearTimeout(state.saveFlashTimer);
    state.saveFlashTimer = window.setTimeout(() => {
      badge.classList.remove("is-flash");
    }, 700);
  }

  function showScreen(name) {
    el["screen-setup"].hidden = name !== "setup";
    el["screen-review"].hidden = name !== "review";
    el["screen-finish"].hidden = name !== "finish";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* -------------------------------------------------------- setup screen */

  function refreshSetup() {
    const raw = el["reviewer-id"].value;
    const id = assignment.normalise(raw);
    const valid = assignment.isValidId(id);

    el["setup-error"].hidden = true;

    if (!raw.trim()) {
      el["assignment-preview"].hidden = true;
      el["resume-box"].hidden = true;
      el["btn-begin"].disabled = true;
      return;
    }

    if (!valid) {
      el["assignment-preview"].hidden = true;
      el["resume-box"].hidden = true;
      el["btn-begin"].disabled = true;
      el["reviewer-id-hint"].textContent =
        "2 to 32 characters: letters, digits, dot, dash or underscore.";
      el["reviewer-id-hint"].classList.add("is-error");
      return;
    }

    el["reviewer-id-hint"].textContent =
      "Letters, digits, dot, dash or underscore. Example: R001";
    el["reviewer-id-hint"].classList.remove("is-error");

    const a = assignment.assign(id);
    el["assignment-preview"].hidden = false;
    el["assignment-value"].textContent = "Set " + a.set;
    el["assignment-value"].dataset.set = a.set;
    el["assignment-note"].textContent = a.method === "sequence"
      ? "Assigned automatically from your reviewer number, alternating between "
        + "the two counterbalanced sets. Both sets contain the same comparisons; "
        + "they differ only in which side each behaviour appears on."
      : "Assigned automatically from your reviewer ID. Both sets contain the "
        + "same comparisons; they differ only in which side each behaviour "
        + "appears on.";

    const saved = storage.load(id);
    if (saved) {
      const done = countCompleteIn(saved);
      el["resume-box"].hidden = false;
      el["resume-detail"].textContent =
        done + " of " + TOTAL_JUDGMENTS + " judgments saved, last updated "
        + formatStamp(saved.updated_utc) + ".";
    } else {
      el["resume-box"].hidden = true;
    }

    el["btn-begin"].disabled = !el["ack-blinding"].checked;
  }

  function countCompleteIn(session) {
    let n = 0;
    PAIRS.forEach((p) => {
      schema.CONTEXTS.forEach((c) => {
        const r = session.responses[responseKey(p.pair_id, c.code)];
        if (isJudgmentComplete(r)) n += 1;
      });
    });
    return n;
  }

  function formatStamp(iso) {
    if (!iso) return "unknown";
    try {
      return new Date(iso).toLocaleString();
    } catch (err) {
      return iso;
    }
  }

  function startSession(session) {
    state.session = session;
    state.index = firstIncompleteIndex();
    state.context = schema.CONTEXTS[0].code;

    el["badge-reviewer"].textContent = session.reviewer_id;
    el["badge-set"].textContent = "Set " + session.assigned_set;
    el["badge-set"].dataset.set = session.assigned_set;
    el["session-badges"].hidden = false;
    el["btn-quick-backup"].hidden = false;
    el["btn-exit"].hidden = false;

    persist(false);
    showScreen("review");
    renderPair();
    renderProgress();
  }

  function firstIncompleteIndex() {
    for (let i = 0; i < PAIRS.length; i += 1) {
      const c = pairCompletion(PAIRS[i].pair_id);
      if (c.done < c.total) return i;
    }
    return 0;
  }

  /* --------------------------------------------------------- form build */

  function buildContextUi() {
    schema.CONTEXTS.forEach((context, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.id = "tab-" + context.code;
      tab.dataset.context = context.code;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "panel-" + context.code);
      tab.innerHTML =
        '<span class="tab-label">' + context.label + "</span>"
        + '<span class="tab-state" data-state="empty">Not started</span>';
      tab.addEventListener("click", () => setContext(context.code));
      el["context-tabs"].appendChild(tab);

      el["context-panels"].appendChild(buildPanel(context, i));
    });
  }

  function buildPanel(context) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-" + context.code;
    panel.dataset.context = context.code;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + context.code);

    const guidance = document.createElement("p");
    guidance.className = "guidance";
    guidance.innerHTML = "<strong>" + context.label + ".</strong> " + context.guidance;
    panel.appendChild(guidance);

    panel.appendChild(buildPreferenceGroup(context));
    panel.appendChild(buildConfidenceGroup(context));
    panel.appendChild(buildReasonGroup(context));
    panel.appendChild(buildStageGroup(context));
    panel.appendChild(buildExplanation(context));

    const status = document.createElement("p");
    status.className = "panel-status";
    status.dataset.role = "panel-status";
    panel.appendChild(status);

    return panel;
  }

  function fieldset(legend, hint) {
    const fs = document.createElement("fieldset");
    fs.className = "group";
    const lg = document.createElement("legend");
    lg.textContent = legend;
    fs.appendChild(lg);
    if (hint) {
      const p = document.createElement("p");
      p.className = "group-hint muted";
      p.textContent = hint;
      fs.appendChild(p);
    }
    return fs;
  }

  function buildPreferenceGroup(context) {
    const fs = fieldset("Which behaviour do you prefer?",
                        "Option 1 is the left video, Option 2 is the right video.");
    const wrap = document.createElement("div");
    wrap.className = "choices choices-preference";

    schema.PREFERENCES.forEach((pref) => {
      const label = document.createElement("label");
      label.className = "choice choice-pref";
      if (pref.side === 1) label.classList.add("choice-left");
      if (pref.side === 2) label.classList.add("choice-right");
      if (pref.code === "TIE") label.classList.add("choice-tie");
      if (pref.code === "INCOMPARABLE") label.classList.add("choice-incomparable");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "pref_" + context.code;
      input.value = pref.code;
      input.dataset.role = "preference";
      input.addEventListener("change", () => onAnswerChanged(context.code));

      const text = document.createElement("span");
      text.className = "choice-text";
      text.innerHTML = "<span class=\"choice-title\">" + pref.label + "</span>"
        + (pref.hint ? '<span class="choice-hint">' + pref.hint + "</span>" : "");

      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });

    fs.appendChild(wrap);
    return fs;
  }

  function buildConfidenceGroup(context) {
    const fs = fieldset("How confident are you in that judgment?");
    const wrap = document.createElement("div");
    wrap.className = "choices choices-confidence";

    schema.CONFIDENCE.forEach((c) => {
      const label = document.createElement("label");
      label.className = "choice choice-confidence";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "conf_" + context.code;
      input.value = String(c.value);
      input.dataset.role = "confidence";
      input.addEventListener("change", () => onAnswerChanged(context.code));
      const text = document.createElement("span");
      text.className = "choice-text";
      text.innerHTML = '<span class="conf-number">' + c.value + "</span>"
        + '<span class="conf-label">' + c.label + "</span>";
      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });

    fs.appendChild(wrap);
    return fs;
  }

  function buildReasonGroup(context) {
    const fs = fieldset("What drove your preference?",
                        "Select every reason that applies.");
    const wrap = document.createElement("div");
    wrap.className = "choices choices-reason";

    schema.REASONS.forEach((reason) => {
      const label = document.createElement("label");
      label.className = "choice choice-reason";
      if (reason.exclusive) label.classList.add("choice-exclusive");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "reason_" + context.code;
      input.value = reason.code;
      input.dataset.role = "reason";
      input.dataset.exclusive = reason.exclusive ? "1" : "";
      input.addEventListener("change", () => {
        applyReasonExclusivity(context.code, input);
        onAnswerChanged(context.code);
      });
      const text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = reason.label;
      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });

    fs.appendChild(wrap);
    return fs;
  }

  /* "No meaningful difference" cannot coexist with a substantive reason. */
  function applyReasonExclusivity(contextCode, changed) {
    const inputs = reasonInputs(contextCode);
    if (!changed.checked) return;
    if (changed.dataset.exclusive) {
      inputs.forEach((i) => { if (i !== changed) i.checked = false; });
    } else {
      inputs.forEach((i) => { if (i.dataset.exclusive) i.checked = false; });
    }
  }

  function buildStageGroup(context) {
    const fs = fieldset("Which task stage most influenced your decision?");
    const wrap = document.createElement("div");
    wrap.className = "choices choices-stage";

    schema.STAGES.forEach((stage) => {
      const label = document.createElement("label");
      label.className = "choice choice-stage";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "stage_" + context.code;
      input.value = stage.code;
      input.dataset.role = "stage";
      input.addEventListener("change", () => onAnswerChanged(context.code));
      const text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = stage.label;
      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });

    fs.appendChild(wrap);
    return fs;
  }

  function buildExplanation(context) {
    const fs = fieldset("What observation most influenced your preference?",
                        cfg.requireExplanation
                          ? "Required. One or two sentences is plenty."
                          : "Optional but valuable. One or two sentences is plenty.");
    const ta = document.createElement("textarea");
    ta.className = "explanation";
    ta.rows = 3;
    ta.maxLength = 1000;
    ta.name = "explanation_" + context.code;
    ta.dataset.role = "explanation";
    ta.placeholder = "For example: one behaviour swung the arm close to the open "
      + "door on the way out, the other stayed clear of it.";
    ta.addEventListener("input", () => onAnswerChanged(context.code));
    fs.appendChild(ta);
    return fs;
  }

  /* --------------------------------------------------------- form state */

  const panelOf = (contextCode) => $("panel-" + contextCode);

  function reasonInputs(contextCode) {
    return Array.prototype.slice.call(
      panelOf(contextCode).querySelectorAll('input[data-role="reason"]'));
  }

  function readPanel(contextCode) {
    const panel = panelOf(contextCode);
    const pref = panel.querySelector('input[data-role="preference"]:checked');
    const conf = panel.querySelector('input[data-role="confidence"]:checked');
    const stage = panel.querySelector('input[data-role="stage"]:checked');
    const reasons = reasonInputs(contextCode)
      .filter((i) => i.checked).map((i) => i.value);
    const explanation = panel.querySelector('textarea[data-role="explanation"]').value;
    return {
      preference: pref ? pref.value : "",
      confidence: conf ? Number(conf.value) : null,
      reasons: reasons,
      stage: stage ? stage.value : "",
      explanation: explanation,
    };
  }

  function writePanel(contextCode, r) {
    const panel = panelOf(contextCode);
    panel.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach((i) => { i.checked = false; });
    panel.querySelector('textarea[data-role="explanation"]').value =
      (r && r.explanation) || "";
    if (!r) return;
    if (r.preference) {
      const pref = panel.querySelector(
        'input[data-role="preference"][value="' + r.preference + '"]');
      if (pref) pref.checked = true;
    }
    if (r.confidence) {
      const conf = panel.querySelector(
        'input[data-role="confidence"][value="' + r.confidence + '"]');
      if (conf) conf.checked = true;
    }
    if (r.stage) {
      const stage = panel.querySelector(
        'input[data-role="stage"][value="' + r.stage + '"]');
      if (stage) stage.checked = true;
    }
    (r.reasons || []).forEach((code) => {
      const box = panel.querySelector(
        'input[data-role="reason"][value="' + code + '"]');
      if (box) box.checked = true;
    });
  }

  function onAnswerChanged(contextCode) {
    const pair = currentPair();
    if (!pair) return;
    const values = readPanel(contextCode);
    const key = responseKey(pair.pair_id, contextCode);
    const empty = !values.preference && !values.confidence && !values.stage
      && values.reasons.length === 0 && !values.explanation.trim();

    if (empty) {
      delete state.session.responses[key];
    } else {
      state.session.responses[key] = {
        pair_id: pair.pair_id,
        context: contextCode,
        preference: values.preference,
        confidence: values.confidence,
        reasons: values.reasons,
        stage: values.stage,
        explanation: values.explanation.trim(),
        updated_utc: storage.nowUtc(),
      };
    }
    persist();
    renderPanelStatus(contextCode);
    renderTabs();
    renderProgress();
  }

  /* ------------------------------------------------------------ rendering */

  function renderPair() {
    const pair = currentPair();
    if (!pair) return;

    el["pair-title"].textContent =
      "Pair " + (state.index + 1) + " of " + PAIRS.length;
    const bits = [];
    if (pair.seed) bits.push("scenario seed " + pair.seed);
    bits.push("same starting state for both options");
    el["pair-meta"].textContent = bits.join(" · ");

    el["video-error"].hidden = true;
    offerOverrideWhenStuck();
    const src = (cfg.videoBaseUrl || "") + (pair.video[state.session.assigned_set] || "");
    const w = watchRecord(pair.pair_id);
    state.player.load(pair.pair_id, src, w.covered, pair.duration_s);

    schema.CONTEXTS.forEach((c) => {
      writePanel(c.code, getResponse(pair.pair_id, c.code));
      renderPanelStatus(c.code);
    });

    setContext(state.context);
    renderLock();
    renderTabs();
    renderNav();
  }

  /* Reveal the override only once playback has plainly failed to get going. */
  function offerOverrideWhenStuck() {
    window.clearTimeout(state.overrideTimer);
    state.overrideOffered = false;
    el["btn-watch-override"].hidden = true;
    if (!cfg.allowWatchOverride) return;
    state.overrideTimer = window.setTimeout(() => {
      if (state.player && state.player.getFraction() < 0.1) revealOverride();
    }, 45000);
  }

  function revealOverride() {
    state.overrideOffered = true;
    if (!state.player) return;
    renderWatch({
      buckets: state.player.getBuckets(),
      fraction: state.player.getFraction(),
      complete: state.player.isComplete(),
    });
  }

  function setContext(contextCode) {
    state.context = contextCode;
    schema.CONTEXTS.forEach((c) => {
      const tab = $("tab-" + c.code);
      const panel = panelOf(c.code);
      const active = c.code === contextCode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    });
  }

  function renderTabs() {
    const pair = currentPair();
    if (!pair) return;
    schema.CONTEXTS.forEach((c) => {
      const tab = $("tab-" + c.code);
      const r = getResponse(pair.pair_id, c.code);
      const stateEl = tab.querySelector(".tab-state");
      if (isJudgmentComplete(r)) {
        stateEl.textContent = "Complete";
        stateEl.dataset.state = "complete";
      } else if (r) {
        stateEl.textContent = "In progress";
        stateEl.dataset.state = "partial";
      } else {
        stateEl.textContent = "Not started";
        stateEl.dataset.state = "empty";
      }
    });
  }

  function missingFields(r) {
    const missing = [];
    if (!r || !r.preference) missing.push("a preference");
    if (!r || !r.confidence) missing.push("a confidence rating");
    if (!r || !r.reasons || r.reasons.length < (cfg.minReasons || 1)) {
      missing.push("at least " + (cfg.minReasons || 1) + " reason");
    }
    if (!r || !r.stage) missing.push("a pivotal task stage");
    if (cfg.requireExplanation && (!r || !String(r.explanation || "").trim())) {
      missing.push("a written explanation");
    }
    return missing;
  }

  function renderPanelStatus(contextCode) {
    const pair = currentPair();
    if (!pair) return;
    const panel = panelOf(contextCode);
    const node = panel.querySelector('[data-role="panel-status"]');
    const r = getResponse(pair.pair_id, contextCode);
    const missing = missingFields(r);
    if (!missing.length) {
      node.textContent = "✓ This judgment is complete and saved.";
      node.dataset.state = "complete";
    } else {
      node.textContent = "Still needed: " + missing.join(", ") + ".";
      node.dataset.state = "missing";
    }
  }

  function renderProgress() {
    const done = totalComplete();
    el["progress-done"].textContent = String(done);
    el["progress-total"].textContent = String(TOTAL_JUDGMENTS);
    el["progress-remaining"].textContent =
      done >= TOTAL_JUDGMENTS
        ? "Nothing left to do."
        : (TOTAL_JUDGMENTS - done) + " remaining";
    el["progress-fill"].style.width =
      (TOTAL_JUDGMENTS ? (done / TOTAL_JUDGMENTS) * 100 : 0) + "%";
    renderChips();
    renderFinish();
  }

  function renderChips() {
    const list = el["pair-chips"];
    if (list.childElementCount !== PAIRS.length) {
      list.textContent = "";
      PAIRS.forEach((pair, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.dataset.index = String(i);
        btn.addEventListener("click", () => goToPair(i));
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    PAIRS.forEach((pair, i) => {
      const btn = list.children[i].firstChild;
      const c = pairCompletion(pair.pair_id);
      const status = c.done === c.total ? "complete" : (c.done > 0 ? "partial" : "empty");
      btn.dataset.status = status;
      btn.classList.toggle("is-current", i === state.index);
      btn.innerHTML = '<span class="chip-num">' + (i + 1) + "</span>"
        + '<span class="chip-mark">' + (status === "complete" ? "✓" : c.done + "/" + c.total)
        + "</span>";
      btn.setAttribute("aria-label",
        "Pair " + (i + 1) + ", " + c.done + " of " + c.total + " judgments complete");
      btn.setAttribute("aria-current", i === state.index ? "true" : "false");
    });
  }

  function renderNav() {
    el["btn-prev"].disabled = state.index === 0;
    el["btn-next"].disabled = state.index >= PAIRS.length - 1;
    const pair = currentPair();
    const c = pairCompletion(pair.pair_id);
    el["pair-nav-status"].textContent =
      c.done === c.total
        ? "All three contexts answered for this pair."
        : c.done + " of " + c.total + " contexts answered for this pair.";
  }

  function renderLock() {
    const pair = currentPair();
    if (!pair) return;
    const unlocked = isUnlocked(pair.pair_id);
    const card = document.querySelector(".contexts-card");
    card.classList.toggle("is-locked", !unlocked);
    card.querySelectorAll("input, textarea").forEach((node) => {
      node.disabled = !unlocked;
    });
    el["context-tabs"].querySelectorAll(".tab").forEach((t) => {
      t.disabled = !unlocked;
    });
    let overlay = card.querySelector(".lock-overlay");
    if (!unlocked && !overlay) {
      overlay = document.createElement("div");
      overlay.className = "lock-overlay";
      overlay.innerHTML =
        "<strong>Watch the full video to unlock the questions.</strong>"
        + "<span>Play the clip from start to finish. Replay and speed controls "
        + "are above; you can rewatch as often as you like.</span>";
      card.insertBefore(overlay, card.firstChild);
    } else if (unlocked && overlay) {
      overlay.remove();
    }
  }

  function renderWatch(progress) {
    const pair = currentPair();
    if (!pair) return;
    const w = watchRecord(pair.pair_id);
    w.covered = progress.buckets;
    const wasFull = w.full;
    if (progress.complete) w.full = true;

    const pct = Math.round(progress.fraction * 100);
    if (w.full) {
      el["watch-text"].textContent = "Watched in full";
      el["watch-status"].dataset.state = "full";
    } else if (w.override) {
      el["watch-text"].textContent =
        "Unlocked without full playback (" + pct + "% watched, recorded in the export)";
      el["watch-status"].dataset.state = "override";
    } else {
      el["watch-text"].textContent = pct + "% of the clip watched";
      el["watch-status"].dataset.state = "partial";
    }

    el["btn-watch-override"].hidden =
      !cfg.allowWatchOverride || !state.overrideOffered || w.full || w.override;

    if (!wasFull && w.full) {
      persist(false);
      renderLock();
    }
    /* Coverage is bulky; save it at a coarse cadence rather than every tick. */
    if (progress.complete || pct % 10 === 0) storage.save(state.session);
  }

  /* ------------------------------------------------------------ finishing */

  function outstandingItems() {
    const items = [];
    PAIRS.forEach((pair, i) => {
      schema.CONTEXTS.forEach((c) => {
        const r = getResponse(pair.pair_id, c.code);
        if (!isJudgmentComplete(r)) {
          items.push({
            index: i,
            context: c.code,
            text: "Pair " + (i + 1) + " — " + c.label + ": needs "
                  + missingFields(r).join(", "),
          });
        }
      });
    });
    return items;
  }

  function renderFinish() {
    if (!state.session) return;
    const done = totalComplete();
    const outstanding = outstandingItems();
    const complete = outstanding.length === 0 && TOTAL_JUDGMENTS > 0;

    el["finish-summary"].textContent =
      "Reviewer " + state.session.reviewer_id + ", video set "
      + state.session.assigned_set + ". " + done + " of " + TOTAL_JUDGMENTS
      + " judgments complete across " + PAIRS.length + " pairs and "
      + schema.CONTEXTS.length + " evaluation contexts.";

    el["finish-outstanding"].hidden = complete;
    el["finish-ready"].hidden = !complete;
    el["btn-submit"].disabled = !complete;
    el["btn-export-json"].disabled = !complete;

    const list = el["outstanding-list"];
    list.textContent = "";
    outstanding.slice(0, 40).forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-btn";
      btn.textContent = item.text;
      btn.addEventListener("click", () => {
        goToPair(item.index);
        setContext(item.context);
        showScreen("review");
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    if (outstanding.length > 40) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "… and " + (outstanding.length - 40) + " more.";
      list.appendChild(li);
    }

    if (state.session.submitted_utc) {
      el["submitted-note"].hidden = false;
      el["submitted-note"].textContent =
        "Submitted " + formatStamp(state.session.submitted_utc)
        + ". You can re-export the files at any time.";
    } else {
      el["submitted-note"].hidden = true;
    }
  }

  /* ----------------------------------------------------------- navigation */

  function goToPair(index) {
    if (index < 0 || index >= PAIRS.length) return;
    state.player.pause();
    state.index = index;
    renderPair();
    renderProgress();
    document.querySelector(".pair-header").scrollIntoView(
      { behavior: "smooth", block: "start" });
  }

  /* ---------------------------------------------------------------- wiring */

  function wireSetup() {
    el["study-title"].textContent = cfg.studyTitle;
    el["study-subtitle"].textContent = cfg.studySubtitle;
    document.title = cfg.studyTitle;
    el["instr-pair-count"].textContent = String(PAIRS.length);
    el["progress-total"].textContent = String(TOTAL_JUDGMENTS);
    el["reviewer-id"].placeholder =
      cfg.reviewerIdPrefix + "".padStart(0) + "001";

    if (!storage.HAS_STORAGE) el["storage-warning"].hidden = false;

    el["reviewer-id"].addEventListener("input", refreshSetup);
    el["ack-blinding"].addEventListener("change", refreshSetup);

    el["btn-resume"].addEventListener("click", () => {
      const id = assignment.normalise(el["reviewer-id"].value);
      const saved = storage.load(id);
      if (!saved) return;
      if (!el["ack-blinding"].checked) {
        showSetupError("Please confirm you have read the instructions first.");
        return;
      }
      startSession(saved);
    });

    el["btn-discard"].addEventListener("click", () => {
      const id = assignment.normalise(el["reviewer-id"].value);
      if (!window.confirm(
          "Delete the saved answers for " + id + " in this browser? "
          + "This cannot be undone.")) return;
      storage.remove(id);
      refreshSetup();
    });

    el["setup-form"].addEventListener("submit", (event) => {
      event.preventDefault();
      const id = assignment.normalise(el["reviewer-id"].value);
      if (!assignment.isValidId(id)) {
        showSetupError("Please enter a valid reviewer ID, for example R001.");
        return;
      }
      if (!el["ack-blinding"].checked) {
        showSetupError("Please confirm you have read the instructions.");
        return;
      }
      if (!PAIRS.length) {
        showSetupError("No comparison videos are configured for this page. "
                       + "Contact the study coordinator.");
        return;
      }
      const saved = storage.load(id);
      if (saved) { startSession(saved); return; }
      const a = assignment.assign(id);
      const forced = new URLSearchParams(window.location.search).get("set");
      const mode = (forced === "A" || forced === "B") ? "manual" : "auto";
      if (mode === "manual") a.set = forced;
      startSession(storage.blankSession(id, {
        set: a.set, method: a.method, mode: mode,
      }));
    });

    el["btn-import"].addEventListener("click", () => el["import-file"].click());
    el["import-file"].addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const session = exporter.parseBackup(String(reader.result));
          storage.save(session);
          el["reviewer-id"].value = session.reviewer_id;
          el["ack-blinding"].checked = true;
          refreshSetup();
          showSetupError("Backup loaded for " + session.reviewer_id
                         + ". Choose “Resume it” to continue.", "ok");
        } catch (err) {
          showSetupError("Could not read that backup file: " + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    });
  }

  function showSetupError(message, kind) {
    el["setup-error"].hidden = false;
    el["setup-error"].textContent = message;
    el["setup-error"].classList.toggle("is-ok", kind === "ok");
  }

  function wireReview() {
    state.player = window.REVIEW_PLAYER.create({
      video: el["video"],
      playPause: el["btn-playpause"],
      replay: el["btn-replay"],
      seek: el["seek"],
      seekFill: el["seek-fill"],
      time: el["time-display"],
      rates: el["rates"],
      coverage: el["coverage"],
    }, {
      onProgress: renderWatch,
      onError: () => {
        el["video-error"].hidden = false;
        el["video-error"].textContent =
          "This video could not be loaded. Check that the videos folder is "
          + "present, then reload. If it still fails, tell the study coordinator "
          + "before answering.";
        revealOverride();
      },
    });

    el["btn-watch-override"].addEventListener("click", () => {
      const pair = currentPair();
      if (!pair) return;
      if (!window.confirm(
          "Unlock the questions without watching the whole clip?\n\n"
          + "This is recorded in your export so the coordinator can tell these "
          + "judgments apart. Only do it if the video will not play properly.")) {
        return;
      }
      watchRecord(pair.pair_id).override = true;
      persist();
      renderLock();
      renderWatch({
        buckets: state.player.getBuckets(),
        fraction: state.player.getFraction(),
        complete: state.player.isComplete(),
      });
    });

    el["btn-prev"].addEventListener("click", () => goToPair(state.index - 1));
    el["btn-next"].addEventListener("click", () => goToPair(state.index + 1));
    el["btn-goto-finish"].addEventListener("click", () => {
      state.player.pause();
      renderFinish();
      showScreen("finish");
    });
    el["btn-back-to-review"].addEventListener("click", () => showScreen("review"));

    el["btn-quick-backup"].addEventListener("click", () => {
      exporter.downloadJson(state.session, PAIRS);
    });

    el["btn-exit"].addEventListener("click", () => {
      if (!window.confirm(
          "Leave this session? Your answers stay saved in this browser under "
          + state.session.reviewer_id + ".")) return;
      state.player.pause();
      state.session = null;
      el["session-badges"].hidden = true;
      el["btn-quick-backup"].hidden = true;
      el["btn-exit"].hidden = true;
      el["ack-blinding"].checked = false;
      refreshSetup();
      showScreen("setup");
    });

    el["btn-submit"].addEventListener("click", () => {
      if (outstandingItems().length) return;
      state.session.submitted_utc = storage.nowUtc();
      persist();
      exporter.downloadCsv(state.session, PAIRS);
      renderFinish();
    });

    el["btn-export-json"].addEventListener("click", () => {
      exporter.downloadJson(state.session, PAIRS);
    });

    document.addEventListener("keydown", (event) => {
      if (el["screen-review"].hidden || !state.session) return;
      const t = event.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                || t.tagName === "SELECT" || t.isContentEditable)) return;
      switch (event.key) {
        case " ": event.preventDefault(); state.player.togglePlay(); break;
        case "r": case "R": state.player.replay(); break;
        case "ArrowLeft": event.preventDefault(); state.player.nudge(-2); break;
        case "ArrowRight": event.preventDefault(); state.player.nudge(2); break;
        case "[": goToPair(state.index - 1); break;
        case "]": goToPair(state.index + 1); break;
        default: break;
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.session || storage.HAS_STORAGE) return;
      if (!Object.keys(state.session.responses).length) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    wireSetup();
    buildContextUi();
    wireReview();
    refreshSetup();

    if (!PAIRS.length) {
      showSetupError("No comparison videos are configured. Run "
                     + "scripts/make_pairs_manifest.py to build the pair list.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
