"""Build the realistic animated body: an MPFB 2 human fitted to the Hunyuan3D sculpt.

    blender --background --python tools/animate/character.py -- build
    blender --background --python tools/animate/character.py -- bake

`build` makes tools/animate/characters/mpfb_body.blend: an athletic adult male
from MPFB (CC0 output) with a Rigify rig, posed into the sculpt's A-pose (palms
forward) and gently conformed to its large shapes. `bake` adds the sculpt's
surface detail as a masked tangent-space normal map (body_normal.png).

Needs Blender 5.2 with the MPFB extension (extensions.blender.org, id "mpfb")
and its CC0 system assets. Rigify ships with Blender; it is enabled for the
session only. All outputs go to the gitignored tools/animate/characters/.
"""

import json
import math
import sys
import time
from pathlib import Path

import addon_utils
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
CHARS = HERE / 'characters'
SCULPT = CHARS / 'sculpt_v1_sym.glb'
BODY_BLEND = CHARS / 'mpfb_body.blend'
NORMAL_PNG = CHARS / 'body_normal.png'
MASK_PNG = CHARS / 'body_bake_mask.png'
SCULPT_SCALE = 0.91  # Hunyuan units to metres (1.957 -> 1.78 m)

# Fitted to the sculpt's torso and legs by a grid search on mean surface distance. The
# height value lands the posed body (legs brought in to the sculpt's stance) at 1.78 m.
MACROS = dict(gender=1.0, age=0.5, muscle=1.0, weight=0.67, proportions=1.0, height=0.5362,
              cupsize=0.5, firmness=0.5)

# Smoothing iterations for each conform pass, coarse to fine.
CONFORM_PASSES = (60, 30, 15)

# Bones posed to match the sculpt, with the local Euler channels searched (degrees).
POSE_SEARCH = {
    'upper_arm': ('x', 'y', 'z'),
    'forearm': ('x', 'y', 'z'),
    'hand': ('x', 'y', 'z'),
    'thigh': ('x', 'z'),
    'shin': ('x',),
}


def log(*a):
    print('CHAR', *a, flush=True)


def mpfb():
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.rigservice import RigService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService
    return HumanService, RigService, TargetService


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)


# ---------------------------------------------------------------- sculpt

