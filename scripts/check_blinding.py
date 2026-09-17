#!/usr/bin/env python3
"""Fail if anything that could unblind reviewers is about to be published.

Run this before every commit and before every deploy::

    python3 scripts/check_blinding.py

Three classes of check:

1. Structural -- file names and directories that, in this project's layout,
   only ever hold unblinding material (private manifests, annotated videos,
   metric tables, per-candidate trace dumps).
2. Content -- tracked text files are scanned for the word shapes used by
   controller/strategy identifiers and by result tables.
3. Local denylist -- if a file named ``blinding_denylist.txt`` exists next to
   this script it is read line by line and every non-empty, non-``#`` line is
   treated as a forbidden substring. That file is git-ignored on purpose: put
   the real controller names in it so they are checked for but never committed.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

FORBIDDEN_NAME_PATTERNS = [
    (re.compile(r"private", re.I), "file name suggests a private/unblinding manifest"),
    (re.compile(r"annotated", re.I), "annotated media reveal strategy identity"),
    (re.compile(r"candidate_metrics", re.I), "per-candidate metric table"),
    (re.compile(r"(^|[_/])metrics?[_.]", re.I), "metric table"),
    (re.compile(r"branch_state_audit", re.I), "audit file keyed by candidate"),
    (re.compile(r"(^|[_/])(scientific|comparison)_", re.I), "non-blind comparison media"),
]

# Word shapes that identify a controller/strategy rather than a pair.
FORBIDDEN_CONTENT_PATTERNS = [
    (re.compile(r"\bseed\d+_[A-Za-z]\w*\b"), "candidate identifier (seedNN_X_name)"),
    # An explicit assignment of an option to a code-like identifier. Prose such
    # as "Option 1 is the left video" is public and must not trip this.
    (re.compile(r"\b(?:option|left|right)[_ ]?(?:1|2)\b\s*(?:=|->|\u2192)\s*"
                r"[\"']?[A-Za-z][\w-]*_[\w-]+", re.I),
     "explicit option -> strategy mapping"),
    (re.compile(r"\bsuccess[_ ]rate\b", re.I), "success metric"),
    (re.compile(r"\b(?:mean|max|min)[_ ](?:force|clearance|time|jerk)\b", re.I),
     "performance metric"),
]

SKIP_DIRS = {".git", "node_modules", "__pycache__"}
TEXT_SUFFIXES = {".html", ".js", ".css", ".json", ".md", ".csv", ".txt", ".py",
                 ".sh", ".yml", ".yaml"}

# This file necessarily contains the patterns it searches for.
SELF = Path(__file__).resolve()


def redact(text: str) -> str:
    """Mask a match so failure output can be pasted into a public CI log.

    The whole point of this script is that these strings must not become
    public; printing them verbatim in a failure message would defeat it.
    """
    text = text.strip()
    if len(text) <= 4:
        return "*" * len(text)
    return text[:2] + "*" * (len(text) - 4) + text[-2:]


def tracked_files() -> tuple[list[Path], bool]:
    """Files git would publish, and whether git actually answered.

    ``git ls-files -co --exclude-standard`` lists tracked and untracked files
    while honouring .gitignore, which is exactly the set a push would expose.
    Outside a checkout we fall back to walking the tree, and the caller then
    knows not to treat git-ignored paths as publishable.
    """
    try:
        out = subprocess.run(["git", "-C", str(REPO), "ls-files", "-co",
                              "--exclude-standard"],
                             capture_output=True, text=True, check=True).stdout
        return [REPO / line for line in out.splitlines() if line.strip()], True
    except (OSError, subprocess.CalledProcessError):
        return [p for p in REPO.rglob("*")
                if p.is_file() and not SKIP_DIRS & set(p.relative_to(REPO).parts)], False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--show-matches", action="store_true",
                    help="print matched text in full instead of masking it. "
                         "Local debugging only -- never in CI, whose logs may "
                         "be public.")
    args = ap.parse_args()

    denylist_path = REPO / "scripts" / "blinding_denylist.txt"
    denylist: list[str] = []
    if denylist_path.exists():
        denylist = [ln.strip() for ln in
                    denylist_path.read_text(encoding="utf-8").splitlines()
                    if ln.strip() and not ln.lstrip().startswith("#")]

    problems: list[str] = []
    files, from_git = tracked_files()

    for path in files:
        if not path.is_file():
            continue
        rel = path.relative_to(REPO).as_posix()
        if rel.startswith("scripts/blinding_denylist"):
            # Inside a checkout this file should have been filtered out by
            # .gitignore, so seeing it here means it is about to be published.
            if from_git:
                problems.append(f"{rel}: the local denylist must never be committed")
            continue

        for pattern, why in FORBIDDEN_NAME_PATTERNS:
            if pattern.search(rel):
                problems.append(f"{rel}: {why}")

        if path.resolve() == SELF or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for pattern, why in FORBIDDEN_CONTENT_PATTERNS:
            for m in pattern.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                shown = m.group(0) if args.show_matches else redact(m.group(0))
                problems.append(f"{rel}:{line}: {why} -- matched {shown!r}")

        lowered = text.lower()
        for term in denylist:
            idx = lowered.find(term.lower())
            if idx >= 0:
                line = text.count("\n", 0, idx) + 1
                problems.append(f"{rel}:{line}: denylisted term from "
                                f"scripts/blinding_denylist.txt")

    if problems:
        print("BLINDING CHECK FAILED", file=sys.stderr)
        for p in sorted(set(problems)):
            print(f"  {p}", file=sys.stderr)
        print(f"\n{len(set(problems))} problem(s). Nothing was modified.",
              file=sys.stderr)
        if not args.show_matches:
            print("Matched text is masked so this output is safe to paste. "
                  "Use --show-matches locally to see it in full.", file=sys.stderr)
        return 1

    note = "" if denylist else " (no local denylist found -- see script docstring)"
    print(f"blinding check passed: {len(files)} file(s) scanned{note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
