#!/usr/bin/env bash
# Render every spec in tools/animate/specs, both variants.
#
#   tools/animate/render_all.sh [out_dir] [extra render.py args...]
#
# Default out_dir is tools/animate/out (gitignored). Copy approved clips into
# mobile/assets/exercises/ by hand, or pass that folder as out_dir.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$HERE/out}"
shift || true
BLENDER="${BLENDER:-blender}"

command -v "$BLENDER" >/dev/null || { echo "blender not found. Install it with: brew install --cask blender" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found. Install it with: brew install ffmpeg" >&2; exit 1; }

python3 "$HERE/spec.py"

mkdir -p "$OUT"
for spec in "$HERE"/specs/*.json; do
  id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$spec")"
  for variant in correct fault; do
    echo "== $id ($variant)"
    rm -f "$OUT/$id.$variant".{mp4,png,json}
    log="$(mktemp)"
    if ! "$BLENDER" --background --python-exit-code 1 --python "$HERE/render.py" -- \
        --spec "$spec" --variant "$variant" --out "$OUT" "$@" >"$log" 2>&1; then
      grep -E '[Ee]rror|Traceback|File "' "$log" >&2 || tail -20 "$log" >&2
      rm -f "$log"
      echo "render failed: $id $variant" >&2
      exit 1
    fi
    grep -E '^(SOLVE|DONE)' "$log" || true
    rm -f "$log"
  done
done

echo
ls -la "$OUT"/*.mp4
