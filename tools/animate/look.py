"""Scene look: clay and backdrop materials, lights, camera framing, equipment
meshes, glow lines and the compositor that layers the glow over the body."""

import math

import bpy
from mathutils import Matrix, Vector

import rig

CLAY = (0.42, 0.42, 0.43)
BACKDROP = (0.012, 0.012, 0.014)
MAT = (0.028, 0.028, 0.031)
IRON = (0.075, 0.075, 0.08)
WIDTH, HEIGHT = 540, 960
BADGE_SIZE, BADGE_MARGIN = 76, 22  # at 540 px wide; scaled with the width
BADGE_BOX = BADGE_MARGIN + BADGE_SIZE + 6  # badge margin + size + clearance, in pixels


def set_resolution(width, height):
    """Output size. The badge (and the camera's keep-clear box for it) scale with the width."""
    global WIDTH, HEIGHT, BADGE_SIZE, BADGE_MARGIN, BADGE_BOX
    k = width / 540
    WIDTH, HEIGHT = width, height
    BADGE_SIZE, BADGE_MARGIN = round(76 * k), round(22 * k)
    BADGE_BOX = BADGE_MARGIN + BADGE_SIZE + round(6 * k)


# ---------------------------------------------------------------- materials

def principled(name, colour, roughness=0.6, metallic=0.0, specular=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = specular
    return mat


def emission(name, colour, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*colour, 1.0)
    em.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


# ---------------------------------------------------------------- scene

def _enable_cycles_gpu():
    """Turn on the best GPU backend Cycles can find (OptiX or CUDA on NVIDIA,
    Metal on Apple, HIP on AMD). Returns False if there is none, so Cycles falls
    back to the CPU instead of failing."""
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
    except KeyError:
        return False
    for backend in ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == backend
            print(f'Cycles: using {backend} on {", ".join(d.name for d in gpus)}')
            return True
    return False


def setup_render(scene, samples, engine='eevee', width=540, height=960):
    set_resolution(width, height)
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = WIDTH, HEIGHT, 100
    r.fps = 30
    r.film_transparent = True
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'
    r.image_settings.compression = 15
    if engine == 'cycles':
        r.engine = 'CYCLES'
        scene.cycles.samples = samples
        scene.cycles.device = 'GPU' if _enable_cycles_gpu() else 'CPU'
    else:
        r.engine = 'BLENDER_EEVEE'
        scene.eevee.taa_render_samples = samples
        scene.eevee.use_shadows = True
        scene.eevee.use_raytracing = False
        scene.eevee.use_fast_gi = True
        # Soft shadows from big area lights need several rays per sample, or they show
        # grain on a smooth back seen from behind.
        scene.eevee.shadow_ray_count = 4
        scene.eevee.shadow_step_count = 12
        scene.eevee.shadow_resolution_scale = 1.0
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.0
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*BACKDROP, 1.0)
    bg.inputs['Strength'].default_value = 0.35
    scene.world = world


def _cam_basis(azimuth, elevation):
    az, el = math.radians(azimuth), math.radians(elevation)
    to_cam = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    return to_cam


