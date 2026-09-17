#!/usr/bin/env bash
# Copy blinded comparison videos into videos/set_A and videos/set_B, then
# regenerate the pair manifest.
#
#   ./scripts/import_videos.sh /path/to/review_pairs [/path/to/seeds.csv]
#
# The source directory must contain set_A/ and set_B/ with matching
# pair_XXX.mp4 files. Only those .mp4 files are copied: annotated videos,
# metrics and the private manifest are never touched.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <review_pairs_dir> [seed_csv]" >&2
  exit 2
fi

SRC=$(cd "$1" && pwd)
SEED_CSV=${2:-}
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

for set_id in A B; do
  if [[ ! -d "$SRC/set_$set_id" ]]; then
    echo "error: $SRC/set_$set_id does not exist" >&2
    exit 1
  fi
  mkdir -p "$REPO/videos/set_$set_id"
  count=0
  while IFS= read -r -d '' f; do
    cp -f "$f" "$REPO/videos/set_$set_id/"
    count=$((count + 1))
  done < <(find "$SRC/set_$set_id" -maxdepth 1 -name 'pair_*.mp4' -print0)
  echo "set_$set_id: copied $count video(s)"
done

if [[ -n "$SEED_CSV" ]]; then
  python3 "$REPO/scripts/make_pairs_manifest.py" --seed-csv "$SEED_CSV"
else
  python3 "$REPO/scripts/make_pairs_manifest.py"
fi

python3 "$REPO/scripts/check_blinding.py" || {
  echo "blinding check failed -- resolve before publishing" >&2
  exit 1
}
