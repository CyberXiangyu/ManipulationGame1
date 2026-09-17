/* The response instrument: contexts, scales and code lists.
   Codes are what land in the CSV; labels are what reviewers read. */
window.REVIEW_SCHEMA = (function () {
  "use strict";

  const CONTEXTS = [
    {
      code: "balanced",
      label: "Balanced",
      short: "Balanced",
      guidance:
        "Weigh safety, efficiency, motion smoothness and task quality together. " +
        "No single criterion dominates: judge which behaviour you would rather " +
        "deploy overall.",
    },
    {
      code: "safety_priority",
      label: "Safety priority",
      short: "Safety",
      guidance:
        "Prioritise obstacle clearance, low contact force, stability, and fewer " +
        "risky recoveries. Speed matters only as a tie-breaker between behaviours " +
        "you consider equally safe.",
    },
    {
      code: "efficiency_priority",
      label: "Efficiency priority",
      short: "Efficiency",
      guidance:
        "Prioritise completion time, direct movement, shorter paths and fewer " +
        "unnecessary actions — provided the behaviour still looks acceptably safe. " +
        "A faster behaviour that looks unsafe should not win here.",
    },
  ];

  const PREFERENCES = [
    { code: "STRONGLY_OPTION_1", label: "Strongly prefer Option 1", side: 1, strength: 2 },
    { code: "SLIGHTLY_OPTION_1", label: "Slightly prefer Option 1", side: 1, strength: 1 },
    { code: "TIE", label: "Tie", side: 0, strength: 0,
      hint: "The two behaviours are approximately equally desirable." },
    { code: "SLIGHTLY_OPTION_2", label: "Slightly prefer Option 2", side: 2, strength: 1 },
    { code: "STRONGLY_OPTION_2", label: "Strongly prefer Option 2", side: 2, strength: 2 },
    { code: "INCOMPARABLE", label: "Incomparable", side: null, strength: null,
      hint: "Each behaviour has important advantages and no defensible overall " +
            "ranking exists." },
  ];

  const CONFIDENCE = [
    { value: 1, label: "Very uncertain" },
    { value: 2, label: "Uncertain" },
    { value: 3, label: "Moderately confident" },
    { value: 4, label: "Confident" },
    { value: 5, label: "Very confident" },
  ];

  const REASONS = [
    { code: "SAFETY_MARGIN", label: "Larger safety margin" },
    { code: "LOWER_FORCE", label: "Lower contact force" },
    { code: "FASTER", label: "Faster completion" },
    { code: "SHORTER_PATH", label: "Shorter robot or base path" },
    { code: "NO_DOOR_TOUCH", label: "Avoids touching the cabinet door" },
    { code: "SMOOTHER", label: "Smoother motion" },
    { code: "FEWER_RECOVERIES", label: "Fewer stops or recovery actions" },
    { code: "BETTER_FINAL_POSE", label: "Better final object placement" },
    { code: "LEGIBLE", label: "Easier-to-understand behaviour" },
    { code: "LESS_UNNECESSARY_MOTION", label: "Less unnecessary movement" },
    { code: "BETTER_BASE_ARM_COORDINATION", label: "Better coordination between the base and arm" },
    { code: "NO_MEANINGFUL_DIFFERENCE", label: "No meaningful difference", exclusive: true },
  ];

  const STAGES = [
    { code: "WHOLE_TASK", label: "Whole task" },
    { code: "INITIAL_NAVIGATION", label: "Initial navigation" },
    { code: "OBJECT_APPROACH", label: "Approach to the object" },
    { code: "DOOR_INTERACTION", label: "Door interaction" },
    { code: "OBJECT_GRASP", label: "Object grasping" },
    { code: "BASE_REPOSITION", label: "Base repositioning" },
    { code: "OBJECT_TRANSPORT", label: "Object transportation" },
    { code: "CABINET_APPROACH", label: "Cabinet approach" },
    { code: "OBJECT_PLACEMENT", label: "Object placement" },
    { code: "RECOVERY_BEHAVIOR", label: "Recovery behaviour" },
    { code: "FINAL_ROBOT_POSE", label: "Final robot pose" },
  ];

  const byCode = (list) =>
    list.reduce((acc, item) => { acc[item.code] = item; return acc; }, {});

  return {
    CONTEXTS,
    PREFERENCES,
    CONFIDENCE,
    REASONS,
    STAGES,
    preferenceByCode: byCode(PREFERENCES),
    reasonByCode: byCode(REASONS),
    stageByCode: byCode(STAGES),
    /* comparable_yes_no column in the exported CSV. */
    comparability: (preferenceCode) =>
      preferenceCode === "INCOMPARABLE" ? "no" : "yes",
  };
})();
