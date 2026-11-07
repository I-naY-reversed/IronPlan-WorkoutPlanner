"""Load, validate and resolve exercise pose specs.

Plain Python with no Blender imports, so `python3 tools/animate/spec.py` can
check every spec without launching Blender. The format is documented in
tools/animate/README.md.
"""

import json
import re
import sys
from pathlib import Path

SIDES = ('L', 'R')
ARM_BONES = ('shoulder', 'upper_arm', 'forearm', 'hand')
LEG_BONES = ('thigh', 'shin', 'foot', 'toe')
CENTRE_BONES = ('hips', 'spine', 'chest', 'neck', 'head')
BONES = CENTRE_BONES + tuple(f'{b}.{s}' for b in ARM_BONES + LEG_BONES for s in SIDES)

EQUIPMENT_TYPES = ('dumbbell', 'barbell', 'none')
HOLDS = ('two_hand_cup', 'two_hand_bar', 'each_hand')
AXES = ('vertical', 'across', 'forearms')
EASES = ('in_out', 'linear', 'in', 'out')
VARIANTS = ('correct', 'fault')
POSE_SCALARS = ('hips_offset', 'heel_lift')

TOP_KEYS = ('id', 'name', 'fps', 'equipment', 'feet', 'poses', 'phases', 'camera', 'glow', 'variants')
EQUIPMENT_KEYS = ('type', 'hold', 'axis', 'grip_width', 'along', 'palm', 'hand_dir', 'finger_curl', 'handle', 'plate_radius', 'plate_half', 'bar_length', 'plate_inset')
CAMERA_DEFAULTS = {'azimuth': 180.0, 'elevation': 12.0, 'lens': 50.0, 'margin': 0.07, 'framing': 'full_body', 'min_z': None, 'target': None, 'distance': None, 'shift_y': 0.0}
FRAMINGS = ('full_body', 'upper_body')
MUSCLES = ('triceps',)

DEFAULT_COLOURS = {'correct': [0.02, 1.0, 0.2], 'fault': [1.0, 0.16, 0.02]}


class SpecError(ValueError):
    pass


def _err(path, msg):
    raise SpecError(f'{path}: {msg}')


def _vec3(v, path):
    if not (isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) for x in v)):
        _err(path, 'expected a list of three numbers')
    return [float(x) for x in v]


def expand_bones(entries, path):
    """Expand `name.*` into mirrored .L/.R entries. Explicit .L/.R entries win.

    Mirroring across the body's midline keeps the X rotation and negates Y and Z.
    """
    out = {}
    explicit = {}
    for key, val in entries.items():
        if key in POSE_SCALARS or key == 'inherit':
            continue
        rot = _vec3(val, f'{path}.{key}')
        if key.endswith('.*'):
            base = key[:-2]
            if f'{base}.L' not in BONES:
                _err(f'{path}.{key}', f'unknown bone group "{base}"')
            out[f'{base}.L'] = rot
            out[f'{base}.R'] = [rot[0], -rot[1], -rot[2]]
        else:
            if key not in BONES:
                _err(f'{path}.{key}', f'unknown bone. Known: {", ".join(BONES)}')
            explicit[key] = rot
    out.update(explicit)
    return out


def _scalars(pose, raw, path):
    if 'hips_offset' in raw:
        pose['hips_offset'] = _vec3(raw['hips_offset'], f'{path}.hips_offset')
    if 'heel_lift' in raw:
        if not isinstance(raw['heel_lift'], (int, float)) or raw['heel_lift'] < 0:
            _err(f'{path}.heel_lift', 'expected degrees as a number, 0 or more')
        pose['heel_lift'] = float(raw['heel_lift'])


def _resolve_pose(name, poses, path, overrides, seen=()):
    """Resolve a pose: its parent (if it inherits), then its own entries, then the
    variant's overrides. Overrides on a parent pose therefore reach every pose
    that inherits from it, unless that pose sets the same bone itself."""
    if name not in poses:
        _err(path, f'unknown pose "{name}"')
    if name in seen:
        _err(path, f'pose inheritance loop through "{name}"')
    raw = poses[name]
    if not isinstance(raw, dict):
        _err(f'{path}.{name}', 'pose must be an object')
    pose = {'bones': {}, 'hips_offset': [0.0, 0.0, 0.0], 'heel_lift': 0.0}
    if 'inherit' in raw:
        parent = _resolve_pose(raw['inherit'], poses, f'{path}.{name}.inherit', overrides, seen + (name,))
        pose = {'bones': dict(parent['bones']), 'hips_offset': list(parent['hips_offset']), 'heel_lift': parent['heel_lift']}
    pose['bones'].update(expand_bones(raw, f'{path}.{name}'))
    _scalars(pose, raw, f'{path}.{name}')
    for key in ('*', name):
        if key in overrides:
            ov = overrides[key]
            if 'inherit' in ov:
                _err(f'variant override {key}', '"inherit" is not allowed in overrides')
            pose['bones'].update(expand_bones(ov, f'variant override {key}'))
            _scalars(pose, ov, f'variant override {key}')
    return pose


