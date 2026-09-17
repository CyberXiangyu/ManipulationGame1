#!/usr/bin/env python3
"""Validate and merge reviewer CSV exports.

    python3 tools/validate_responses.py responses/*.csv
    python3 tools/validate_responses.py responses/*.csv --merge all_responses.csv

Checks each file for: the expected column set, one row per (pair, context),
valid codes in every closed field, confidence in 1..5, a consistent
comparable_yes_no, and a single reviewer ID and assigned set per file. Exits
non-zero if any file has errors, so it can gate an analysis pipeline.

Run it on the files reviewers send you, before the mapping is unblinded.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

REQUIRED_COLUMNS = [
    "pair_id", "seed", "preference_context", "ordinal_label",
    "confidence_1_to_5", "reason_codes", "pivotal_stage",
    "natural_language_reason", "comparable_yes_no", "reviewer_id", "review_date",
]

CONTEXTS = {"balanced", "safety_priority", "efficiency_priority"}

PREFERENCES = {
    "STRONGLY_OPTION_1", "SLIGHTLY_OPTION_1", "TIE",
    "SLIGHTLY_OPTION_2", "STRONGLY_OPTION_2", "INCOMPARABLE",
}

REASONS = {
    "SAFETY_MARGIN", "LOWER_FORCE", "FASTER", "SHORTER_PATH", "NO_DOOR_TOUCH",
    "SMOOTHER", "FEWER_RECOVERIES", "BETTER_FINAL_POSE", "LEGIBLE",
    "LESS_UNNECESSARY_MOTION", "BETTER_BASE_ARM_COORDINATION",
    "NO_MEANINGFUL_DIFFERENCE",
}

STAGES = {
    "WHOLE_TASK", "INITIAL_NAVIGATION", "OBJECT_APPROACH", "DOOR_INTERACTION",
    "OBJECT_GRASP", "BASE_REPOSITION", "OBJECT_TRANSPORT", "CABINET_APPROACH",
    "OBJECT_PLACEMENT", "RECOVERY_BEHAVIOR", "FINAL_ROBOT_POSE",
}


def check_file(path: Path) -> tuple[list[dict], list[str], list[str]]:
    """Return (rows, errors, warnings) for one exported CSV."""
    errors: list[str] = []
    warnings: list[str] = []

    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        columns = reader.fieldnames or []

    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        errors.append(f"missing column(s): {', '.join(missing)}")
        return rows, errors, warnings

    reviewers = {r["reviewer_id"].strip() for r in rows if r["reviewer_id"].strip()}
    if len(reviewers) > 1:
        errors.append(f"more than one reviewer_id in one file: {sorted(reviewers)}")
    if "assigned_set" in columns:
        sets = {r["assigned_set"].strip() for r in rows if r.get("assigned_set", "").strip()}
        if len(sets) > 1:
            errors.append(f"more than one assigned_set in one file: {sorted(sets)}")

    seen: Counter[tuple[str, str]] = Counter()
    blank = 0

    for n, row in enumerate(rows, start=2):
        where = f"row {n}"
        pair = row["pair_id"].strip()
        context = row["preference_context"].strip()
        label = row["ordinal_label"].strip()

        if not pair:
            errors.append(f"{where}: empty pair_id")
            continue
        if context not in CONTEXTS:
            errors.append(f"{where}: unknown preference_context {context!r}")
        seen[(pair, context)] += 1

        if not label:
            blank += 1
            continue

        if label not in PREFERENCES:
            errors.append(f"{where}: unknown ordinal_label {label!r}")

        conf = row["confidence_1_to_5"].strip()
        if conf not in {"1", "2", "3", "4", "5"}:
            errors.append(f"{where}: confidence_1_to_5 must be 1-5, got {conf!r}")

        codes = [c.strip() for c in row["reason_codes"].split(";") if c.strip()]
        if not codes:
            errors.append(f"{where}: no reason codes")
        for code in codes:
            if code not in REASONS:
                errors.append(f"{where}: unknown reason code {code!r}")
        if "NO_MEANINGFUL_DIFFERENCE" in codes and len(codes) > 1:
            errors.append(f"{where}: NO_MEANINGFUL_DIFFERENCE combined with other reasons")

        stage = row["pivotal_stage"].strip()
        if stage not in STAGES:
            errors.append(f"{where}: unknown pivotal_stage {stage!r}")

        expected = "no" if label == "INCOMPARABLE" else "yes"
        actual = row["comparable_yes_no"].strip().lower()
        if actual and actual != expected:
            errors.append(f"{where}: comparable_yes_no is {actual!r}, "
                          f"expected {expected!r} for {label}")

        if not row["natural_language_reason"].strip():
            warnings.append(f"{where}: no written explanation")

    duplicates = [k for k, v in seen.items() if v > 1]
    if duplicates:
        errors.append("duplicate (pair_id, context) rows: "
                      + ", ".join(f"{p}/{c}" for p, c in sorted(duplicates)[:10]))

    if blank:
        errors.append(f"{blank} row(s) have no ordinal_label (incomplete submission)")

    pairs = sorted({r["pair_id"].strip() for r in rows if r["pair_id"].strip()})
    for pair in pairs:
        got = {c for (p, c) in seen if p == pair}
        if got != CONTEXTS:
            errors.append(f"{pair}: missing context(s) {sorted(CONTEXTS - got)}")

    return rows, errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_files", nargs="+", type=Path)
    ap.add_argument("--merge", type=Path, default=None,
                    help="write all valid rows into one combined CSV")
    ap.add_argument("--quiet-warnings", action="store_true")
    args = ap.parse_args()

    all_rows: list[dict] = []
    all_columns: list[str] = []
    failed = 0
    by_reviewer: dict[str, int] = defaultdict(int)
    by_set: Counter[str] = Counter()

    for path in args.csv_files:
        if not path.exists():
            print(f"{path}: does not exist")
            failed += 1
            continue
        rows, errors, warnings = check_file(path)
        label = f"{path.name} ({len(rows)} rows)"
        if errors:
            failed += 1
            print(f"FAIL  {label}")
            for e in errors:
                print(f"        {e}")
        else:
            print(f"ok    {label}")
            all_rows.extend(rows)
            for row in rows:
                by_reviewer[row["reviewer_id"].strip()] += 1
                by_set[row.get("assigned_set", "?").strip() or "?"] += 1
            if rows and not all_columns:
                all_columns = list(rows[0].keys())
        if warnings and not args.quiet_warnings:
            for w in warnings[:5]:
                print(f"        note: {w}")
            if len(warnings) > 5:
                print(f"        note: ... {len(warnings) - 5} more")

    print()
    if by_reviewer:
        print(f"{len(by_reviewer)} reviewer(s): "
              + ", ".join(f"{k} ({v} rows)" for k, v in sorted(by_reviewer.items())))
        print("rows per assigned set: "
              + ", ".join(f"{k}={v}" for k, v in sorted(by_set.items())))
        a, b = by_set.get("A", 0), by_set.get("B", 0)
        if a and b and abs(a - b) > max(a, b) * 0.34:
            print("note: the two counterbalanced sets are unevenly represented")

    if args.merge and all_rows:
        with args.merge.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=all_columns)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f"merged {len(all_rows)} rows into {args.merge}")

    if failed:
        print(f"\n{failed} file(s) failed validation")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
