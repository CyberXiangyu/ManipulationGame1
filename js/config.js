/* Study-level settings. Safe to edit; nothing here may identify a strategy. */
window.REVIEW_CONFIG = {
  studyTitle: "Blinded preference review",
  studySubtitle: "Pairwise comparison of robot manipulation behaviours",

  /* Where the videos live. Keep "videos/" to serve them from this repository,
     or point at any other base (release asset, object store, CDN) to keep the
     repository small. Must end with a slash. */
  videoBaseUrl: "videos/",

  /* Playback rates offered in the player, and the default. */
  playbackRates: [0.25, 0.5, 1, 1.5, 2],
  defaultPlaybackRate: 1,

  /* Fraction of the timeline that must actually be played before the answer
     form for a pair unlocks. 1 = every second. */
  requiredWatchFraction: 0.98,

  /* Let a reviewer unlock the form without full playback (recorded as
     watched_full_video=false so it can be filtered during analysis).
     Set to false to make full playback mandatory. */
  allowWatchOverride: true,

  /* Require the free-text explanation as well as the closed-form fields. */
  requireExplanation: false,

  /* Minimum number of reason codes per judgment. */
  minReasons: 1,

  /* Prefix + width used when generating suggested reviewer IDs (R001...). */
  reviewerIdPrefix: "R",
  reviewerIdDigits: 3,

  /* Storage namespace. Bump to invalidate previously saved sessions. */
  storageNamespace: "blind-preference-review:v1",

  /* Written into every exported row. */
  schemaVersion: "blind_preference_responses_v1",
};
