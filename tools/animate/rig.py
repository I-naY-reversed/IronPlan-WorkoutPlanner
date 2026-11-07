"""Procedural clay mannequin, its armature, and the pose solver.

The character is built entirely from code: a humanoid armature plus rounded
rigid segments parented to the bones, like an artist's wooden mannequin. Rigid
segments never deform badly, even at the extreme shoulder and elbow angles that
lifting needs.

Coordinates are metres. The character faces -Y with its left side on +X, the
usual Blender convention.

Posing works in two passes per frame:
  1. Forward kinematics from the spec's joint rotations.
  2. Analytic two-bone IK that locks the hands to the equipment and the feet to
     the floor, using the FK elbow and knee positions as pole hints.
The solved rotations are written as keyframes, so Blender only plays them back.
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

Y = Vector((0.0, 1.0, 0.0))

# name, parent, head, tail, connected
BONE_DEFS = [
    ('hips', None, (0, 0.0, 0.95), (0, 0.0, 1.06), False),
    ('spine', 'hips', (0, 0.0, 1.06), (0, 0.005, 1.22), True),
    ('chest', 'spine', (0, 0.005, 1.22), (0, 0.0, 1.42), True),
    ('neck', 'chest', (0, 0.0, 1.44), (0, 0.0, 1.555), False),
    ('head', 'neck', (0, 0.0, 1.555), (0, 0.0, 1.76), True),
]
for _s, _x in (('L', 1.0), ('R', -1.0)):
    BONE_DEFS += [
        (f'shoulder.{_s}', 'chest', (0.025 * _x, -0.005, 1.425), (0.175 * _x, 0.015, 1.425), False),
        (f'upper_arm.{_s}', f'shoulder.{_s}', (0.19 * _x, 0.02, 1.41), (0.19 * _x, 0.02, 1.11), False),
        (f'forearm.{_s}', f'upper_arm.{_s}', (0.19 * _x, 0.02, 1.11), (0.19 * _x, 0.02, 0.855), True),
        (f'hand.{_s}', f'forearm.{_s}', (0.19 * _x, 0.02, 0.855), (0.19 * _x, 0.02, 0.68), True),
        (f'thigh.{_s}', 'hips', (0.095 * _x, 0.0, 0.93), (0.10 * _x, -0.005, 0.50), False),
        (f'shin.{_s}', f'thigh.{_s}', (0.10 * _x, -0.005, 0.50), (0.10 * _x, 0.02, 0.085), True),
        (f'foot.{_s}', f'shin.{_s}', (0.10 * _x, 0.02, 0.085), (0.10 * _x, -0.115, 0.025), True),
        (f'toe.{_s}', f'foot.{_s}', (0.10 * _x, -0.115, 0.025), (0.10 * _x, -0.175, 0.02), True),
    ]

# Clay segments: bone, head, tail, r0, r1, options. Points are rest-pose armature space.
# sx scales the cross-section along `side`, sz along the third axis, ky squashes the end caps.
PIECES = [
    ('hips', (0, 0.005, 0.90), (0, 0.005, 1.03), 0.115, 0.112, dict(sx=1.42, sz=0.95, ky=0.55)),
    ('spine', (0, 0.008, 1.02), (0, 0.01, 1.22), 0.1, 0.104, dict(sx=1.2, sz=0.86, ky=0.5)),
    ('chest', (0, 0.0, 1.2), (0, 0.0, 1.4), 0.108, 0.13, dict(sx=1.28, sz=0.8, ky=0.45, bulge=0.006, bulge_at=0.6)),
    ('neck', (0, 0.014, 1.42), (0, 0.006, 1.56), 0.058, 0.05, {}),
]
ELLIPSOIDS = [
    ('head', (0, 0.002, 1.665), (0.078, 0.093, 0.112)),
]
for _s, _x in (('L', 1.0), ('R', -1.0)):
    PIECES += [
        (f'shoulder.{_s}', (0.03 * _x, 0.008, 1.42), (0.165 * _x, 0.016, 1.418), 0.058, 0.054, dict(sz=0.8, side=(0, 1, 0))),
        (f'upper_arm.{_s}', (0.19 * _x, 0.02, 1.41), (0.19 * _x, 0.02, 1.11), 0.047, 0.037, dict(bulge=0.006, bulge_at=0.35)),
        (f'forearm.{_s}', (0.19 * _x, 0.02, 1.11), (0.19 * _x, 0.02, 0.86), 0.041, 0.028, dict(bulge=0.006, bulge_at=0.22)),
        (f'hand.{_s}', (0.19 * _x, 0.02, 0.858), (0.19 * _x, 0.02, 0.705), 0.029, 0.026, dict(sx=0.62, sz=1.2, ky=0.8, side=(1, 0, 0))),
        (f'thigh.{_s}', (0.095 * _x, 0.0, 0.93), (0.10 * _x, -0.005, 0.50), 0.083, 0.056, dict(bulge=0.01, bulge_at=0.3)),
        (f'shin.{_s}', (0.10 * _x, -0.005, 0.50), (0.10 * _x, 0.02, 0.09), 0.056, 0.036, dict(bulge=0.012, bulge_at=0.3)),
        (f'foot.{_s}', (0.10 * _x, 0.035, 0.046), (0.10 * _x, -0.11, 0.033), 0.044, 0.036, dict(sx=1.05, sz=0.75, side=(1, 0, 0))),
        (f'toe.{_s}', (0.10 * _x, -0.112, 0.031), (0.10 * _x, -0.17, 0.025), 0.034, 0.026, dict(sx=1.15, sz=0.7, side=(1, 0, 0))),
    ]
SPHERES = [(f'upper_arm.{s}', (0.19 * x, 0.02, 1.405), 0.058) for s, x in (('L', 1.0), ('R', -1.0))]

PALM = 0.075  # metres from wrist to palm centre along the hand bone
SEGMENTS = 32


# ---------------------------------------------------------------- mesh helpers

def _profile(length, r0, r1, bulge=0.0, bulge_at=0.5, ky=1.0, n_cap=8, n_body=14):
    """(axial position, radius) samples for a tapered capsule along 0..length."""
    pts = []
    for i in range(n_cap):
        a = (math.pi / 2) * i / n_cap
        pts.append((-r0 * ky * math.cos(a), r0 * math.sin(a)))
    for i in range(n_body + 1):
        t = i / n_body
        r = r0 + (r1 - r0) * t
        if bulge:
            r += bulge * math.sin(math.pi * min(1.0, t / (2 * bulge_at) if t < bulge_at else 0.5 + (t - bulge_at) / (2 * (1 - bulge_at))))
        pts.append((length * t, r))
    for i in range(1, n_cap + 1):
        a = (math.pi / 2) * i / n_cap
        pts.append((length + r1 * ky * math.sin(a), r1 * math.cos(a)))
    return pts


def _lathe(profile, origin, axis, side, sx=1.0, sz=1.0):
    axis = axis.normalized()
    u = (side - axis * side.dot(axis))
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - axis * axis.x
    u.normalize()
    w = axis.cross(u)
    verts, faces = [], []
    rings = []
    for y, r in profile:
        if r < 1e-6:
            rings.append([len(verts)])
            verts.append(origin + axis * y)
            continue
        ring = []
        for k in range(SEGMENTS):
            a = 2 * math.pi * k / SEGMENTS
            ring.append(len(verts))
            verts.append(origin + axis * y + u * (r * math.cos(a) * sx) + w * (r * math.sin(a) * sz))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(SEGMENTS):
                faces.append((a[0], b[(k + 1) % SEGMENTS], b[k]))
        elif len(b) == 1:
            for k in range(SEGMENTS):
                faces.append((a[k], a[(k + 1) % SEGMENTS], b[0]))
        else:
            for k in range(SEGMENTS):
                k2 = (k + 1) % SEGMENTS
                faces.append((a[k], a[k2], b[k2], b[k]))
    return verts, faces


def _ellipsoid(centre, radii, rings=16):
    verts, faces = [], []
    verts.append(Vector((centre[0], centre[1], centre[2] - radii[2])))
    for i in range(1, rings):
        phi = math.pi * i / rings - math.pi / 2
        for k in range(SEGMENTS):
            a = 2 * math.pi * k / SEGMENTS
            verts.append(Vector((centre[0] + radii[0] * math.cos(phi) * math.cos(a),
                                 centre[1] + radii[1] * math.cos(phi) * math.sin(a),
                                 centre[2] + radii[2] * math.sin(phi))))
    top = len(verts)
    verts.append(Vector((centre[0], centre[1], centre[2] + radii[2])))
    for k in range(SEGMENTS):
        faces.append((0, 1 + (k + 1) % SEGMENTS, 1 + k))
    for i in range(rings - 2):
        b0 = 1 + i * SEGMENTS
        b1 = b0 + SEGMENTS
        for k in range(SEGMENTS):
            k2 = (k + 1) % SEGMENTS
            faces.append((b0 + k, b0 + k2, b1 + k2, b1 + k))
    last = 1 + (rings - 2) * SEGMENTS
    for k in range(SEGMENTS):
        faces.append((last + k, last + (k + 1) % SEGMENTS, top))
    return verts, faces


def _mesh_object(name, verts, faces, material, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def parent_to_bone(ob, arm, bone_name):
    """Parent `ob` to a bone so its local coordinates are the bone's head frame."""
    bone = arm.data.bones[bone_name]
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone_name
    ob.matrix_parent_inverse = Matrix.Identity(4)
    # Blender's bone parent space sits at the bone tail; shift back to the head.
    ob.matrix_basis = Matrix.Translation((0.0, -bone.length, 0.0))


