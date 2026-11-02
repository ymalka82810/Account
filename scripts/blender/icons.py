"""מרנדר אייקונים תלת-ממדיים לממשק (במקום האימוג'י). דורש Blender 4.x (Cycles CPU, בלי denoiser).

    blender -b -P scripts/blender/icons.py -- --all /tmp/ui_raw 384 64
    blender -b -P scripts/blender/icons.py -- fly-money out.png 384 64      (אייקון בודד)
    python3 scripts/blender/compose_ui_icons.py /tmp/ui_raw

אייקונים: fly-money ("אני חייב"), handshake ("חייבים לי"/חברים), money-bag (הכסף שלי), scroll (מה היה),
notebook (הפנקס), family (המשפחה).
"""
import bpy, math, sys, os


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (c[0], c[1], c[2], 1)


def mat(name, base, metal=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(base) if isinstance(base, str) else base
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    return m


def setup(res, samples, dist=8.5):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False  # ה-build של Ubuntu בלי OpenImageDenoise
    sc.cycles.sample_clamp_indirect = 3.0
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Filmic'

    # אותה תאורה כמו coin.py, כדי שהאייקונים ייראו כמשפחה אחת עם המטבעות והמטילים
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    bg = nt.nodes.new('ShaderNodeBackground')
    o = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (0.3, 0.32, 0.42, 1)
    ramp.color_ramp.elements[1].color = (1, 0.98, 0.94, 1)
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.7
    nt.links.new(bg.outputs[0], o.inputs[0])

    def area(loc, energy, size, rot):
        bpy.ops.object.light_add(type='AREA', location=loc)
        l = bpy.context.object
        l.data.energy = energy
        l.data.size = size
        l.rotation_euler = rot
    area((-3, -4, 3), 450, 4, (math.radians(55), 0, math.radians(-35)))
    area((3.5, -3, -1), 180, 4, (math.radians(80), 0, math.radians(40)))

    bpy.ops.object.camera_add(location=(0, -dist, 0))
    cam = bpy.context.object
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.lens = 70
    sc.camera = cam
    return sc


def bevel(obj, width=0.04, seg=4):
    m = obj.modifiers.new('b', 'BEVEL')
    m.width = width
    m.segments = seg


def box(size, loc, material, rot=(0, 0, 0), bev=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    o.rotation_euler = rot
    bevel(o, bev)
    o.data.materials.append(material)
    return o


def ball(radius, loc, material, scale=(1, 1, 1), rot=(0, 0, 0), seg=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.object
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def cyl(radius, depth, loc, material, rot=(0, 0, 0), verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.rotation_euler = rot
    bevel(o, min(radius, depth) * 0.12, 3)
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def pivot_of(parts, rot, loc=(0, 0, 0)):
    bpy.ops.object.empty_add(location=loc)
    p = bpy.context.object
    for o in parts:
        o.parent = p
    p.rotation_euler = rot
    return p


# ---------------------------------------------------------------- שטר מעופף
def build_fly_money():
    green = mat('note', '#3fae5a', 0.0, 0.38, 0.4)
    green_in = mat('note_in', '#8fe0a0', 0.0, 0.55)
    gold = mat('gold', (1.0, 0.72, 0.16, 1), 1.0, 0.22)
    white = mat('wing', '#ffffff', 0.0, 0.32, 0.3)
    wing_sh = mat('wing_sh', '#cfe4ff', 0.0, 0.4)

    parts = []
    # השטר: לוח מעוגל + מסגרת פנימית בהירה + מטבע מרכזי
    parts.append(box((2.5, 0.09, 1.3), (0, 0, 0), green, bev=0.05))
    parts.append(box((2.2, 0.095, 1.02), (0, -0.004, 0), green_in, bev=0.03))
    parts.append(box((2.08, 0.1, 0.9), (0, -0.008, 0), green, bev=0.025))
    parts.append(cyl(0.38, 0.06, (0, -0.07, 0), gold, rot=(math.pi / 2, 0, 0)))
    for sx in (-1, 1):  # עיגולי פינה
        parts.append(cyl(0.12, 0.05, (sx * 0.88, -0.07, 0), gold, rot=(math.pi / 2, 0, 0)))

    # כנפיים: מניפת נוצות מכל צד
    for sx in (-1, 1):
        for i, (ang, ln, z) in enumerate([(52, 1.45, 0.42), (30, 1.7, 0.2), (10, 1.7, -0.02), (-12, 1.45, -0.22)]):
            a = math.radians(ang)
            cx = sx * (1.25 + math.cos(a) * ln * 0.5)
            cz = 0.1 + math.sin(a) * ln * 0.5 + (z - 0.1) * 0.0
            f = ball(0.2, (cx, 0.12 + i * 0.01, cz), white if i % 2 == 0 else wing_sh,
                     scale=(ln * 2.4, 0.38, 1.0), rot=(0, sx * -a, 0))
            parts.append(f)
        # בסיס הכנף
        parts.append(ball(0.34, (sx * 1.3, 0.1, 0.05), white, scale=(1, 0.6, 1.2)))

    return pivot_of(parts, (math.radians(-6), math.radians(-14), math.radians(-16)))


# ---------------------------------------------------------------- לחיצת יד
def build_handshake():
    skin_a = mat('skin_a', '#f2c08a', 0.0, 0.5)
    skin_b = mat('skin_b', '#c98f5b', 0.0, 0.5)
    sleeve_a = mat('sleeve_a', '#3b6fd8', 0.0, 0.45, 0.2)
    sleeve_b = mat('sleeve_b', '#2f8f6b', 0.0, 0.45, 0.2)
    cuff = mat('cuff', '#ffffff', 0.0, 0.4)

    parts = []
    for sx, skin, sleeve in ((-1, skin_a, sleeve_a), (1, skin_b, sleeve_b)):
        # שרוול + חפתים
        parts.append(cyl(0.62, 1.15, (sx * 2.15, 0, -0.1), sleeve, rot=(0, math.pi / 2, 0)))
        parts.append(cyl(0.58, 0.16, (sx * 1.55, 0, -0.1), cuff, rot=(0, math.pi / 2, 0)))
        # כף היד (קופסה מעוגלת)
        parts.append(box((1.5, 0.82, 0.98), (sx * 0.85, 0.0 if sx < 0 else -0.14, -0.1), skin, bev=0.16))
    # אצבעות הימנית עוטפות מלמעלה את היד השמאלית: 4 קפסולות מוטות
    for i in range(4):
        z = 0.38 - i * 0.26
        parts.append(ball(0.15, (-0.15 - i * 0.02, -0.66, z), skin_b, scale=(2.7, 1.0, 1.0), rot=(0, math.radians(-12), 0)))
    # אגודלים למעלה
    parts.append(ball(0.17, (0.35, -0.55, 0.58), skin_b, scale=(2.0, 1.0, 1.0), rot=(0, math.radians(35), 0)))
    parts.append(ball(0.17, (-0.45, -0.46, 0.62), skin_a, scale=(2.0, 1.0, 1.0), rot=(0, math.radians(-30), 0)))
    return pivot_of(parts, (math.radians(-10), math.radians(8), math.radians(-6)))

# ---------------------------------------------------------------- שק כסף
def build_money_bag():
    sack = mat('sack', '#c8955a', 0.0, 0.55)
    sack_d = mat('sack_d', '#a87440', 0.0, 0.6)
    gold = mat('gold', (1.0, 0.72, 0.16, 1), 1.0, 0.22)
    rope = mat('rope', '#6b4423', 0.0, 0.6)
    parts = [ball(1.15, (0, 0, -0.35), sack, scale=(1, 0.85, 0.95))]
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.62, radius2=0.3, depth=0.75, location=(0, 0, 0.75))
    neck = bpy.context.object
    neck.data.materials.append(sack)
    bpy.ops.object.shade_smooth()
    parts.append(neck)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.09, major_segments=48, minor_segments=16, location=(0, 0, 0.72))
    tie = bpy.context.object
    tie.data.materials.append(rope)
    bpy.ops.object.shade_smooth()
    parts.append(tie)
    for sx in (-1, 1):  # שולי הפתח
        parts.append(ball(0.3, (sx * 0.3, 0, 1.2), sack_d, scale=(1.1, 0.8, 0.8), rot=(0, sx * 0.5, 0)))
    parts.append(cyl(0.55, 0.12, (0, -1.0, -0.35), gold, rot=(math.pi / 2, 0, 0)))
    return pivot_of(parts, (math.radians(-8), math.radians(-14), math.radians(4)))


# ---------------------------------------------------------------- מגילה
def build_scroll():
    paper = mat('paper', '#fbefd0', 0.0, 0.6)
    roll = mat('roll', '#e9cf98', 0.0, 0.5)
    cap = mat('cap', '#b3501f', 0.0, 0.4, 0.2)
    ink = mat('ink', '#6a4a2a', 0.0, 0.7)
    parts = [box((1.7, 0.06, 2.0), (0, 0, 0), paper, bev=0.02)]
    for sz in (-1, 1):
        parts.append(cyl(0.3, 2.0, (0, 0, sz * 1.05), roll, rot=(0, math.pi / 2, 0)))
        for sx in (-1, 1):
            parts.append(cyl(0.2, 0.12, (sx * 1.05, 0, sz * 1.05), cap, rot=(0, math.pi / 2, 0)))
    for i in range(5):
        parts.append(box((1.1 - (0.3 if i == 4 else 0), 0.02, 0.07), (0.0 if i < 4 else -0.15, -0.04, 0.55 - i * 0.27), ink, bev=0.01))
    return pivot_of(parts, (math.radians(-6), math.radians(-14), math.radians(8)))


# ---------------------------------------------------------------- פנקס
def build_notebook():
    cover = mat('cover', '#3b6fd8', 0.0, 0.4, 0.3)
    pages = mat('pages', '#fffaf0', 0.0, 0.7)
    ring = mat('ring', '#c9ced6', 1.0, 0.25)
    label = mat('label', '#fff3c2', 0.0, 0.6)
    gold = mat('gold', (1.0, 0.72, 0.16, 1), 1.0, 0.22)
    parts = [box((1.9, 0.5, 2.5), (0, 0, 0), cover, bev=0.12),
             box((1.7, 0.38, 2.3), (0.06, -0.06, 0), pages, bev=0.04),
             box((1.8, 0.1, 2.4), (0.1, -0.27, 0), cover, bev=0.1),
             box((1.15, 0.03, 0.7), (0.12, -0.34, 0.45), label, bev=0.015),
             cyl(0.2, 0.04, (0.12, -0.36, -0.5), gold, rot=(math.pi / 2, 0, 0))]
    for i in range(6):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.045, major_segments=32, minor_segments=12,
                                         location=(-0.85, -0.28, 0.95 - i * 0.38), rotation=(0, 0, 0))
        r = bpy.context.object
        r.data.materials.append(ring)
        bpy.ops.object.shade_smooth()
        parts.append(r)
    return pivot_of(parts, (math.radians(-6), math.radians(-18), math.radians(6)))


# ---------------------------------------------------------------- משפחה
def build_family():
    skin_a = mat('skin_a', '#f2c08a', 0.0, 0.5)
    skin_b = mat('skin_b', '#c98f5b', 0.0, 0.5)
    skin_c = mat('skin_c', '#e0a874', 0.0, 0.5)
    blue = mat('blue', '#3b6fd8', 0.0, 0.45, 0.2)
    green = mat('green', '#2f8f6b', 0.0, 0.45, 0.2)
    orange = mat('orange', '#f08a24', 0.0, 0.45, 0.2)
    parts = []
    for x, h, skin, cloth in ((-1.1, 1.0, skin_a, blue), (1.1, 0.95, skin_b, green), (0, 0.65, skin_c, orange)):
        r = 0.62 * h
        parts.append(ball(r, (x, 0, -0.55 * h + 0.1), cloth, scale=(1, 0.85, 1.15)))
        parts.append(ball(0.5 * h, (x, -0.05, 0.5 * h + 0.12), skin))
    return pivot_of(parts, (math.radians(-6), math.radians(-8), 0))


BUILDERS = {'fly-money': build_fly_money, 'handshake': build_handshake, 'money-bag': build_money_bag,
            'scroll': build_scroll, 'notebook': build_notebook, 'family': build_family}
DIST = {'fly-money': 13.5, 'handshake': 13.5, 'money-bag': 8.5, 'scroll': 9.5, 'notebook': 9, 'family': 8.5}


def render(name, out, res, samples):
    sc = setup(res, samples, DIST[name])
    BUILDERS[name]()
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    if a[0] == '--all':
        out_dir, res, samples = a[1], int(a[2]), int(a[3])
        os.makedirs(out_dir, exist_ok=True)
        for key in BUILDERS:
            dst = os.path.join(out_dir, key + '.png')
            if os.path.exists(dst):
                continue  # אפשר להמשיך ריצה שנקטעה
            render(key, dst, res, samples)
            print('DONE', key, flush=True)
    else:
        render(a[0], a[1], int(a[2]), int(a[3]))
