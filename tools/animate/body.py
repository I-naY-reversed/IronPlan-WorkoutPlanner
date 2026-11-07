"""Drive the MPFB body's Rigify rig with the pose solver.

The solver keeps working in its canonical skeleton (standing, arms hanging, palms in),
so every spec keeps its meaning. That skeleton is built from the Rigify rig's own bone
positions and lengths. Each frame:

  1. the spine controls (torso, chest, neck, head) are set from the solver's FK,
  2. Rigify is evaluated and the solver reads back where the chest and pelvis really are,
  3. arms and legs are solved (IK onto the weight and the floor) from those positions,
  4. the FK controls get the solved transforms, which Rigify copies to its deform chain.

So the hands and feet land exactly where the solver put them; `verify` replays the
keyframes and measures it on the rig itself.
"""

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

import rig as rigmod

HERE = Path(__file__).resolve().parent
BODY_BLEND = HERE / 'characters' / 'mpfb_body.blend'
Y = Vector((0, 1, 0))
DOWN = Vector((0, 0, -1))
SIDES = ('L', 'R')

# Solver bone -> Rigify bone it stands for (the ORG bone, which follows the control).
ORG = {'hips': 'ORG-spine', 'spine': 'ORG-spine.001', 'chest': 'ORG-spine.004',
       'neck': 'ORG-spine.005', 'head': 'ORG-spine.006'}
FK = {}
for _s in SIDES:
    for _b, _c in (('shoulder', 'shoulder'), ('upper_arm', 'upper_arm_fk'), ('forearm', 'forearm_fk'),
                   ('hand', 'hand_fk'), ('thigh', 'thigh_fk'), ('shin', 'shin_fk'), ('foot', 'foot_fk'),
                   ('toe', 'toe_fk')):
        ORG[f'{_b}.{_s}'] = f'ORG-{_b}.{_s}'
        FK[f'{_b}.{_s}'] = f'{_c}.{_s}'
SPINE_CONTROLS = (('hips', 'torso'), ('chest', 'chest'), ('neck', 'neck'), ('head', 'head'))
LIMB_LEVELS = (
    ('shoulder',),
    ('upper_arm', 'thigh'),
    ('forearm', 'shin'),
    ('hand', 'foot'),
    ('toe',),
)
# Deform bones whose skin defines each solver bone's thickness (for camera framing).
DEF_OF = {'hips': ('DEF-spine', 'DEF-pelvis'), 'spine': ('DEF-spine.001', 'DEF-spine.002'),
          'chest': ('DEF-spine.003', 'DEF-spine.004'), 'neck': ('DEF-spine.005',), 'head': ('DEF-spine.006',)}
for _s in SIDES:
    for _b in ('shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'):
        DEF_OF[f'{_b}.{_s}'] = (f'DEF-{_b}.{_s}',)


def load(collection):
    """Append the body and its rig from mpfb_body.blend into `collection`."""
    if not BODY_BLEND.exists():
        raise FileNotFoundError(f'{BODY_BLEND} is missing. Build it with: blender --background --python tools/animate/character.py -- build, then -- bake')
    with bpy.data.libraries.load(str(BODY_BLEND), link=False) as (src, dst):
        dst.objects = [n for n in ('Body', 'Rig') if n in src.objects]
    body = rig = None
    for ob in dst.objects:
        collection.objects.link(ob)
        if ob.type == 'ARMATURE':
            rig = ob
        else:
            body = ob
    rig.hide_render = True
    for side in SIDES:
        rig.pose.bones[f'upper_arm_parent.{side}']['IK_FK'] = 1.0
        rig.pose.bones[f'thigh_parent.{side}']['IK_FK'] = 1.0
    return body, rig