# ---------------------------------------------------------------- build

def build(collection, clay):
    """Create the armature and clay mesh. Returns (armature object, piece objects)."""
    arm_data = bpy.data.armatures.new('MannequinRig')
    arm = bpy.data.objects.new('Mannequin', arm_data)
    collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    ebones = {}
    for name, parent, head, tail, connect in BONE_DEFS:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail, eb.roll = head, tail, 0.0
        if parent:
            eb.parent = ebones[parent]
            eb.use_connect = connect
        ebones[name] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.show_in_front = False
    arm.hide_render = True

    pieces = []

    def add(bone_name, verts, faces, label):
        inv = arm.data.bones[bone_name].matrix_local.inverted()
        ob = _mesh_object(label, [inv @ v for v in verts], faces, clay, collection)
        parent_to_bone(ob, arm, bone_name)
        pieces.append(ob)

    for i, (bone_name, head, tail, r0, r1, opt) in enumerate(PIECES):
        h, t = Vector(head), Vector(tail)
        prof = _profile((t - h).length, r0, r1, opt.get('bulge', 0.0), opt.get('bulge_at', 0.5), opt.get('ky', 1.0))
        side = Vector(opt.get('side', (1, 0, 0)))
        v, f = _lathe(prof, h, t - h, side, opt.get('sx', 1.0), opt.get('sz', 1.0))
        add(bone_name, v, f, f'clay.{bone_name}.{i}')
    for bone_name, centre, radii in ELLIPSOIDS:
        v, f = _ellipsoid(centre, radii)
        add(bone_name, [Vector(x) for x in v], f, f'clay.{bone_name}.ellipsoid')
    for bone_name, centre, r in SPHERES:
        v, f = _ellipsoid(centre, (r, r, r))
        add(bone_name, [Vector(x) for x in v], f, f'clay.{bone_name}.ball')
    return arm, pieces