def _check_keys(obj, allowed, path):
    if not isinstance(obj, dict):
        _err(path, 'must be an object')
    extra = set(obj) - set(allowed)
    if extra:
        _err(path, f'unknown field(s) {", ".join(sorted(extra))}. Allowed: {", ".join(allowed)}')


def _num(obj, key, path, positive=False, optional=False):
    v = obj.get(key)
    if v is None and optional:
        return
    if not isinstance(v, (int, float)) or isinstance(v, bool) or (positive and v <= 0):
        _err(f'{path}.{key}', 'must be a positive number' if positive else 'must be a number')


def resolve(spec, variant):
    """Return a fully resolved spec for one variant: concrete poses, timings, colours."""
    if variant not in VARIANTS:
        _err('variant', f'must be one of {VARIANTS}')
    for key in ('id', 'poses', 'phases', 'camera', 'glow', 'equipment'):
        if key not in spec:
            _err(key, 'is required')
    if not re.fullmatch(r'[a-z0-9_]+', spec['id']):
        _err('id', 'must be snake_case like the ids in mobile/src/domain/exercises.ts')

    fps = int(spec.get('fps', 30))
    poses_raw = spec['poses']
    if 'start' not in poses_raw or 'end' not in poses_raw:
        _err('poses', 'needs at least "start" and "end"')
    _check_keys(spec, TOP_KEYS, 'spec')
    variants = spec.get('variants', {})
    _check_keys(variants, VARIANTS, 'variants')
    var_raw = variants.get(variant, {})
    _check_keys(var_raw, ('caption', 'poses', 'equipment', 'colour'), f'variants.{variant}')
    overrides = var_raw.get('poses', {})
    for pname in overrides:
        if pname != '*' and pname not in poses_raw:
            _err(f'variants.{variant}.poses.{pname}', 'override for a pose that does not exist')

    poses = {pname: _resolve_pose(pname, poses_raw, 'poses', overrides) for pname in poses_raw}

    phases = []
    for i, ph in enumerate(spec['phases']):
        p = f'phases[{i}]'
        if ph.get('to') not in poses:
            _err(p, f'"to" must name a pose ({", ".join(poses)})')
        secs = ph.get('seconds')
        if not isinstance(secs, (int, float)) or secs <= 0:
            _err(p, '"seconds" must be a positive number')
        ease = ph.get('ease', 'in_out')
        if ease not in EASES:
            _err(p, f'"ease" must be one of {EASES}')
        phases.append({'to': ph['to'], 'seconds': float(secs), 'ease': ease})
    if not phases or phases[-1]['to'] != 'start':
        _err('phases', 'the last phase must return to "start" so the loop closes cleanly')
    total = sum(p['seconds'] for p in phases)
    frames = round(total * fps)
    if frames < 2:
        _err('phases', 'loop is too short')

    eq = dict(spec['equipment'])
    eq.update(var_raw.get('equipment', {}))
    _check_keys(eq, EQUIPMENT_KEYS, 'equipment')
    if eq.get('type') not in EQUIPMENT_TYPES:
        _err('equipment.type', f'must be one of {EQUIPMENT_TYPES}')
    if eq['type'] != 'none':
        if eq.get('hold') not in HOLDS:
            _err('equipment.hold', f'must be one of {HOLDS}')
        if eq.get('axis', 'vertical') not in AXES:
            _err('equipment.axis', f'must be one of {AXES}')
        eq.setdefault('axis', 'vertical' if eq['hold'] != 'two_hand_bar' else 'across')
        eq.setdefault('grip_width', 0.08 if eq['hold'] == 'two_hand_cup' else 0.5)
        eq.setdefault('along', 0.0)
        eq.setdefault('palm', 0.075)
        for key in ('grip_width', 'palm', 'handle', 'plate_radius', 'plate_half', 'bar_length', 'plate_inset'):
            _num(eq, key, 'equipment', positive=True, optional=True)
        _num(eq, 'along', 'equipment')
        if eq.get('hand_dir') is not None:
            _vec3(eq['hand_dir'], 'equipment.hand_dir')

    feet = {'planted': True}
    _check_keys(spec.get('feet', {}), ('planted',), 'feet')
    feet.update(spec.get('feet', {}))
    if any(p['heel_lift'] for p in poses.values()) and not feet['planted']:
        _err('feet.planted', 'heel_lift needs planted feet')

    cam = dict(CAMERA_DEFAULTS)
    _check_keys(spec['camera'], tuple(CAMERA_DEFAULTS), 'camera')
    cam.update(spec['camera'])
    for key in ('azimuth', 'elevation', 'shift_y'):
        _num(cam, key, 'camera')
    _num(cam, 'lens', 'camera', positive=True)
    _num(cam, 'distance', 'camera', positive=True, optional=True)
    _num(cam, 'min_z', 'camera', optional=True)
    if not (isinstance(cam['margin'], (int, float)) and 0 <= cam['margin'] < 0.9):
        _err('camera.margin', 'must be a number from 0 to 0.9')
    if cam['target'] is not None:
        cam['target'] = _vec3(cam['target'], 'camera.target')
    if cam['framing'] not in FRAMINGS:
        _err('camera.framing', f'must be one of {FRAMINGS}')

    _check_keys(spec['glow'], ('bones', 'joints', 'radius', 'muscles', 'tint_strength'), 'glow')
    _num(spec['glow'], 'radius', 'glow', positive=True, optional=True)
    _num(spec['glow'], 'tint_strength', 'glow', positive=True, optional=True)
    for mname in spec['glow'].get('muscles', []):
        if mname not in MUSCLES:
            _err('glow.muscles', f'unknown muscle "{mname}". Known: {", ".join(MUSCLES)}')
    glow_bones = []
    for b in spec['glow'].get('bones', []):
        if b.endswith('.*'):
            glow_bones += [f'{b[:-2]}.L', f'{b[:-2]}.R']
        else:
            glow_bones.append(b)
    for b in glow_bones:
        if b not in BONES:
            _err('glow.bones', f'unknown bone "{b}"')
    colour = var_raw.get('colour', DEFAULT_COLOURS[variant])

    return {
        'id': spec['id'],
        'name': spec.get('name', spec['id']),
        'variant': variant,
        'caption': var_raw.get('caption', ''),
        'fps': fps,
        'frames': frames,
        'seconds': total,
        'poses': poses,
        'phases': phases,
        'equipment': eq,
        'feet': feet,
        'camera': cam,
        'glow': {'bones': glow_bones, 'joints': spec['glow'].get('joints', False), 'colour': _vec3(colour, 'colour'),
                 'radius': float(spec['glow'].get('radius', 0.0055)), 'muscles': list(spec['glow'].get('muscles', [])),
                 'tint_strength': float(spec['glow'].get('tint_strength', 0.8))},
        'badge': 'check' if variant == 'correct' else 'cross',
    }


HERE = Path(__file__).resolve().parent
SPECS_DIR = HERE / 'specs'
EXERCISES_TS = HERE.parent.parent / 'mobile' / 'src' / 'domain' / 'exercises.ts'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def exercise_ids(exercises_ts):
    return set(re.findall(r"\{\s*id:\s*'([a-z0-9_]+)'", Path(exercises_ts).read_text(encoding='utf-8')))


def spec_paths(argv=()):
    return [Path(p) for p in argv] if argv else sorted(SPECS_DIR.glob('*.json'))


def main(argv):
    """Validate every spec (or the given ones). Exits non-zero on the first problem."""
    known = exercise_ids(EXERCISES_TS) if EXERCISES_TS.exists() else None
    for p in spec_paths(argv):
        spec = load(p)
        for v in VARIANTS:
            r = resolve(spec, v)
        if known is not None and spec['id'] not in known:
            raise SpecError(f'{p}: id "{spec["id"]}" is not in mobile/src/domain/exercises.ts')
        print(f'ok  {p.name}  {r["frames"]} frames, {r["seconds"]:.2f} s')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except SpecError as e:
        print(f'spec error: {e}', file=sys.stderr)
        sys.exit(1)
