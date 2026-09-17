/* CSV and JSON export, plus JSON restore.

   The first eleven CSV columns are exactly those of the study's
   preference label template, in the same order, so exported files drop
   straight into existing analysis code. Provenance columns are appended
   after them. */
window.REVIEW_EXPORT = (function () {
  "use strict";

  const cfg = window.REVIEW_CONFIG;
  const schema = window.REVIEW_SCHEMA;

  const COLUMNS = [
    "pair_id",
    "seed",
    "preference_context",
    "ordinal_label",
    "confidence_1_to_5",
    "reason_codes",
    "pivotal_stage",
    "natural_language_reason",
    "comparable_yes_no",
    "reviewer_id",
    "review_date",
    /* appended provenance */
    "assigned_set",
    "assignment_method",
    "assignment_mode",
    "watched_full_video",
    "video_file",
    "response_updated_utc",
    "schema_version",
  ];

  function csvCell(value) {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function dateOnly(isoString) {
    return String(isoString || "").slice(0, 10);
  }

  /* One row per (pair, context); pairs without an answer still emit a row with
     empty response fields, so a partial export is still a complete grid. */
  function toRows(session, pairs) {
    const rows = [];
    pairs.forEach((pair) => {
      schema.CONTEXTS.forEach((context) => {
        const key = pair.pair_id + "|" + context.code;
        const r = session.responses[key] || {};
        const answered = !!r.preference;
        rows.push({
          pair_id: pair.pair_id,
          seed: pair.seed || "",
          preference_context: context.code,
          ordinal_label: r.preference || "",
          confidence_1_to_5: r.confidence || "",
          reason_codes: (r.reasons || []).join(";"),
          pivotal_stage: r.stage || "",
          natural_language_reason: r.explanation || "",
          comparable_yes_no: answered ? schema.comparability(r.preference) : "",
          reviewer_id: session.reviewer_id,
          review_date: dateOnly(r.updated_utc || session.updated_utc),
          assigned_set: session.assigned_set,
          assignment_method: session.assignment_method || "",
          assignment_mode: session.assignment_mode || "auto",
          watched_full_video: (session.watch[pair.pair_id] || {}).full ? "true" : "false",
          video_file: pair.video[session.assigned_set] || "",
          response_updated_utc: r.updated_utc || "",
          schema_version: cfg.schemaVersion,
        });
      });
    });
    return rows;
  }

  function toCsv(session, pairs) {
    const rows = toRows(session, pairs);
    const lines = [COLUMNS.join(",")];
    rows.forEach((row) => {
      lines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function toJson(session, pairs) {
    return JSON.stringify({
      schema_version: cfg.schemaVersion,
      exported_utc: new Date().toISOString(),
      study: cfg.studyTitle,
      reviewer: {
        reviewer_id: session.reviewer_id,
        assigned_set: session.assigned_set,
        assignment_method: session.assignment_method,
        assignment_mode: session.assignment_mode || "auto",
        started_utc: session.started_utc,
        updated_utc: session.updated_utc,
        submitted_utc: session.submitted_utc,
      },
      instrument: {
        contexts: schema.CONTEXTS.map((c) => c.code),
        preferences: schema.PREFERENCES.map((p) => p.code),
        reasons: schema.REASONS.map((r) => r.code),
        stages: schema.STAGES.map((s) => s.code),
        confidence_scale: schema.CONFIDENCE,
      },
      pairs: pairs.map((p) => ({
        pair_id: p.pair_id,
        seed: p.seed,
        duration_s: p.duration_s,
        video_file: p.video[session.assigned_set] || "",
        watch: session.watch[p.pair_id] || null,
      })),
      responses: toRows(session, pairs),
      raw_session: session,
    }, null, 2);
  }

  function slugDate() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCsv(session, pairs) {
    download("preference_labels_" + session.reviewer_id + "_" + slugDate() + ".csv",
             toCsv(session, pairs), "text/csv");
  }

  function downloadJson(session, pairs) {
    download("preference_backup_" + session.reviewer_id + "_" + slugDate() + ".json",
             toJson(session, pairs), "application/json");
  }

  /* Accepts a file produced by downloadJson and returns the session it holds. */
  function parseBackup(text) {
    const data = JSON.parse(text);
    const session = data.raw_session || data;
    if (!session || !session.reviewer_id || !session.responses) {
      throw new Error("This file does not look like a review backup.");
    }
    session.watch = session.watch || {};
    return session;
  }

  return { COLUMNS, toRows, toCsv, toJson, downloadCsv, downloadJson, parseBackup };
})();
