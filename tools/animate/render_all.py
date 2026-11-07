"""Render every spec in tools/animate/specs, both variants. Works on Windows, macOS and Linux.

    python tools/animate/render_all.py [--out DIR] [--spec NAME ...] [--variant correct|fault] [render.py options...]

Examples (PowerShell or any shell, from the repo root):
    py tools/animate/render_all.py
    py tools/animate/render_all.py --out tools/animate/out --samples 48
    py tools/animate/render_all.py --spec overhead_triceps_extension --variant fault --stills 0,60

Blender and ffmpeg are found on PATH, or through the BLENDER and FFMPEG
environment variables (see toolpaths.py). Any option this script does not know
is passed through to render.py, for example --samples, --crf or --engine.
Same behaviour as render_all.sh, which is kept for macOS and Linux.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import spec as spec_mod  # noqa: E402
import toolpaths  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--out', default=str(HERE / 'out'), help='output folder (default tools/animate/out, gitignored)')
    p.add_argument('--spec', action='append', default=[], help='only this spec (file stem), can repeat')
    p.add_argument('--variant', choices=spec_mod.VARIANTS, action='append', default=[], help='only this variant, can repeat')
    args, passthrough = p.parse_known_args()

    try:
        blender = toolpaths.find('blender')
        toolpaths.find('ffmpeg')
    except toolpaths.ToolNotFound as e:
        sys.exit(f'error: {e}')

    try:
        spec_mod.main([])
    except spec_mod.SpecError as e:
        sys.exit(f'spec error: {e}')

    specs = spec_mod.spec_paths()
    if args.spec:
        specs = [s for s in specs if s.stem in args.spec]
        missing = set(args.spec) - {s.stem for s in specs}
        if missing:
            sys.exit(f'error: no spec named {", ".join(sorted(missing))} in {spec_mod.SPECS_DIR}')
    variants = args.variant or list(spec_mod.VARIANTS)
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    makes_clip = not ({'--solve-only', '--stills'} & {a.split('=')[0] for a in passthrough})

    for spec_path in specs:
        exercise_id = spec_mod.load(spec_path)['id']
        for variant in variants:
            print(f'== {exercise_id} ({variant})', flush=True)
            outputs = [out / f'{exercise_id}.{variant}.{ext}' for ext in ('mp4', 'png', 'json')]
            if makes_clip:
                for f in outputs:
                    f.unlink(missing_ok=True)
            cmd = [
                blender, '--background', '--python-exit-code', '1', '--python', str(HERE / 'render.py'), '--',
                '--spec', str(spec_path), '--variant', variant, '--out', str(out), *passthrough,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
            log = (result.stdout or '') + (result.stderr or '')
            for line in log.splitlines():
                if line.startswith(('SOLVE', 'DONE', 'STILL')):
                    print(line)
            if result.returncode != 0 or (makes_clip and not all(f.exists() for f in outputs)):
                errors = [l for l in log.splitlines() if 'rror' in l or 'Traceback' in l or l.strip().startswith('File "')]
                print('\n'.join(errors or log.splitlines()[-20:]), file=sys.stderr)
                sys.exit(f'render failed: {exercise_id} {variant} (exit code {result.returncode})')

    if makes_clip:
        print()
        for mp4 in sorted(out.glob('*.mp4')):
            meta_path = mp4.with_suffix('.json')
            meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
            print(f'{mp4.name}  {mp4.stat().st_size / 1024:.1f} KB  render {meta.get("render_seconds", "?")} s')


if __name__ == '__main__':
    main()