def fit_camera(scene, cam_cfg, points):
    """Place the camera at the spec's angle and pull back until every point fits.

    Azimuth 0 looks at the character's front, 90 at its left side, 180 at its back.
    """
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = cam_cfg['lens']
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.sensor_height = 36.0
    cam_data.clip_start, cam_data.clip_end = 0.05, 60
    cam = bpy.data.objects.new('Camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    if cam_cfg.get('min_z') is not None:
        points = [p for p in points if p.z >= cam_cfg['min_z']]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    target = Vector(cam_cfg['target']) if cam_cfg.get('target') else (lo + hi) / 2
    to_cam = _cam_basis(cam_cfg['azimuth'], cam_cfg['elevation'])
    ty = 18.0 / cam_cfg['lens']
    tx = ty * WIDTH / HEIGHT
    margin = cam_cfg['margin']

    def orient(pos, tgt):
        return (tgt - pos).to_track_quat('-Z', 'Y').to_matrix()

    def extents(d, tgt):
        pos = tgt + to_cam * d
        rinv = orient(pos, tgt).transposed()
        xs, ys = [], []
        for p in points:
            v = rinv @ (p - pos)
            depth = -v.z
            xs.append(v.x / depth / tx)
            ys.append(v.y / depth / ty)
        return min(xs), max(xs), min(ys), max(ys)

    # The badge sits in the top-right corner (see render.py); keep the figure out of it.
    badge_x = 1 - 2 * (BADGE_BOX / WIDTH)
    badge_y = 1 - 2 * (BADGE_BOX / HEIGHT)

    def fits(d, tgt):
        pos = tgt + to_cam * d
        rinv = orient(pos, tgt).transposed()
        lim = 1 - margin
        for p in points:
            v = rinv @ (p - pos)
            depth = -v.z
            if depth <= 0:
                return False
            x, y = v.x / depth / tx, v.y / depth / ty
            if abs(x) > lim or abs(y) > lim or (x > badge_x and y > badge_y):
                return False
        return True

    def search(tgt):
        if cam_cfg.get('distance') is not None:
            return cam_cfg['distance']
        near, far = 0.5, 40.0
        for _ in range(40):
            mid = (near + far) / 2
            near, far = (near, mid) if fits(mid, tgt) else (mid, far)
        return far

    distance = search(target)
    if not cam_cfg.get('target'):
        # Recentre on the projected bounds so the figure sits in the middle of the frame.
        for _ in range(3):
            x0, x1, y0, y1 = extents(distance, target)
            pos = target + to_cam * distance
            depth = (target - pos).length
            target = target + orient(pos, target) @ Vector(((x0 + x1) / 2 * tx * depth, (y0 + y1) / 2 * ty * depth, 0))
            distance = search(target)
    pos = target + to_cam * distance
    cam.matrix_world = Matrix.Translation(pos) @ orient(pos, target).to_4x4()
    cam_data.shift_y = cam_cfg.get('shift_y', 0.0)
    return cam, target, distance


def add_lights(scene, cam_cfg, target, style='mannequin'):
    """Soft key from the camera side, two rims from behind the figure, faint fill.
    The realistic body also gets a soft top light so the shoulders and back read clearly
    from behind, and area lights instead of spots for softer shadows."""
    az = cam_cfg['azimuth']

    def light(name, kind, energy, az_off, el, dist, size, colour=(1, 1, 1)):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = colour
        if kind == 'AREA':
            d.shape = 'DISK'
            d.size = size
        elif kind == 'SPOT':
            d.spot_size = math.radians(40)
            d.spot_blend = 0.6
            d.shadow_soft_size = size
        ob = bpy.data.objects.new(name, d)
        scene.collection.objects.link(ob)
        pos = target + _cam_basis(az + az_off, el) * dist
        ob.matrix_world = Matrix.Translation(pos) @ (target - pos).to_track_quat('-Z', 'Y').to_matrix().to_4x4()
        return ob

    if style == 'mpfb':
        light('Key', 'AREA', 260, -32, 38, 3.4, 1.8, (1.0, 0.97, 0.93))
        light('Fill', 'AREA', 45, 75, 12, 4.0, 3.0, (0.9, 0.94, 1.0))
        light('RimL', 'AREA', 420, 140, 25, 3.0, 0.9, (0.9, 0.95, 1.0))
        light('RimR', 'AREA', 420, -140, 25, 3.0, 0.9, (0.9, 0.95, 1.0))
        top = bpy.data.lights.new('Top', 'AREA')
        top.energy, top.size, top.shape = 120, 1.6, 'DISK'
        tob = bpy.data.objects.new('Top', top)
        scene.collection.objects.link(tob)
        tob.location = target + Vector((0, 0, 2.6))
        return
    light('Key', 'SPOT', 380, -38, 40, 3.6, 0.6, (1.0, 0.97, 0.93))
    light('Fill', 'AREA', 30, 70, 10, 4.0, 3.0, (0.9, 0.94, 1.0))
    light('RimL', 'SPOT', 520, 145, 22, 3.2, 0.35, (0.9, 0.95, 1.0))
    light('RimR', 'SPOT', 520, -145, 22, 3.2, 0.35, (0.9, 0.95, 1.0))


def add_backdrop(collection, cam_cfg, style='mannequin', mat=True):
    """A cyclorama (floor that curves up into a wall) behind the figure, plus a floor mat.
    The realistic body's softer, brighter lights get a darker backdrop and mat, so both
    still read as dark charcoal."""
    k = 0.5 if style == 'mpfb' else 1.0
    back = principled('Backdrop', tuple(c * k for c in BACKDROP), roughness=0.92, specular=0.2)
    mat_m = principled('FloorMat', tuple(c * k for c in MAT), roughness=0.85, specular=0.25)
    prof = [(-9.0, 0.0), (2.2, 0.0)]
    radius = 2.4
    for i in range(1, 13):
        a = (math.pi / 2) * i / 12
        prof.append((2.2 + radius * math.sin(a), radius * (1 - math.cos(a))))
    prof.append((2.2 + radius, 9.0))
    half = 9.0
    verts, faces = [], []
    for fwd, up in prof:
        verts.append((-half, fwd, up))
        verts.append((half, fwd, up))
    for i in range(len(prof) - 1):
        a, b = 2 * i, 2 * i + 2
        faces.append((a, a + 1, b + 1, b))
    ob = rig._mesh_object('Cyclorama', [Vector(v) for v in verts], faces, back, collection)
    # Built with the wall at +Y; rotating by the azimuth puts it opposite the camera.
    ob.rotation_euler = (0, 0, math.radians(cam_cfg['azimuth']))
    ob.location.z = -0.001

    if not mat:
        return
    # Rounded floor mat under the feet.
    w, d, r, th = 0.62, 0.95, 0.08, 0.012
    pts = []
    for cx, cy, a0 in ((w - r, d - r, 0), (-w + r, d - r, 90), (-w + r, -d + r, 180), (w - r, -d + r, 270)):
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    n = len(pts)
    verts = [Vector((x, y, -th)) for x, y in pts] + [Vector((x, y, 0.0)) for x, y in pts]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    mat = rig._mesh_object('FloorMat', verts, faces, mat_m, collection)
    for p in mat.data.polygons:
        p.use_smooth = False
    mat.location.y = -0.02


# ---------------------------------------------------------------- equipment

def _rounded_drum(radius, half_len, fillet, n=5):
    """Profile for a solid round plate with filleted edges, along 0..2*half_len."""
    pts = [(0.0, 0.0)]
    for i in range(n + 1):
        a = (math.pi / 2) * i / n
        pts.append((fillet - fillet * math.cos(a), radius - fillet + fillet * math.sin(a)))
    for i in range(n + 1):
        a = (math.pi / 2) * i / n
        pts.append((2 * half_len - fillet + fillet * math.sin(a), radius - fillet + fillet * math.cos(a)))
    pts.append((2 * half_len, 0.0))
    return pts


def _drum(name, centre_z, radius, half_len, fillet, material, collection):
    origin = Vector((0, 0, centre_z - half_len))
    v, f = rig._lathe(_rounded_drum(radius, half_len, fillet), origin, Vector((0, 0, 1)), Vector((1, 0, 0)))
    return rig._mesh_object(name, v, f, material, collection)


def build_equipment(cfg, collection):
    """Returns the objects whose transforms are keyed per frame (one per held item)."""
    if cfg['type'] == 'none':
        return []
    iron = principled('Iron', IRON, roughness=0.42, metallic=0.55, specular=0.5)
    steel = principled('Steel', (0.42, 0.42, 0.44), roughness=0.28, metallic=0.9, specular=0.5)
    count = 2 if cfg['hold'] == 'each_hand' else 1
    roots = []
    for i in range(count):
        root = bpy.data.objects.new(f'Equipment.{i}', None)
        collection.objects.link(root)
        parts = []
        if cfg['type'] == 'dumbbell':
            handle = cfg.get('handle', 0.13)
            r = cfg.get('plate_radius', 0.062)
            hl = cfg.get('plate_half', 0.042)
            parts.append(_drum('Handle', 0, 0.016, handle / 2 + 0.01, 0.004, steel, collection))
            parts.append(_drum('BellTop', handle / 2 + hl, r, hl, 0.012, iron, collection))
            parts.append(_drum('BellBottom', -handle / 2 - hl, r, hl, 0.012, iron, collection))
        else:
            bar = cfg.get('bar_length', 1.6)
            parts.append(_drum('Bar', 0, 0.014, bar / 2, 0.003, steel, collection))
            plate_at = bar / 2 - cfg.get('plate_inset', 0.28)
            for sgn in (1, -1):
                parts.append(_drum('Plate', sgn * plate_at, cfg.get('plate_radius', 0.225), 0.03, 0.01, iron, collection))
                parts.append(_drum('Collar', sgn * (plate_at - 0.05), 0.03, 0.02, 0.004, steel, collection))
        for p in parts:
            p.parent = root
        roots.append(root)
    return roots


def equipment_points(cfg, mats):
    """A coarse hull of the equipment for camera fitting."""
    if cfg['type'] == 'none':
        return []
    pts = []
    for m in mats:
        if cfg['type'] == 'dumbbell':
            zr = cfg.get('handle', 0.13) / 2 + 2 * cfg.get('plate_half', 0.042)
            rr = cfg.get('plate_radius', 0.062)
        else:
            zr, rr = cfg.get('bar_length', 1.6) / 2, cfg.get('plate_radius', 0.225)
        for z in (-zr, zr):
            for a in range(0, 360, 45):
                pts.append(m @ Vector((rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), z)))
    return pts