def load_sculpt():
    """Sculpt in metres, feet on the floor, centred left-right. Returns (vertices, faces)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SCULPT))
    new = [o for o in bpy.data.objects if o not in before]
    ob = [o for o in new if o.type == 'MESH'][0]
    m = np.array(ob.matrix_world)
    v = np.array([tuple(x.co) for x in ob.data.vertices]) @ m[:3, :3].T + m[:3, 3]
    f = [tuple(p.vertices) for p in ob.data.polygons]
    for o in new:
        bpy.data.objects.remove(o)
    v *= SCULPT_SCALE
    v[:, 2] -= v[:, 2].min()
    return v, f


def torso_mid_y(p, h):
    t = p[(p[:, 2] > 0.5 * h) & (p[:, 2] < 0.75 * h) & (np.abs(p[:, 0]) < 0.1)]
    return (t[:, 1].min() + t[:, 1].max()) / 2


# ---------------------------------------------------------------- body sampling

class BodyProbe:
    """Evaluated body vertices (helpers excluded) and distance checks against the sculpt."""

    def __init__(self, body):
        self.body = body
        gi = body.vertex_groups['body'].index
        self.keep = np.array([any(g.group == gi and g.weight > 0.5 for g in v.groups) for v in body.data.vertices])
        self.faces = [tuple(p.vertices) for p in body.data.polygons if all(self.keep[i] for i in p.vertices)]

    def coords(self):
        mask_mods = [m for m in self.body.modifiers if m.type == 'MASK']
        for m in mask_mods:
            m.show_viewport = False
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.body.evaluated_get(dg)
        me = ev.to_mesh()
        mw = np.array(self.body.matrix_world)
        co = np.array([tuple(v.co) for v in me.vertices]) @ mw[:3, :3].T + mw[:3, 3]
        ev.to_mesh_clear()
        for m in mask_mods:
            m.show_viewport = True
        return co

    def bvh(self, co):
        return BVHTree.FromPolygons([tuple(x) for x in co], self.faces)


def mean_distance(points, bvh):
    total = 0.0
    for p in points:
        hit = bvh.find_nearest(Vector(p))
        total += (Vector(p) - hit[0]).length
    return total / max(1, len(points))


# ---------------------------------------------------------------- build

def build():
    HumanService, RigService, TargetService = mpfb()
    clear_scene()
    t0 = time.time()
    macros = TargetService.get_default_macro_info_dict()
    macros.update(MACROS)
    body = HumanService.create_human(macro_detail_dict=macros)
    body.name = 'Body'
    meta = HumanService.add_builtin_rig(body, 'rigify.human')
    # Generate Rigify first: MPFB's skin weights include deform bones (forearm twist
    # segments) that only exist in the generated rig, so posing must happen there.
    rig = RigService.generate_rigify_rig(meta)
    for side in ('L', 'R'):
        rig.pose.bones[f'upper_arm_parent.{side}']['IK_FK'] = 1.0
        rig.pose.bones[f'thigh_parent.{side}']['IK_FK'] = 1.0
    probe = BodyProbe(body)
    sv, sf = load_sculpt()
    H = np.ptp(sv[:, 2])

    co = probe.coords()
    sculpt_dy = torso_mid_y(co[probe.keep], H) - torso_mid_y(sv, H)
    sv[:, 1] += sculpt_dy
    log('heights sculpt %.4f body %.4f' % (H, np.ptp(co[probe.keep][:, 2])))

    # 1. Pose the FK controls so the limbs lie on the sculpt's.
    arm_pts = sv[(np.abs(sv[:, 0]) > 0.24) & (sv[:, 2] > 0.7)][::4]
    leg_pts = sv[(sv[:, 2] < 0.5 * H)][::8]
    targets = {'upper_arm': arm_pts, 'forearm': arm_pts, 'hand': arm_pts, 'thigh': leg_pts, 'shin': leg_pts}
    controls = {b: b + '_fk' for b in POSE_SEARCH}

    def set_angles(bone, angles):
        for side, sign in (('L', 1), ('R', -1)):
            pb = rig.pose.bones[f'{controls[bone]}.{side}']
            pb.rotation_mode = 'XYZ'
            x, y, z = angles
            pb.rotation_euler = (math.radians(x), math.radians(y * sign), math.radians(z * sign))

    def score(bone):
        c = probe.coords()
        pts = targets[bone][targets[bone][:, 0] > 0]
        return mean_distance(pts, probe.bvh(c))

    angles = {b: [0.0, 0.0, 0.0] for b in POSE_SEARCH}
    for step in (8.0, 4.0, 2.0, 1.0):
        for bone, axes in POSE_SEARCH.items():
            best = score(bone)
            for ax in axes:
                i = 'xyz'.index(ax)
                improved = True
                while improved:
                    improved = False
                    for d in (step, -step):
                        trial = list(angles[bone])
                        trial[i] += d
                        set_angles(bone, trial)
                        sc = score(bone)
                        if sc < best - 1e-5:
                            best, angles[bone], improved = sc, trial, True
                            break
                    set_angles(bone, angles[bone])
        log('pose step %.0f' % step, json.dumps({b: [round(a, 1) for a in v] for b, v in angles.items()}))

    # 2. Make that pose the rest pose. The posed mesh becomes the base shape (same
    #    topology, same weights), the metarig takes the rig's pose as its rest, and
    #    Rigify regenerates in place so the mesh binding is untouched.
    co_posed = probe.coords()
    bpy.context.view_layer.update()
    posed = {pb.name: pb.matrix.copy() for pb in rig.pose.bones}
    TargetService.bake_targets(body)
    inv = np.linalg.inv(np.array(body.matrix_world))
    body.data.vertices.foreach_set('co', (co_posed @ inv[:3, :3].T + inv[:3, 3]).ravel())
    body.data.update()

    meta.hide_set(False)
    meta.hide_viewport = False
    muted = []
    for pb in meta.pose.bones:
        for c in pb.constraints:
            if not c.mute:
                c.mute = True
                muted.append(c)
    by_depth = sorted(meta.pose.bones, key=lambda pb: len(pb.parent_recursive))
    for pb in by_depth:
        src = posed.get('ORG-' + pb.name) or posed.get(pb.name)
        if src is not None:
            pb.matrix = src
            bpy.context.view_layer.update()
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    bpy.context.view_layer.objects.active = meta
    meta.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for c in muted:
        c.mute = False
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    rig = RigService.generate_rigify_rig(meta)
    for side in ('L', 'R'):
        rig.pose.bones[f'upper_arm_parent.{side}']['IK_FK'] = 1.0
        rig.pose.bones[f'thigh_parent.{side}']['IK_FK'] = 1.0
    rest_err = np.abs(probe.coords() - co_posed).max()
    log('pose applied as rest; largest change at rest %.2f mm' % (rest_err * 1000))

    # 3. Conform to the sculpt inside the bake region, coarse to fine. Each pass moves the
    #    body part of the way with a smoothed displacement, so it follows the sculpt's
    #    large and mid-size forms while the normal map carries only the fine detail.
    for iters in CONFORM_PASSES:
        conform(body, probe, sv, sf, iters=iters)

    rig.name = 'Rig'
    co = probe.coords()
    sbvh = BVHTree.FromPolygons([tuple(x) for x in sv], sf)
    err = mean_distance(co[probe.keep][::5], sbvh)
    log('final mean distance to sculpt %.1f mm, height %.4f m, %.0f s' % (err * 1000, np.ptp(co[probe.keep][:, 2]), time.time() - t0))
    body['sculpt_dy'] = float(sculpt_dy)  # the bake places the sculpt with the same offset
    body['pose_match_deg'] = json.dumps(angles)
    bpy.ops.wm.save_as_mainfile(filepath=str(BODY_BLEND))
    log('saved', BODY_BLEND)


def bake_region_weights(body, rig=None):
    """1 on the torso, arms and legs; 0 on the hands, feet, head and crotch.

    The skin weights already blend smoothly across the wrists (forearm to hand) and the
    ankles (shin to foot), so the mask fades there for free. The neck ramps from 1 at its
    base to 0 under the head, and the crotch fades out over a soft ball.
    """
    n = len(body.data.vertices)
    groups = {g.index: g.name for g in body.vertex_groups}
    hand_foot = ('hand.', 'palm.', 'f_', 'thumb.', 'foot.', 'toe', 'heel')
    head = ('spine.006', 'jaw', 'eye', 'ear', 'brow', 'lid', 'lip', 'nose', 'cheek', 'chin', 'tongue', 'teeth', 'forehead', 'temple', 'tweak_spine.006')
    co = np.array([tuple(v.co) for v in body.data.vertices])
    z_neck0, z_neck1 = None, None
    if rig is not None and 'DEF-spine.005' in rig.data.bones:
        nb = rig.data.bones['DEF-spine.005']
        z_neck0, z_neck1 = nb.head_local.z, nb.tail_local.z
    excl = np.zeros(n)
    for v in body.data.vertices:
        w = 0.0
        for g in v.groups:
            name = groups.get(g.group, '').replace('DEF-', '')
            if name.startswith(hand_foot) or name.startswith(head) or name == 'genitals':
                w += g.weight
            elif name.startswith('spine.005') and z_neck0 is not None:
                t = (co[v.index, 2] - z_neck0) / max(1e-6, z_neck1 - z_neck0)
                w += g.weight * min(1.0, max(0.0, t))
        excl[v.index] = min(1.0, w)
    # Crotch: a soft ball where the thighs meet.
    keep = np.abs(co[:, 0]) < 0.03
    if keep.any():
        z_crotch = co[keep & (co[:, 2] > 0.6) & (co[:, 2] < 1.0), 2].min() if (keep & (co[:, 2] > 0.6) & (co[:, 2] < 1.0)).any() else 0.85
        y_crotch = np.median(co[keep & (np.abs(co[:, 2] - z_crotch) < 0.05), 1])
        d = np.linalg.norm(co - np.array([0.0, y_crotch, z_crotch]), axis=1)
        excl = np.maximum(excl, np.clip(1.0 - (d - 0.05) / 0.06, 0.0, 1.0))
    return 1.0 - excl


def conform(body, probe, sv, sf, iters=60, clamp=0.03):
    """Move body vertices part of the way to the sculpt with a heavily smoothed displacement,
    so the body takes the sculpt's proportions while the normal map keeps only fine detail."""
    co = probe.coords()
    mw = np.array(body.matrix_world)
    sbvh = BVHTree.FromPolygons([tuple(x) for x in sv], sf)
    weight = bake_region_weights(body) * probe.keep
    disp = np.zeros_like(co)
    for i in np.nonzero(weight > 0)[0]:
        hit = sbvh.find_nearest(Vector(co[i]))
        if hit[0] is not None:
            d = np.array(hit[0]) - co[i]
            ln = np.linalg.norm(d)
            disp[i] = d * min(1.0, clamp / ln) if ln > 1e-9 else 0
    bm = bmesh.new()
    bm.from_mesh(body.data)
    edges = np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges])
    bm.free()
    deg = np.zeros(len(co))
    np.add.at(deg, edges[:, 0], 1)
    np.add.at(deg, edges[:, 1], 1)
    for _ in range(iters):
        s = np.zeros_like(disp)
        np.add.at(s, edges[:, 0], disp[edges[:, 1]])
        np.add.at(s, edges[:, 1], disp[edges[:, 0]])
        disp = 0.5 * disp + 0.5 * s / np.maximum(deg, 1)[:, None]
    disp *= weight[:, None]
    base = np.array([tuple(v.co) for v in body.data.vertices])
    body.data.vertices.foreach_set('co', (base + disp @ np.linalg.inv(mw[:3, :3]).T).ravel())
    body.data.update()
    mag = np.linalg.norm(disp, axis=1)[weight > 0.5]
    log('conform: mean move %.1f mm, max %.1f mm' % (mag.mean() * 1000, mag.max() * 1000))