# ---------------------------------------------------------------- solver

class Solver:
    """FK and analytic two-bone IK on the armature's rest data, in armature space."""

    def __init__(self, arm):
        self.order = [b[0] for b in BONE_DEFS]
        bones = arm.data.bones
        self.rest = {n: bones[n].matrix_local.copy() for n in self.order}
        self.parent = {b[0]: b[1] for b in BONE_DEFS}
        self.length = {n: bones[n].length for n in self.order}
        self.rel = {}
        for n in self.order:
            p = self.parent[n]
            self.rel[n] = self.rest[n] if p is None else self.rest[p].inverted() @ self.rest[n]
        self.rest3 = {n: self.rest[n].to_3x3() for n in self.order}

    def local_from_body(self, name, q_body, loc_body=None):
        """Convert a rotation about the body's axes into the bone's local basis matrix."""
        r = self.rest3[name]
        rot = r.inverted() @ q_body.to_matrix() @ r
        m = rot.to_4x4()
        if loc_body is not None:
            m.translation = r.inverted() @ Vector(loc_body)
        return m

    def fk(self, local):
        m = {}
        for n in self.order:
            p = self.parent[n]
            m[n] = (self.rel[n] if p is None else m[p] @ self.rel[n]) @ local[n]
        return m

    def set_world(self, name, m_world, m, local):
        p = self.parent[name]
        parent_space = self.rel[name] if p is None else m[p] @ self.rel[name]
        local[name] = parent_space.inverted() @ m_world
        m[name] = m_world

    def two_bone(self, m, local, upper, lower, end, target, hint, end_rot=None, toe=None, toe_rot=None):
        """Place `end`'s head at `target`, bending in the plane given by the FK joint and `hint`.

        Returns how far the target was out of reach in metres (0 when reached).
        """
        s = m[upper].translation.copy()
        a, b = self.length[upper], self.length[lower]
        joint_fk = m[lower].translation.copy()
        d_vec = target - s
        d = d_vec.length
        dc = min(max(d, abs(a - b) + 1e-4), a + b - 1e-4)
        n = d_vec.normalized()
        pv = (joint_fk - s) + hint * 0.02
        mperp = pv - n * pv.dot(n)
        if mperp.length < 1e-8:
            mperp = hint - n * hint.dot(n)
        mperp.normalize()
        cos_a = (a * a + dc * dc - b * b) / (2 * a * dc)
        sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
        joint = s + n * (a * cos_a) + mperp * (a * sin_a)
        wrist = s + n * dc

        r_up = m[upper].to_3x3()
        q = (r_up @ Y).rotation_difference((joint - s).normalized())
        m_up = Matrix.Translation(s) @ (q.to_matrix() @ r_up).to_4x4()
        self.set_world(upper, m_up, m, local)

        m_low = m_up @ self.rel[lower] @ local[lower]
        r_low = m_low.to_3x3()
        q = (r_low @ Y).rotation_difference((wrist - joint).normalized())
        m_low = Matrix.Translation(m_low.translation) @ (q.to_matrix() @ r_low).to_4x4()
        self.set_world(lower, m_low, m, local)

        m_end = m_low @ self.rel[end] @ local[end]
        rot = end_rot if end_rot is not None else m_end.to_3x3()
        m_end = Matrix.Translation(m_end.translation) @ rot.to_4x4()
        self.set_world(end, m_end, m, local)
        if toe:
            m_toe = m_end @ self.rel[toe] @ local[toe]
            rot = toe_rot if toe_rot is not None else m_toe.to_3x3()
            self.set_world(toe, Matrix.Translation(m_toe.translation) @ rot.to_4x4(), m, local)
        return max(0.0, d - dc)


