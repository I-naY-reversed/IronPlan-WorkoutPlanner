"""Render one exercise clip from a pose spec.

    blender --background --python tools/animate/render.py -- \
        --spec tools/animate/specs/overhead_triceps_extension.json \
        --variant correct --out <dir>

Writes <dir>/<id>.<variant>.mp4, <dir>/<id>.<variant>.png (poster, first frame)
and <dir>/<id>.<variant>.json (timings and solver checks). See README.md.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import badge  # noqa: E402
import look  # noqa: E402
import rig  # noqa: E402
import spec as spec_mod  # noqa: E402
import toolpaths  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='render.py')
    p.add_argument('--spec', required=True)
    p.add_argument('--variant', choices=spec_mod.VARIANTS, required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--samples', type=int, default=24, help='Eevee samples per frame')
    p.add_argument('--engine', choices=('eevee', 'cycles'), default='eevee')
    p.add_argument('--stills', default='', help='comma-separated frames to save as PNG stills instead of a clip')
    p.add_argument('--crf', type=int, default=28)
    p.add_argument('--keep-frames', action='store_true')
    p.add_argument('--solve-only', action='store_true', help='solve and print the pose checks, no rendering')
    return p.parse_args(argv)


_FFMPEG = None


def ffmpeg():
    global _FFMPEG
    if _FFMPEG is None:
        try:
            _FFMPEG = toolpaths.find('ffmpeg')
        except toolpaths.ToolNotFound as e:
            sys.exit(str(e))
    return _FFMPEG


BADGE_MARGIN = 22


def encode(frames_dir, badge_png, mp4, poster, fps, crf, frame_count):
    """Encode to temporary names and move into place only when both files succeed."""
    overlay = f'[0:v][1:v]overlay=W-w-{BADGE_MARGIN}:{BADGE_MARGIN}:format=auto'
    tmp_mp4 = mp4.with_name(mp4.name + '.part.mp4')
    tmp_png = poster.with_name(poster.name + '.part.png')
    # Convert with the BT.709 matrix and tag it, so phones and browsers show the
    # same colours as the render.
    subprocess.run([
        ffmpeg(), '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(frames_dir / '%04d.png'),
        '-i', str(badge_png), '-filter_complex', f'{overlay},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv[v]',
        '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-g', str(frame_count), '-movflags', '+faststart', '-an', str(tmp_mp4),
    ], check=True)
    # The poster is the clip's own first frame, so swapping poster for video never jumps.
    # A 128-colour palette keeps it small; the dark backdrop survives that well.
    subprocess.run([
        ffmpeg(), '-y', '-loglevel', 'error', '-i', str(tmp_mp4), '-frames:v', '1',
        '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
        '-compression_level', '9', str(tmp_png),
    ], check=True)
    tmp_mp4.replace(mp4)
    tmp_png.replace(poster)


def still(frame_png, badge_png, out_png):
    subprocess.run([
        ffmpeg(), '-y', '-loglevel', 'error', '-i', str(frame_png), '-i', str(badge_png),
        '-filter_complex', f'[0:v][1:v]overlay=W-w-{BADGE_MARGIN}:{BADGE_MARGIN}:format=auto', '-frames:v', '1', str(out_png),
    ], check=True)


def build_scene(raw, spec, samples, engine):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, spec['frames'] - 1
    look.setup_render(scene, samples, engine)

    body = bpy.data.collections.new('Body')
    glow = bpy.data.collections.new('Glow')
    scene.collection.children.link(body)
    scene.collection.children.link(glow)

    clay = look.principled('Clay', look.CLAY, roughness=0.62, specular=0.3)
    arm, pieces = rig.build(body, clay)
    solver = rig.Solver(arm)
    frames, report = rig.solve(spec, solver)
    equipment = look.build_equipment(spec['equipment'], body)
    rig.keyframe(arm, frames, solver, equipment)
    look.build_glow(arm, spec['glow'], glow)

    # Camera framing from the solved motion of every variant, so toggling between
    # the correct and fault clips never shifts the frame.
    pts = []
    local_verts = {ob.name: [v.co.copy() for v in list(ob.data.vertices)[::4]] for ob in pieces}
    for v_spec in [spec_mod.resolve(raw, v) for v in spec_mod.VARIANTS]:
        v_frames = frames if v_spec['variant'] == spec['variant'] else rig.solve(v_spec, solver)[0]
        for fr in v_frames[::max(1, len(v_frames) // 16)]:
            for ob in pieces:
                pts += [fr['world'][ob.parent_bone] @ v for v in local_verts[ob.name]]
            pts += look.equipment_points(v_spec['equipment'], fr['equipment'] or [])
    pts.append(Vector((0, 0, 0)))
    cam, target, distance = look.fit_camera(scene, spec['camera'], pts)
    look.add_lights(scene, spec['camera'], target)
    look.add_backdrop(body, spec['camera'])

    body_layer = scene.view_layers[0]
    body_layer.name = 'body'
    glow_layer = scene.view_layers.new('glow')
    body_layer.layer_collection.children['Glow'].exclude = True
    glow_layer.layer_collection.children['Body'].exclude = True
    if hasattr(glow_layer, 'samples'):
        glow_layer.samples = 8
    look.setup_compositor(scene, body_layer, glow_layer)
    report['camera_distance_m'] = round(distance, 3)
    return scene, report


def main():
    args = parse_args()
    raw = spec_mod.load(Path(args.spec))
    spec = spec_mod.resolve(raw, args.variant)
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{spec['id']}.{args.variant}"

    t0 = time.time()
    scene, report = build_scene(raw, spec, args.samples, args.engine)
    report = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in report.items()}
    print('SOLVE', json.dumps(report))
    if args.solve_only:
        return

    work = Path(tempfile.mkdtemp(prefix=f"anim_{spec['id']}_{args.variant}_"))
    try:
        render(args, spec, scene, report, out, stem, work, t0)
    finally:
        if args.keep_frames:
            print('FRAMES', work / 'frames')
        else:
            shutil.rmtree(work, ignore_errors=True)


def render(args, spec, scene, report, out, stem, work, t0):
    badge_png = badge.write_png(work / 'badge.png', spec['badge'])
    frames_dir = work / 'frames'
    frames_dir.mkdir()

    t_render = time.time()
    if args.stills:
        for f in [int(x) for x in args.stills.split(',') if x.strip()]:
            scene.frame_set(f)
            frame_png = frames_dir / f'{f:04d}.png'
            scene.render.filepath = str(frame_png)
            bpy.ops.render.render(write_still=True)
            out_png = out / f'{stem}.f{f:04d}.png'
            still(frame_png, badge_png, out_png)
            print('STILL', out_png)
        return
    scene.render.filepath = str(frames_dir / '####')
    bpy.ops.render.render(animation=True)
    rendered = len(list(frames_dir.glob('*.png')))
    if rendered != spec['frames']:
        raise RuntimeError(f"expected {spec['frames']} frames, Blender wrote {rendered}")
    render_s = time.time() - t_render
    mp4, poster = out / f'{stem}.mp4', out / f'{stem}.png'
    encode(frames_dir, badge_png, mp4, poster, spec['fps'], args.crf, spec['frames'])
    meta = {
        'id': spec['id'], 'variant': args.variant, 'frames': spec['frames'], 'fps': spec['fps'],
        'seconds': spec['seconds'], 'render_seconds': round(render_s, 1), 'total_seconds': round(time.time() - t0, 1),
        'mp4_bytes': mp4.stat().st_size, 'poster_bytes': poster.stat().st_size,
        'engine': args.engine, 'samples': args.samples, 'blender': bpy.app.version_string, 'checks': report,
    }
    (out / f'{stem}.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    print('DONE', json.dumps(meta))


if __name__ == '__main__':
    try:
        main()
    except spec_mod.SpecError as e:
        print(f'spec error: {e}', file=sys.stderr)
        sys.exit(1)