def clay_material(normal_image=None, strength=1.0):
    mat = bpy.data.materials.new('BodyClay')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.42, 0.42, 0.43, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.62
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.3
    if normal_image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.name = 'BodyNormalTex'
        tex.image = normal_image
        tex.image.colorspace_settings.name = 'Non-Color'
        nmap = nt.nodes.new('ShaderNodeNormalMap')
        nmap.space = 'TANGENT'
        nmap.uv_map = 'UVMap'
        nmap.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def enable_gpu_cycles(scene, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA', 'METAL', 'HIP'):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == backend
            scene.cycles.device = 'GPU'
            return backend
    scene.cycles.device = 'CPU'
    return 'CPU'


def bake(size=4096, extrusion=0.0225, max_ray=0.045, max_tilt_deg=55.0):
    """Bake the sculpt's detail onto the body's UVs, masked to torso, arms and legs."""
    bpy.ops.wm.open_mainfile(filepath=str(BODY_BLEND))
    addon_utils.enable('rigify', default_set=True)
    scene = bpy.context.scene
    body = bpy.data.objects['Body']
    rig = bpy.data.objects['Rig']
    t0 = time.time()

    sv, sf = load_sculpt()
    sv[:, 1] += body['sculpt_dy']
    me = bpy.data.meshes.new('SculptHigh')
    me.from_pydata([tuple(x) for x in sv], [], sf)
    for poly in me.polygons:
        poly.use_smooth = True
    high = bpy.data.objects.new('SculptHigh', me)
    scene.collection.objects.link(high)

    # Bake targets: one image for the normals, one for the mask.
    img = bpy.data.images.new('BodyNormalRaw', size, size, alpha=False, float_buffer=True, is_data=True)
    img_mask = bpy.data.images.new('BodyMask', size, size, alpha=False, float_buffer=True, is_data=True)
    mat = clay_material()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.nodes.active = tex
    body.data.materials.clear()
    body.data.materials.append(mat)

    backend = enable_gpu_cycles(scene, 16)
    bk = scene.render.bake
    bk.use_selected_to_active = True
    bk.use_cage = False
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = max_ray
    bk.normal_space = 'TANGENT'
    bk.margin = 16
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    high.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.bake(type='NORMAL')
    log('normal bake done (%s) in %.0f s' % (backend, time.time() - t0))

    # Mask: per-vertex weights as a colour attribute, baked as emission on the body alone.
    weights = bake_region_weights(body, rig)
    attr = body.data.color_attributes.new('bake_mask', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.repeat(weights, 4).reshape(-1, 4).astype(np.float32).ravel())
    nt = mat.node_tree
    attr_node = nt.nodes.new('ShaderNodeVertexColor')
    attr_node.layer_name = 'bake_mask'
    emit = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes['Material Output']
    old_link = out.inputs['Surface'].links[0]
    old_from = old_link.from_socket
    nt.links.new(attr_node.outputs['Color'], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    tex.image = img_mask
    bk.use_selected_to_active = False
    high.select_set(False)
    bpy.ops.object.bake(type='EMIT')
    nt.links.new(old_from, out.inputs['Surface'])

    # Blend to flat normals outside the mask and save.
    n = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(n)
    m = np.empty(size * size * 4, np.float32)
    img_mask.pixels.foreach_get(m)
    n = n.reshape(-1, 4)
    w = np.clip(m.reshape(-1, 4)[:, 0:1], 0, 1)
    # Stray rays (armpits, inner thighs, where another limb of the sculpt is within reach)
    # show up as steeply tilted normals. Real muscle detail is far gentler, so fade
    # anything tilted past max_tilt_deg back to flat.
    vec = n[:, :3] * 2 - 1
    tilt = np.degrees(np.arccos(np.clip(vec[:, 2] / np.maximum(np.linalg.norm(vec, axis=1), 1e-6), -1, 1)))
    w *= np.clip((max_tilt_deg - tilt) / 15.0, 0, 1)[:, None]
    flat = np.array([0.5, 0.5, 1.0], np.float32)
    n[:, :3] = n[:, :3] * w + flat * (1 - w)
    log('pixels faded for tilt: %.2f%%' % (100 * np.mean((tilt > max_tilt_deg - 15) & (m.reshape(-1, 4)[:, 0] > 0.01))))
    out_img = bpy.data.images.new('BodyNormal', size, size, alpha=False, float_buffer=True, is_data=True)
    out_img.pixels.foreach_set(n.ravel())
    out_img.filepath_raw = str(NORMAL_PNG)
    out_img.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    out_img.save_render(str(NORMAL_PNG), scene=scene) if hasattr(out_img, 'save_render') else out_img.save()
    img_mask.filepath_raw = str(MASK_PNG)
    img_mask.file_format = 'PNG'
    img_mask.save()
    log('saved', NORMAL_PNG, MASK_PNG, '%.0f s' % (time.time() - t0))

    # Final material on the body, referencing the saved map.
    bpy.data.objects.remove(high)
    normal = bpy.data.images.load(str(NORMAL_PNG), check_existing=False)
    body.data.materials.clear()
    body.data.materials.append(clay_material(normal))
    body.data.color_attributes.remove(body.data.color_attributes['bake_mask'])
    bpy.ops.wm.save_as_mainfile(filepath=str(BODY_BLEND))
    log('saved', BODY_BLEND)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    addon_utils.enable('rigify', default_set=True)  # session only in background mode
    cmd = argv[0] if argv else 'build'
    if cmd == 'build':
        build()
    elif cmd == 'bake':
        bake()
    else:
        sys.exit(f'unknown command {cmd}')


if __name__ == '__main__':
    main()