def ease(u, kind):
    if kind == 'linear':
        return u
    if kind == 'in':
        return 1 - math.cos(u * math.pi / 2)
    if kind == 'out':
        return math.sin(u * math.pi / 2)
    return 0.5 - 0.5 * math.cos(u * math.pi)


def body_quat(rot_deg):
    from mathutils import Euler
    return Euler([math.radians(x) for x in rot_deg], 'XYZ').to_quaternion()


def sample_pose(spec, frame):
    """Blend the key poses for a frame. Returns (bone -> body quaternion, hips offset, heel lift)."""
    t = frame / spec['fps']
    prev = 'start'
    for ph in spec['phases']:
        if t <= ph['seconds'] + 1e-9:
            u = ease(t / ph['seconds'], ph['ease'])
            a, b = spec['poses'][prev], spec['poses'][ph['to']]
            break
        t -= ph['seconds']
        prev = ph['to']
    else:
        a = b = spec['poses']['start']
        u = 0.0
    from spec import BONES
    quats = {}
    for name in BONES:
        qa = body_quat(a['bones'].get(name, [0, 0, 0]))
        qb = body_quat(b['bones'].get(name, [0, 0, 0]))
        if qa.dot(qb) < 0:
            qb = -qb
        quats[name] = qa.slerp(qb, u)
    hips = [x + (y - x) * u for x, y in zip(a['hips_offset'], b['hips_offset'])]
    heel = a['heel_lift'] + (b['heel_lift'] - a['heel_lift']) * u
    return quats, hips, heel


