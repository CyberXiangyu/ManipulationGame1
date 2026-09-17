/* Per-reviewer session state in localStorage, written on every change.

   One record per reviewer ID, so several reviewers can use the same browser
   without overwriting each other. Shape:

   {
     schema_version, reviewer_id, assigned_set, assignment_method,
     assignment_mode: "auto" | "manual",
     started_utc, updated_utc, submitted_utc,
     watch: { pair_001: { covered: [0,1,...], full: true } },
     responses: { "pair_001|balanced": { ... } }
   } */
window.REVIEW_STORAGE = (function () {
  "use strict";

  const cfg = window.REVIEW_CONFIG;

  function available() {
    try {
      const probe = "__probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  const HAS_STORAGE = available();

  const keyFor = (reviewerId) => cfg.storageNamespace + ":" + reviewerId;

  function nowUtc() {
    return new Date().toISOString();
  }

  function blankSession(reviewerId, assignment) {
    return {
      schema_version: cfg.schemaVersion,
      reviewer_id: reviewerId,
      assigned_set: assignment.set,
      assignment_method: assignment.method,
      assignment_mode: assignment.mode || "auto",
      started_utc: nowUtc(),
      updated_utc: nowUtc(),
      submitted_utc: null,
      watch: {},
      responses: {},
    };
  }

  function load(reviewerId) {
    if (!HAS_STORAGE) return null;
    try {
      const raw = window.localStorage.getItem(keyFor(reviewerId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.reviewer_id ? parsed : null;
    } catch (err) {
      console.warn("could not read saved session", err);
      return null;
    }
  }

  function save(session) {
    if (!session) return false;
    session.updated_utc = nowUtc();
    if (!HAS_STORAGE) return false;
    try {
      window.localStorage.setItem(keyFor(session.reviewer_id),
                                  JSON.stringify(session));
      return true;
    } catch (err) {
      console.warn("could not save session", err);
      return false;
    }
  }

  function listSessions() {
    if (!HAS_STORAGE) return [];
    const prefix = cfg.storageNamespace + ":";
    const out = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.indexOf(prefix) === 0) {
        try {
          const s = JSON.parse(window.localStorage.getItem(key));
          if (s && s.reviewer_id) out.push(s);
        } catch (err) { /* ignore unreadable entries */ }
      }
    }
    return out.sort((a, b) => String(b.updated_utc).localeCompare(a.updated_utc));
  }

  function remove(reviewerId) {
    if (!HAS_STORAGE) return;
    try {
      window.localStorage.removeItem(keyFor(reviewerId));
    } catch (err) { /* nothing useful to do */ }
  }

  return { HAS_STORAGE, blankSession, load, save, listSessions, remove, nowUtc };
})();
