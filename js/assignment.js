/* Counterbalanced assignment of a reviewer ID to video set A or B.
   Deterministic: the same ID always yields the same set, on any machine, so a
   reviewer can resume in another browser without changing what they watch.

   Set A and set B contain the same rollouts with left/right reversed, so
   alternating reviewers across the two sets cancels any side bias. */
window.REVIEW_ASSIGNMENT = (function () {
  "use strict";

  const TRAILING_NUMBER = /^[A-Za-z._-]*?(\d+)\s*$/;

  /* FNV-1a, 32-bit. Small, stable, and good enough to spread free-form IDs. */
  function hash32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function normalise(reviewerId) {
    return String(reviewerId || "").trim().toUpperCase();
  }

  /* Returns { set: "A"|"B", method: "sequence"|"hash" }.
     IDs ending in a number alternate strictly (R001 -> A, R002 -> B, ...),
     which is what keeps the design counterbalanced when IDs are handed out in
     order. Anything else falls back to a hash so the page never refuses an ID. */
  function assign(reviewerId) {
    const id = normalise(reviewerId);
    const m = TRAILING_NUMBER.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      return { set: n % 2 === 1 ? "A" : "B", method: "sequence" };
    }
    return { set: hash32(id) % 2 === 0 ? "A" : "B", method: "hash" };
  }

  function isValidId(reviewerId) {
    const id = normalise(reviewerId);
    return /^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(id);
  }

  function suggestId(prefix, digits) {
    const n = 1 + Math.floor(Math.random() * (Math.pow(10, digits) - 1));
    return prefix + String(n).padStart(digits, "0");
  }

  return { assign, isValidId, normalise, suggestId, hash32 };
})();