def _hint(solver, m, bone, body_dir):
    """A body-axis direction carried along by the bone's current rotation from rest."""
    delta = m[bone].to_3x3() @ solver.rest3[bone].inverted()
    return (delta @ Vector(body_dir)).normalized()


class Equipment:
    """Places the equipment from the FK hands and gives the IK grip targets.

    two_hand_cup  one weight held in both hands (overhead extension, goblet squat)
    two_hand_bar  one bar held in both hands, grip_width apart along the bar
    each_hand     one weight per hand, following that hand (no arm IK needed)
    """

    def __init__(self, cfg):
        self.cfg = cfg
        self.hand_in_weight = None

    @staticmethod
    def _frame(centre, z, x_hint):
        z = z.normalized()
        x = x_hint - z * x_hint.dot(z)
        if x.length < 1e-6:
            x = Vector((0, -1, 0)) - z * (-z.y)
        x.normalize()
        rot = Matrix((x, z.cross(x), z)).transposed()
        return Matrix.Translation(centre) @ rot.to_4x4()

    def _hand_rot_in_weight(self, w3, fk_rot):
        """Hand orientations in the weight's frame, fixed for the whole clip.

        With `hand_dir` the hands point that way in the weight's frame (palms
        facing the weight's left-right axis). Otherwise the frame-0 FK
        orientation is captured and kept.
        """
        if self.hand_in_weight is None:
            self.hand_in_weight = {}
            for s in ('L', 'R'):
                if self.cfg.get('hand_dir'):
                    y = (w3 @ Vector(self.cfg['hand_dir'])).normalized()
                    x = Vector((1, 0, 0)) - y * y.x
                    x = x.normalized() if x.length > 1e-6 else Vector((0, -1, 0))
                    world = Matrix((x, y, x.cross(y))).transposed()
                else:
                    world = fk_rot[s]
                self.hand_in_weight[s] = w3.inverted() @ world
        return {s: w3 @ self.hand_in_weight[s] for s in ('L', 'R')}

    def frame(self, solver, m):
        """Returns (equipment world matrices, wrist targets or None, hand world rotations)."""
        cfg = self.cfg
        hand_rot, palms = {}, {}
        for s in ('L', 'R'):
            hm = m[f'hand.{s}']
            hand_rot[s] = hm.to_3x3()
            palms[s] = hm.translation + (hand_rot[s] @ Y) * cfg['palm']

        if cfg['hold'] == 'each_hand':
            mats = []
            for s in ('L', 'R'):
                delta = hand_rot[s] @ solver.rest3[f'hand.{s}'].inverted()
                axis = (delta @ Vector((0, -1, 0))).normalized()
                mats.append(self._frame(palms[s] + axis * cfg['along'], axis, hand_rot[s] @ Y))
            return mats, None, hand_rot

        if cfg['axis'] == 'vertical':
            axis = Vector((0, 0, 1))
        elif cfg['axis'] == 'across':
            axis = Vector((1, 0, 0))
        else:
            axis = -sum(((m[f'forearm.{s}'].to_3x3() @ Y) for s in ('L', 'R')), Vector()).normalized()
        if cfg['hold'] == 'two_hand_bar':
            side = axis.normalized()
            rot = self._frame(Vector(), side, Vector((0, -1, 0))).to_3x3()
        else:
            side = Vector((1, 0, 0)) - axis * axis.x
            side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
            rot = self._frame(Vector(), axis, side).to_3x3()
        locked = self._hand_rot_in_weight(rot, hand_rot)
        # Palms from the FK wrists with the hands already turned to their grip, so
        # the weight lands where the arms are actually reaching.
        palms = {s: m[f'hand.{s}'].translation + (locked[s] @ Y) * cfg['palm'] for s in ('L', 'R')}
        mid = (palms['L'] + palms['R']) / 2
        centre = mid + (side if cfg['hold'] == 'two_hand_bar' else axis.normalized()) * cfg['along']
        world = Matrix.Translation(centre) @ rot.to_4x4()
        half = cfg['grip_width'] / 2
        grips = {'L': mid + side * half, 'R': mid - side * half}
        targets = {s: grips[s] - (locked[s] @ Y) * cfg['palm'] for s in ('L', 'R')}
        return [world], targets, locked


