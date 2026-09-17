# Blinded preference review

A self-contained static webpage for collecting blinded pairwise human
preferences between two robot manipulation behaviours. Reviewers watch
side-by-side comparison videos and judge each pair three times — once under a
balanced brief, once prioritising safety, once prioritising efficiency — then
export their responses as CSV and a JSON backup.

No build step, no server, no database, no analytics. Plain HTML, CSS and
JavaScript; answers live in the reviewer's browser until they export them.

---

## Quick start

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk also
works — the page deliberately avoids `fetch()` so it runs from a `file://` URL,
which is useful for reviewers working offline.

## Publishing on GitHub

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then in **Settings → Pages**, set *Source* to **GitHub Actions**. The included
workflow (`.github/workflows/pages.yml`) runs the blinding check first and
refuses to deploy if it fails.

A public Pages site is readable by anyone with the URL. If the videos are not
meant to be public, either keep the repository private and use Pages on a plan
that supports private sites, or host the site privately and serve the videos
from an access-controlled location via `videoBaseUrl` (see *Configuration*).

---

## Repository layout

```
index.html                      the whole page
assets/style.css
js/config.js                    study settings you may want to change
js/schema.js                    contexts, scales and code lists
js/pairs.js                     generated pair manifest (also data/pairs.json)
js/assignment.js                reviewer ID -> counterbalanced set
js/storage.js                   localStorage session handling
js/player.js                    transport controls + playback coverage
js/export.js                    CSV / JSON export and restore
js/app.js                       application controller
videos/set_A/pair_XXX.mp4       counterbalanced video sets
videos/set_B/pair_XXX.mp4
scripts/import_videos.sh        copy videos in and rebuild the manifest
scripts/make_pairs_manifest.py  build data/pairs.json and js/pairs.js
scripts/check_blinding.py       refuse to publish unblinding material
tools/validate_responses.py     validate and merge reviewer exports
REVIEWER_GUIDE.md               hand this to reviewers
```

---

## Videos

Each pair is **one** file showing both behaviours side by side:
**Option 1 is the left half of the frame, Option 2 is the right half.**

`set_A` and `set_B` contain the same rollouts with the sides swapped. Reviewers
are assigned to one set or the other, which cancels any systematic preference
for one side of the screen. A reviewer only ever sees one set.

To (re)import videos and rebuild the manifest:

```bash
./scripts/import_videos.sh /path/to/review_pairs /path/to/preference_labels_template.csv
```

The first argument is a directory containing `set_A/` and `set_B/`. The second
is optional and only supplies the `seed` column; any CSV with `pair_id` and
`seed` columns works. The script copies `pair_*.mp4` only — annotated videos,
metric tables and private manifests are never touched.

### Keeping videos out of the repository

Set `videoBaseUrl` in `js/config.js` to any base URL (a release asset, an object
store, an access-controlled host) and delete `videos/`. The page requests
`<videoBaseUrl>set_A/pair_001.mp4` and so on, so the directory layout must be
preserved at that location.

---

## Configuration

All study-level settings live in `js/config.js`:

| Setting | Default | Effect |
| --- | --- | --- |
| `videoBaseUrl` | `"videos/"` | Where videos are fetched from. Must end with `/`. |
| `playbackRates` | `0.25`–`2` | Speeds offered in the player. |
| `requiredWatchFraction` | `0.98` | Share of the timeline that must actually be played before the questions unlock. |
| `allowWatchOverride` | `true` | Offer an escape hatch when playback is broken. Set `false` to make full playback mandatory. |
| `requireExplanation` | `false` | Make the free-text field mandatory. |
| `minReasons` | `1` | Minimum reason codes per judgment. |
| `storageNamespace` | `…:v1` | Bump to invalidate saved sessions. |

The instrument itself — contexts, preference options, confidence scale, reason
codes, task stages — is in `js/schema.js`. Codes there are what appear in the
CSV, so changing them mid-study will split your data.

---

## Reviewer assignment

Assignment is deterministic, so the same ID always yields the same set on any
machine:

- IDs ending in a number alternate strictly: `R001` → set A, `R002` → set B,
  `R003` → set A, and so on. Hand IDs out in order to stay counterbalanced.
- Any other ID falls back to a hash of the ID, recorded as
  `assignment_method=hash`.

Appending `?set=A` or `?set=B` to the URL forces a set. Use it only to repair a
mistake: every affected row is exported with `assignment_mode=manual` so those
judgments can be identified during analysis.

---

## What reviewers do

1. Enter an anonymous reviewer ID and read the instructions.
2. For each of the pairs, watch the full clip. The question form stays locked
   until playback has actually covered the whole timeline — seeking past a
   section leaves it uncovered, so skipping to the end does not unlock anything.
3. Answer under all three contexts. Each judgment needs a preference, a
   confidence rating (1–5), at least one reason code, and the pivotal task
   stage. A short written observation is optional by default.