# ---------------------------------------------------------------- glow

def build_glow(arm, glow, collection, bone_map=None):
    """Emissive tubes along each working bone, optionally with dots on the joints. They
    are parented to the bones, so they follow the solved pose every frame. `bone_map`
    maps spec bone names to the armature's (for the Rigify rig: ORG bones)."""
    mat = emission('Glow', glow['colour'], 1.0)
    dot_mat = emission('GlowDot', [min(1.0, 0.3 + c) for c in glow['colour']], 1.5)
    joints = []
    for spec_name in glow['bones']:
        name = bone_map.get(spec_name, spec_name) if bone_map else spec_name
        bone = arm.data.bones[name]
        cu = bpy.data.curves.new(f'glow.{name}', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = glow['radius']
        cu.bevel_resolution = 3
        cu.use_fill_caps = True
        sp = cu.splines.new('POLY')
        sp.points.add(1)
        sp.points[0].co = (0, 0, 0, 1)
        sp.points[1].co = (0, bone.length, 0, 1)
        cu.materials.append(mat)
        ob = bpy.data.objects.new(f'glow.{name}', cu)
        collection.objects.link(ob)
        rig.parent_to_bone(ob, arm, name)
        joints += [(name, 0.0), (name, bone.length)]
    if glow['joints']:
        seen = []
        for name, y in joints:
            bone = arm.data.bones[name]
            world = bone.matrix_local @ Vector((0, y, 0))
            if any((world - s).length < 1e-4 for s in seen):
                continue
            seen.append(world)
            v, f = rig._ellipsoid((0, y, 0), (glow['radius'] * 1.55,) * 3, rings=10)
            ob = rig._mesh_object(f'glow.dot.{name}.{y:.2f}', [Vector(p) for p in v], f, dot_mat, collection)
            rig.parent_to_bone(ob, arm, name)


def apply_tint(body, colour, strength):
    """Mix the variant colour into the clay over the 'muscle_tint' attribute (see body.muscle_tint)."""
    for mat in body.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        base = tuple(bsdf.inputs['Base Color'].default_value)
        attr = nt.nodes.new('ShaderNodeAttribute')
        attr.attribute_name = 'muscle_tint'
        attr.attribute_type = 'GEOMETRY'
        fac = nt.nodes.new('ShaderNodeMath')
        fac.operation = 'MULTIPLY'
        fac.inputs[1].default_value = strength
        nt.links.new(attr.outputs['Fac'], fac.inputs[0])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs[6].default_value = base
        mix.inputs[7].default_value = (*colour, 1.0)
        nt.links.new(fac.outputs[0], mix.inputs[0])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


# ---------------------------------------------------------------- compositor

def setup_compositor(scene, body_layer, glow_layer):
    """body, then the crisp glow lines over it, then a soft bloom of the lines added on top."""
    ng = bpy.data.node_groups.new('Composite', 'CompositorNodeTree')
    ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    nodes, links = ng.nodes, ng.links
    rl_body = nodes.new('CompositorNodeRLayers')
    rl_body.scene, rl_body.layer = scene, body_layer.name
    rl_glow = nodes.new('CompositorNodeRLayers')
    rl_glow.scene, rl_glow.layer = scene, glow_layer.name

    over = nodes.new('CompositorNodeAlphaOver')
    links.new(rl_body.outputs['Image'], over.inputs['Background'])
    links.new(rl_glow.outputs['Image'], over.inputs['Foreground'])

    glare = nodes.new('CompositorNodeGlare')
    glare.inputs['Type'].default_value = 'Bloom'
    glare.inputs['Quality'].default_value = 'High'
    glare.inputs['Threshold'].default_value = 0.35
    glare.inputs['Strength'].default_value = 0.9
    glare.inputs['Size'].default_value = 0.3
    glare.inputs['Saturation'].default_value = 1.15
    links.new(rl_glow.outputs['Image'], glare.inputs['Image'])

    add = nodes.new('ShaderNodeMix')
    add.data_type = 'RGBA'
    add.blend_type = 'ADD'
    add.inputs[0].default_value = 0.7
    links.new(over.outputs['Image'], add.inputs[6])
    links.new(glare.outputs['Glare'], add.inputs[7])

    out = nodes.new('NodeGroupOutput')
    links.new(add.outputs[2], out.inputs['Image'])
    scene.compositing_node_group = ng
    scene.render.use_compositing = True