def _foot_refs(solver, m):
    """Planted foot targets from the start pose: ankle on the floor, foot flat, FK yaw kept."""
    refs = {}
    for s in ('L', 'R'):
        fm = m[f'foot.{s}']
        rest = solver.rest[f'foot.{s}']
        d_fk, d_rest = fm.to_3x3() @ Y, rest.to_3x3() @ Y
        yaw = math.atan2(d_fk.y, d_fk.x) - math.atan2(d_rest.y, d_rest.x)
        rz = Matrix.Rotation(yaw, 3, 'Z')
        ankle = fm.translation.copy()
        ankle.z = rest.translation.z
        refs[s] = (ankle, rz @ rest.to_3x3(), rz @ solver.rest[f'toe.{s}'].to_3x3())
    return refs


def _auto_hip_drop(solver, m, refs):
    """How far the hips must come down so straight legs can reach planted feet.

    A wide stance swings the ankles up off the floor. Rather than leave the feet
    hovering, the whole body drops by the smallest amount that lets them land.
    """
    drop = 0.0
    for s in ('L', 'R'):
        hip = m[f'thigh.{s}'].translation
        ankle = refs[s][0]
        reach = solver.length[f'thigh.{s}'] + solver.length[f'shin.{s}'] - 1e-3
        h2 = (ankle.x - hip.x) ** 2 + (ankle.y - hip.y) ** 2
        v0 = hip.z - ankle.z
        if h2 + v0 * v0 > reach * reach and h2 < reach * reach:
            drop = max(drop, v0 - math.sqrt(reach * reach - h2))
    return drop


