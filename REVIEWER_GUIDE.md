# Reviewer guide

Thank you for reviewing. This should take roughly 30–45 minutes.

## What you are doing

You will watch comparison videos of a robot performing the same task twice,
shown side by side. **Option 1 is the left video. Option 2 is the right video.**
Both runs start from the same state, so any difference you see comes from the
behaviour itself, not from the situation.

For each video you give **three separate judgments**, one under each of these
briefs:

| Context | What to weigh |
| --- | --- |
| **Balanced** | Safety, efficiency, smoothness and task quality together. No single criterion dominates. |
| **Safety priority** | Obstacle clearance, low contact force, stability, fewer risky recoveries. Speed only breaks ties between behaviours you consider equally safe. |
| **Efficiency priority** | Completion time, direct movement, shorter paths, fewer unnecessary actions — provided the behaviour still looks acceptably safe. A faster but unsafe-looking behaviour should not win here. |

The three contexts are independent. It is entirely normal for the same pair to
come out differently under each one; please do not make them agree for the sake
of consistency.

## This study is blinded

Until you have submitted everything, please do **not** look at:

- strategy, controller or method names of any kind;
- annotated, labelled or diagnostic versions of these videos;
- performance metrics, score tables, success rates or result files;
- any file describing which option corresponds to which method.

Knowing any of this makes your judgments unusable. If you come across it by
accident, stop and tell the coordinator rather than continuing.

## Steps

1. Open the review page and enter the anonymous reviewer ID you were given
   (for example `R001`). Do not enter your name or email. The page assigns you a
   video set automatically — this is expected, and you only review your own set.
2. Tick the acknowledgement and select **Begin review**.
3. Watch the whole clip. The questions stay locked until playback has covered
   the entire timeline; skipping ahead does not unlock them. Replay as often as
   you like, and use the speed buttons freely — slow motion is often the easiest
   way to judge clearance and smoothness.
4. Answer under all three tabs. Each judgment needs:
   - a **preference**,
   - a **confidence** rating from 1 (very uncertain) to 5 (very confident),
   - at least one **reason**, and
   - the **task stage** that most influenced you.

   The written box asking what observation most influenced you is optional, but
   it is the most useful part of the whole form — a sentence is plenty.
5. Move between pairs with the arrows or the numbered chips. Completed pairs are
   ticked.
6. When all judgments are done, choose **Review & submit**, then
   **Submit and export CSV**, and also **Export JSON backup**. Send both files
   to the coordinator.

## Choosing a preference

- **Strongly prefer** — you would clearly rather deploy that behaviour.
- **Slightly prefer** — a real but modest edge.
- **Tie** — the two behaviours are approximately equally desirable.
- **Incomparable** — each has important advantages and there is no defensible
  overall ranking. For example, one is clearly safer and the other clearly
  faster, and under this brief neither consideration settles it.

**Tie and Incomparable are not the same answer.** Tie says "about equal";
Incomparable says "these cannot be ranked on one scale". Please use whichever
actually describes your reasoning — Incomparable is a legitimate answer, not a
failure to decide, and it carries real information.

Low confidence is also a legitimate answer. Rate 1 or 2 when you genuinely
cannot tell; that is more useful than a confident guess.

## Practical notes

- Your answers save automatically in this browser as you go. You can close the
  tab and return later with the same reviewer ID.
- To continue on a different machine, use **Save backup** to download the JSON
  file, then **Restore from backup file** on the setup screen of the other
  machine.
- Use a normal (non-private) browser window — private windows may block the
  automatic saving.
- If a video will not play, an unlock button appears after a short wait. Use it
  only for genuine playback trouble; it is recorded in the data so the
  coordinator knows those judgments were made without full playback.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | play / pause |
| <kbd>R</kbd> | replay from the start |
| <kbd>←</kbd> / <kbd>→</kbd> | step back / forward two seconds |
| <kbd>[</kbd> / <kbd>]</kbd> | previous / next pair |

## Finally

Judge only what you can see. There is no hidden correct answer, no behaviour you
are expected to prefer, and no penalty for disagreeing with other reviewers.
Your honest impression is the measurement.