def build_canonical(rig, collection):
    """The solver's skeleton: the rig's joint positions and bone lengths, in the canonical
    rest pose (arms hanging straight down with palms in, legs straight down)."""
    bones = rig.data.bones
    rest = {n: bones[o].matrix_local.copy() for n, o in ORG.items()}
    frames = {}

    def frame(head, rot):
        return Matrix.Translation(head) @ rot.to_4x4()

    # Spine, neck, head and shoulders keep the rig's own frames.
    for n in ('hips', 'neck', 'head', 'shoulder.L', 'shoulder.R'):
        frames[n] = (rest[n], bones[ORG[n]].length)
    sp1, sp2 = bones['ORG-spine.001'], bones['ORG-spine.002']
    frames['spine'] = (rest['spine'], (sp2.tail_local - sp1.head_local).length)
    sp3, sp4 = bones['ORG-spine.003'], bones['ORG-spine.004']
    chest_rot = rest['chest'].to_3x3()
    frames['chest'] = (frame(sp3.head_local, chest_rot), (sp4.tail_local - sp3.head_local).length)

    for s in SIDES:
        # Arms: straighten each bone to point down, then turn the forearm and hand so the
        # thumb points forward (palms facing in).
        head = bones[f'ORG-upper_arm.{s}'].head_local.copy()
        thumb = bones[f'ORG-thumb.01.{s}'].head_local - bones[f'ORG-hand.{s}'].head_local
        twist = None
        for b in ('upper_arm', 'forearm', 'hand'):
            r = rest[f'{b}.{s}'].to_3x3()
            q = (r @ Y).rotation_difference(DOWN).to_matrix()
            rot = q @ r
            if b != 'upper_arm':
                if twist is None:
                    tq = (rest[f'hand.{s}'].to_3x3() @ Y).rotation_difference(DOWN).to_matrix()
                    t = tq @ thumb
                    t.z = 0
                    ang = math.atan2(t.x, -t.y)  # angle from forward (-Y) about +Z
                    twist = Matrix.Rotation(ang, 3, 'Z')
                rot = twist @ rot
            length = bones[f'ORG-{b}.{s}'].length
            frames[f'{b}.{s}'] = (frame(head, rot), length)
            head = head + DOWN * length
        # Legs: straighten thigh and shin; the foot and toe keep their angle to the shin.
        head = bones[f'ORG-thigh.{s}'].head_local.copy()
        q_shin = None
        for b in ('thigh', 'shin'):
            r = rest[f'{b}.{s}'].to_3x3()
            q = (r @ Y).rotation_difference(DOWN).to_matrix()
            if b == 'shin':
                q_shin = q
            length = bones[f'ORG-{b}.{s}'].length
            frames[f'{b}.{s}'] = (frame(head, q @ r), length)
            head = head + DOWN * length
        for b in ('foot', 'toe'):
            r = rest[f'{b}.{s}'].to_3x3()
            rot = q_shin @ r
            length = bones[f'ORG-{b}.{s}'].length
            frames[f'{b}.{s}'] = (frame(head, rot), length)
            head = head + rot @ Y * length

    data = bpy.data.armatures.new('SolverSkeleton')
    arm = bpy.data.objects.new('SolverSkeleton', data)
    collection.objects.link(arm)
    arm.hide_render = True
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, *_ in rigmod.BONE_DEFS:
        m, length = frames[name]
        eb = data.edit_bones.new(name)
        eb.head = m.translation
        eb.tail = m.translation + m.to_3x3() @ Y * length
        eb.align_roll(m.to_3x3() @ Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.hide_set(True)
    return arm


class RigifyHook:
    """Connects rig.solve() to the Rigify rig (see the module docstring)."""

    def __init__(self, rig, solver, frame_count):
        self.rig = rig
        self.solver = solver
        self.frame_count = frame_count
        self.pb = rig.pose.bones
        self.rest_ctrl = {c: rig.data.bones[c].matrix_local.copy() for _, c in SPINE_CONTROLS}
        self.rest_org = {n: rig.data.bones[o].matrix_local.copy() for n, o in ORG.items()}
        self.canon = {n: solver.rest[n] for n in solver.order}
        self.keyed = set()
        self.expected = {}
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'

    def _update(self):
        bpy.context.view_layer.update()

    def _set(self, name, world):
        self.pb[name].matrix = world
        self.keyed.add(name)

    def spine(self, f, m):
        for n, c in SPINE_CONTROLS:
            self._set(c, m[n] @ self.canon[n].inverted() @ self.rest_ctrl[c])
            self._update()
        pins = {}
        for n in ('hips', 'chest', 'neck', 'head'):
            world = self.pb[ORG[n]].matrix
            pins[n] = world @ self.rest_org[n].inverted() @ self.canon[n]
        return pins

    def limbs(self, f, m):
        if f >= self.frame_count:
            return
        for level in LIMB_LEVELS:
            for b in level:
                for s in SIDES:
                    self._set(FK[f'{b}.{s}'], m[f'{b}.{s}'])
            self._update()
        for name in self.keyed:
            pb = self.pb[name]
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('scale', frame=f)
        self.expected[f] = {b: m[b].copy() for b in ('hand.L', 'hand.R', 'foot.L', 'foot.R', 'toe.L', 'toe.R')}


def set_grip(rig, curl_deg):
    """Curl the fingers (and the thumb a little) so the hands close around the equipment.
    Positive X on Rigify's finger FK controls curls towards the palm on both sides."""
    split = (0.75, 1.15, 1.0)  # base, middle and tip joints, relative to curl_deg
    for s in SIDES:
        for f in ('f_index', 'f_middle', 'f_ring', 'f_pinky'):
            for seg, k in zip(('01', '02', '03'), split):
                pb = rig.pose.bones.get(f'{f}.{seg}.{s}')
                if pb:
                    pb.rotation_mode = 'XYZ'
                    pb.rotation_euler = (math.radians(curl_deg * k), 0, 0)
        for seg, k in (('02', 0.45), ('03', 0.55)):
            pb = rig.pose.bones.get(f'thumb.{seg}.{s}')
            if pb:
                pb.rotation_mode = 'XYZ'
                pb.rotation_euler = (math.radians(curl_deg * k), 0, 0)


def solve_and_key(spec, rig, solver):
    """Solve the spec through the rig and keyframe it. Returns (frames, report)."""
    body_mods = []
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.parent is rig:
            for mod in ob.modifiers:
                if mod.type == 'ARMATURE' and mod.show_viewport:
                    mod.show_viewport = False
                    body_mods.append(mod)
    curl = spec['equipment'].get('finger_curl', 60.0 if spec['equipment']['type'] != 'none' else 15.0)
    set_grip(rig, curl)
    hook = RigifyHook(rig, solver, spec['frames'])
    frames, report = rigmod.solve(spec, solver, hook)
    if rig.animation_data and rig.animation_data.action:
        rigmod._set_linear(rig.animation_data.action)
    report.update(verify(rig, hook, spec))
    for mod in body_mods:
        mod.show_viewport = True
    return frames, report


def verify(rig, hook, spec):
    """Replay the keyframes and measure where the rig's hands and feet really are."""
    scene = bpy.context.scene
    worst_hand = worst_turn = worst_foot = 0.0
    for f in range(spec['frames']):
        scene.frame_set(f)
        exp = hook.expected[f]
        for s in SIDES:
            hand = rig.pose.bones[f'ORG-hand.{s}'].matrix
            worst_hand = max(worst_hand, (hand.translation - exp[f'hand.{s}'].translation).length)
            turn = math.degrees(hand.to_quaternion().rotation_difference(exp[f'hand.{s}'].to_quaternion()).angle)
            worst_turn = max(worst_turn, min(turn, 360 - turn))
            for b in ('foot', 'toe'):
                worst_foot = max(worst_foot, (rig.pose.bones[f'ORG-{b}.{s}'].matrix.translation - exp[f'{b}.{s}'].translation).length)
    scene.frame_set(0)
    return {'rig_hand_mm': worst_hand * 1000, 'rig_hand_deg': worst_turn, 'rig_foot_mm': worst_foot * 1000}


def bone_radii(body, rig):
    """Typical skin thickness around each solver bone, from the body at rest."""
    co = np.array([tuple(v.co) for v in body.data.vertices])
    gidx = {g.name: g.index for g in body.vertex_groups}
    w = {}
    for v in body.data.vertices:
        for g in v.groups:
            w.setdefault(g.group, []).append((v.index, g.weight))
    radii = {}
    for n, defs in DEF_OF.items():
        org = rig.data.bones[ORG[n]]
        a, b = np.array(org.head_local), np.array(org.tail_local)
        idx = [i for d in defs if d in gidx for i, wt in w.get(gidx[d], []) if wt > 0.6]
        if not idx:
            radii[n] = 0.05
            continue
        p = co[idx]
        ab = b - a
        t = np.clip(((p - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
        d = np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
        radii[n] = float(np.percentile(d, 90))
    return radii


def outline_points(frames, solver, radii):
    """A cloud around the solved skeleton, close enough to the skin for camera framing."""
    pts = []
    ring = [Vector((math.cos(a), 0, math.sin(a))) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
    for fr in frames[::max(1, len(frames) // 16)]:
        for n in solver.order:
            m = fr['world'][n]
            r = radii.get(n, 0.04)
            for t in (0.0, 0.5, 1.0):
                c = m @ Vector((0, solver.length[n] * t, 0))
                rot = m.to_3x3()
                pts += [c + rot @ (d * r) for d in ring]
        head = fr['world']['head']
        pts.append(head @ Vector((0, solver.length['head'] + radii.get('head', 0.08) * 0.6, 0)))
    return pts


def muscle_tint(body, rig, muscles):
    """Per-vertex weight for the working muscles, stored as the 'muscle_tint' attribute.

    triceps: the back of the upper arm (the side facing back in the palms-forward rest pose),
    fading out towards the shoulder and the elbow.
    """
    n = len(body.data.vertices)
    tint = np.zeros(n)
    co = np.array([tuple(v.co) for v in body.data.vertices])
    gidx = {g.index: g.name for g in body.vertex_groups}
    for muscle in muscles:
        if muscle != 'triceps':
            continue
        for s in SIDES:
            org = rig.data.bones[f'ORG-upper_arm.{s}']
            a, b = np.array(org.head_local), np.array(org.tail_local)
            ab = b - a
            axis = ab / np.linalg.norm(ab)
            back = np.array([0.0, 1.0, 0.0]) - axis * axis[1]
            back /= np.linalg.norm(back)
            for v in body.data.vertices:
                wt = sum(g.weight for g in v.groups if gidx.get(g.group, '').startswith(f'DEF-upper_arm.{s}'))
                if wt <= 0.05:
                    continue
                p = co[v.index]
                t = float(np.clip(((p - a) @ ab) / (ab @ ab), 0, 1))
                radial = p - (a + t * ab)
                rl = np.linalg.norm(radial)
                if rl < 1e-6:
                    continue
                facing = float(np.clip((radial / rl) @ back * 1.6 - 0.2, 0, 1))
                along = float(np.clip((t - 0.12) / 0.15, 0, 1) * np.clip((0.97 - t) / 0.12, 0, 1))
                tint[v.index] = max(tint[v.index], wt * facing * along)
    attr = body.data.attributes.get('muscle_tint') or body.data.attributes.new('muscle_tint', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', tint.astype(np.float32))
    return tint