def solve(spec, solver):
    """Solve every frame. Returns per-frame bone locals and equipment matrices plus a report.

    Report fields (all should be close to 0):
      reach_error_mm   how far any IK target was out of reach
      hand_drift_mm    largest move of a palm relative to the weight since frame 0
      hand_turn_deg    largest turn of a hand relative to the weight since frame 0
      foot_slide_mm    largest horizontal move of the ball of a planted foot
      foot_miss_mm     largest gap between a planted ankle and where it should be
    """
    eq = Equipment(spec['equipment']) if spec['equipment']['type'] != 'none' else None
    planted = spec['feet'].get('planted', True)
    frames = []
    report = {'reach_error_mm': 0.0, 'hand_drift_mm': 0.0, 'hand_turn_deg': 0.0, 'foot_slide_mm': 0.0, 'foot_miss_mm': 0.0, 'auto_hip_drop_mm': 0.0}
    foot_ref = None
    hip_drop = 0.0
    hand_ref = None

    def pose_frame(f):
        quats, hips, heel = sample_pose(spec, f)
        hips = [hips[0], hips[1], hips[2] - hip_drop]
        local = {n: solver.local_from_body(n, quats[n], hips if n == 'hips' else None) for n in solver.order}
        return local, solver.fk(local), heel

    if planted:
        _, m0, _ = pose_frame(0)
        foot_ref = _foot_refs(solver, m0)
        hip_drop = _auto_hip_drop(solver, m0, foot_ref)
        report['auto_hip_drop_mm'] = hip_drop * 1000

    for f in range(spec['frames'] + 1):
        local, m, heel = pose_frame(f)
        foot_targets = {}
        if planted:
            for s in ('L', 'R'):
                ankle, frot, trot = foot_ref[s]
                if heel:
                    ball = ankle + frot @ Y * solver.length[f'foot.{s}']
                    lateral = (frot @ Y).cross(Vector((0, 0, 1))).normalized()
                    best = None
                    for sign in (1, -1):
                        r = Matrix.Rotation(math.radians(heel) * sign, 3, lateral)
                        a2 = ball + r @ (ankle - ball)
                        if best is None or a2.z > best[0].z:
                            best = (a2, r @ frot)
                    target, end_rot = best
                else:
                    target, end_rot = ankle, frot
                foot_targets[s] = target
                hint = _hint(solver, m, f'thigh.{s}', (0, -1, 0))
                err = solver.two_bone(m, local, f'thigh.{s}', f'shin.{s}', f'foot.{s}', target, hint, end_rot, f'toe.{s}', trot)
                report['reach_error_mm'] = max(report['reach_error_mm'], err * 1000)
            m = solver.fk(local)

        eq_world, targets = None, None
        if eq is not None:
            eq_world, targets, hand_rot = eq.frame(solver, m)
        if targets is not None:
            for s in ('L', 'R'):
                hint = _hint(solver, m, f'upper_arm.{s}', (0, 1, 0))
                err = solver.two_bone(m, local, f'upper_arm.{s}', f'forearm.{s}', f'hand.{s}', targets[s], hint, hand_rot[s])
                report['reach_error_mm'] = max(report['reach_error_mm'], err * 1000)
            m = solver.fk(local)
        if eq_world:
            # Measured on the final pose: does each palm stay put on the weight?
            now = {}
            for s in ('L', 'R'):
                hm = m[f'hand.{s}']
                palm = hm.translation + (hm.to_3x3() @ Y) * spec['equipment']['palm']
                w = eq_world[0 if len(eq_world) == 1 else ('L', 'R').index(s)]
                now[s] = (w.inverted() @ palm, (w.to_3x3().inverted() @ hm.to_3x3()).to_quaternion())
            if hand_ref is None:
                hand_ref = now
            for s in ('L', 'R'):
                drift = (now[s][0] - hand_ref[s][0]).length * 1000
                turn = math.degrees(now[s][1].rotation_difference(hand_ref[s][1]).angle)
                report['hand_drift_mm'] = max(report['hand_drift_mm'], drift)
                report['hand_turn_deg'] = max(report['hand_turn_deg'], min(turn, 360 - turn))
        if planted:
            for s in ('L', 'R'):
                ball_ref = foot_ref[s][0] + foot_ref[s][1] @ Y * solver.length[f'foot.{s}']
                ball = m[f'toe.{s}'].translation
                report['foot_slide_mm'] = max(report['foot_slide_mm'], math.hypot(ball.x - ball_ref.x, ball.y - ball_ref.y) * 1000)
                report['foot_miss_mm'] = max(report['foot_miss_mm'], (m[f'foot.{s}'].translation - foot_targets[s]).length * 1000)
        frames.append({'local': local, 'world': m, 'equipment': eq_world})
    return frames, report


def keyframe(arm, frames, solver, equipment_obs=()):
    """Write every solved frame as keyframes. The last solved frame equals the first, so it is skipped."""
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    prev_q = {}
    for f, fr in enumerate(frames[:-1]):
        for n in solver.order:
            pb = arm.pose.bones[n]
            loc, q, _ = fr['local'][n].decompose()
            if n in prev_q and prev_q[n].dot(q) < 0:
                q = -q
            prev_q[n] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if n == 'hips':
                pb.location = loc
                pb.keyframe_insert('location', frame=f)
        for ob, mat in zip(equipment_obs, fr['equipment'] or []):
            loc, q, _ = mat.decompose()
            ob.rotation_mode = 'QUATERNION'
            if ob.get('_prev_q') is not None and Quaternion(ob['_prev_q']).dot(q) < 0:
                q = -q
            ob['_prev_q'] = list(q)
            ob.location = loc
            ob.rotation_quaternion = q
            ob.keyframe_insert('location', frame=f)
            ob.keyframe_insert('rotation_quaternion', frame=f)
    for ob in (arm, *equipment_obs):
        if ob is None or not ob.animation_data or not ob.animation_data.action:
            continue
        _set_linear(ob.animation_data.action)


def _set_linear(action):
    curves = []
    if hasattr(action, 'fcurves'):
        curves = list(action.fcurves)
    if not curves and hasattr(action, 'layers'):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