4. Submit, which is blocked until every judgment is complete, and send the
   coordinator the exported CSV and JSON.

Answers save to `localStorage` on every keystroke and click. A reviewer can
close the tab and resume with the same ID, or move machines by exporting a JSON
backup and restoring it from the setup screen.

---

## Exported data

One CSV row per (pair, evaluation context). The first eleven columns match the
study's `preference_labels_template.csv` exactly and in order; provenance
columns are appended after them.

| Column | Notes |
| --- | --- |
| `pair_id` | e.g. `pair_001` |
| `seed` | scenario seed, from the manifest |
| `preference_context` | `balanced`, `safety_priority`, `efficiency_priority` |
| `ordinal_label` | `STRONGLY_OPTION_1`, `SLIGHTLY_OPTION_1`, `TIE`, `SLIGHTLY_OPTION_2`, `STRONGLY_OPTION_2`, `INCOMPARABLE` |
| `confidence_1_to_5` | 1 very uncertain … 5 very confident |
| `reason_codes` | `;`-separated |
| `pivotal_stage` | single stage code |
| `natural_language_reason` | free text |
| `comparable_yes_no` | `no` only for `INCOMPARABLE` |
| `reviewer_id` | anonymous ID |
| `review_date` | UTC date the judgment was last edited |
| `assigned_set` | `A` or `B` |
| `assignment_method` | `sequence` or `hash` |
| `assignment_mode` | `auto`, or `manual` if the set was forced by URL |
| `watched_full_video` | `false` if the reviewer used the playback override |
| `video_file` | exact file that reviewer saw |
| `response_updated_utc` | ISO 8601 timestamp |
| `schema_version` | from `js/config.js` |

`TIE` and `INCOMPARABLE` are distinct and must not be collapsed: `TIE` means
approximately equally desirable, `INCOMPARABLE` means each behaviour has
important advantages and no defensible overall ranking exists.

### Validating what comes back

```bash
python3 tools/validate_responses.py responses/*.csv --merge responses/all.csv
```

Checks columns, completeness, code validity, confidence range, the
`NO_MEANINGFUL_DIFFERENCE` exclusivity rule, duplicate rows, and the
`comparable_yes_no` / `INCOMPARABLE` relationship. Exits non-zero on any error,
so it can gate an analysis pipeline. It also reports the A/B split and flags a
lopsided one.

---

## Blinding

The page has no access to controller names, strategy descriptions, metrics, or
the option → algorithm mapping. The manifest it loads carries only pair IDs,
seeds, durations and file names, and nothing in the exported data can recover
the mapping. Keeping it that way is enforced in three layers:

1. **`.gitignore`** blocks private manifests, metric tables, annotated media,
   diagnostics and collected responses by pattern.
2. **`scripts/check_blinding.py`** scans everything git would publish for
   unblinding file names and content, and fails loudly. It runs automatically
   inside `import_videos.sh` and in CI before deploying.
3. **A local denylist** at `scripts/blinding_denylist.txt` — git-ignored, and
   the checker fails if it is ever committed. Put the real controller and
   strategy identifiers in it, one per line:

   ```
   # one forbidden substring per line, case-insensitive
   my_controller_variant_a
   my_controller_variant_b
   ```

   Use full, distinctive identifiers. Do not add bare English words a strategy
   name happens to contain — they will match ordinary interface copy.

Run it any time, and always before pushing:

```bash
python3 scripts/check_blinding.py
```

Failure output masks whatever it matched, so it is safe to paste into a public
CI log or an issue. Add `--show-matches` locally when you need to see the
offending text in full — never in CI.

A caveat worth stating plainly: the comparison videos themselves are the one
thing this repository cannot inspect. If a behaviour is visually identifiable to
a reviewer who knows the methods, no tooling here can prevent that — recruit
reviewers who have not seen the controllers.

### Also check before publishing

- Reviewers can read everything in the repository, including this README and
  the commit history. Do not describe the methods here.
- Keep collected responses out of this repository; `responses/` is git-ignored.
- The blinded videos already carry `OPTION 1` / `OPTION 2` headers. Do not
  replace them with annotated renders.

---

## Design notes

- **Symmetry.** Everything referring to Option 1 or Option 2 is styled
  identically and laid out mirror-symmetrically, and the five ordinal choices
  sit on one row with `Tie` centred. An asymmetric instrument would itself bias
  responses.
- **Watch enforcement.** Coverage is tracked in one-second buckets that are only
  credited during real forward playback, so the gate measures what was watched
  rather than where the playhead ended up.
- **Independent contexts.** The three contexts are separate judgments with
  separate reasons and confidence; the page never copies one into another.
- **No telemetry.** Nothing is transmitted anywhere. Data leaves the browser
  only when the reviewer exports a file.

## Licence

MIT — see `LICENSE`. Update the copyright line before publishing.
