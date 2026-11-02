"""מרנדר את אייקוני הממשק התלת-ממדיים (במקום אימוג'י). דורש Blender 4.x (Cycles CPU, בלי denoiser).

    python3 scripts/blender/make_textures.py            (רק אם שיניתם טקסטורה; הן שמורות ב-git)
    blender -b -P scripts/blender/icons.py -- --all /tmp/ui_raw 640 96
    blender -b -P scripts/blender/icons.py -- money-bag out.png 512 64      (אייקון בודד)
    python3 scripts/blender/compose_ui_icons.py /tmp/ui_raw

אייקונים: fly-money ("אני חייב"), handshake ("חייבים לי", חברים), money-bag (הכסף שלי), scroll (מה היה),
notebook (הפנקס), family (המשפחה). סגנון אחיד: צורות רכות (subdivision), תאורת סטודיו של שלוש נקודות,
מצלמה אורתוגרפית שממסגרת את האובייקט אוטומטית, והמטבע עם הכוכב כמו במסך הטעינה.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'tex')
SYM_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GOLD = (1.0, 0.72, 0.16, 1)


# ================================================================== בסיס
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (c[0], c[1], c[2], 1)


_mats = {}


def mat(name, color=None, rough=0.45, metal=0.0, coat=0.0, sss=0.0, tex=None, bump=0.0, sheen=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    if color is not None:
        b.inputs['Base Color'].default_value = lin(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.08
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.5, 0.25, 0.15)
        b.inputs['Subsurface Scale'].default_value = 0.08
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
    if tex:
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = bpy.data.images.load(os.path.join(TEX, tex))
        nt.links.new(img.outputs['Color'], b.inputs['Base Color'])
    if bump:
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 90
        n.inputs['Detail'].default_value = 6
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    _mats[name] = m
    return m


# ================================================================== מתכות (כמו coin.py)
def metal(name):
    """זהב מבריק/מחוספס, כסף ונחושת. כל האייקונים משתמשים רק בהם."""
    spec = {
        'gold': ((1.0, 0.72, 0.16, 1), 0.22),
        'gold_sym': ((0.9, 0.62, 0.14, 1), 0.16),
        'gold_matte': ((0.9, 0.58, 0.1, 1), 0.42),
        'silver': ((0.93, 0.93, 0.96, 1), 0.18),
        'silver_matte': ((0.85, 0.86, 0.9, 1), 0.38),
        'copper': ((0.96, 0.5, 0.32, 1), 0.24),
    }[name]
    return mat(name, spec[0], spec[1], 1.0)


def engraved(name, tex, hi=(1.0, 0.72, 0.16, 1), lo=(0.62, 0.36, 0.06, 1), strength=0.5):
    """לוח זהב חרוט: הבהיר בטקסטורה בולט ומבריק, הכהה שקוע ומט."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 1.0
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(TEX, tex))
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(img.outputs['Color'], bw.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = lo
    cr.color_ramp.elements[1].color = hi
    cr.color_ramp.elements[0].position = 0.35
    cr.color_ramp.elements[1].position = 0.75
    nt.links.new(bw.outputs[0], cr.inputs[0])
    nt.links.new(cr.outputs[0], b.inputs['Base Color'])
    rr = nt.nodes.new('ShaderNodeMapRange')
    rr.inputs['To Min'].default_value = 0.45
    rr.inputs['To Max'].default_value = 0.16
    nt.links.new(bw.outputs[0], rr.inputs['Value'])
    nt.links.new(rr.outputs[0], b.inputs['Roughness'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    bp.inputs['Distance'].default_value = 0.02
    nt.links.new(bw.outputs[0], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    _mats[name] = m
    return m


def setup(res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False  # ה-build של Ubuntu בלי OpenImageDenoise
    sc.cycles.sample_clamp_indirect = 2.5
    sc.cycles.blur_glossy = 0.5
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.filter_size = 1.2
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Filmic'

    # אותה סביבה ותאורה כמו coin.py (מטבע האפליקציה), כדי שכל הזהב ייראה אותו דבר
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
    ramp.color_ramp.elements[0].color = (0.18, 0.2, 0.32, 1)
    ramp.color_ramp.elements[1].color = (1, 0.97, 0.9, 1)
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.6
    nt.links.new(bg.outputs[0], o.inputs[0])

    def area(loc, energy, size):
        bpy.ops.object.light_add(type='AREA', location=loc)
        l = bpy.context.object
        l.data.energy = energy
        l.data.size = size
        d = Vector((0, 0, 0)) - Vector(loc)
        l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    area((-5, -7, 5), 1100, 7)
    area((6, -5, -1.5), 420, 7)

    bpy.ops.object.camera_add(location=(0, -30, 0), rotation=(math.pi / 2, 0, 0))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    sc.camera = cam
    return sc


def fit_camera(sc, margin=1.06):
    """ממסגר את כל האובייקטים הנראים בריבוע (המצלמה מסתכלת ב-+Y, אז x ו-z הם המסך)."""
    dg = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    for ob in sc.objects:
        if ob.type not in ('MESH', 'CURVE', 'FONT'):
            continue
        ev = ob.evaluated_get(dg)
        for c in ev.bound_box:
            p = ev.matrix_world @ Vector(c)
            xs.append(p.x); zs.append(p.z)
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    cam = sc.camera
    cam.location = (cx, -30, cz)
    cam.data.ortho_scale = max(max(xs) - min(xs), max(zs) - min(zs)) * margin


def finish(o, material=None, sub=2, smooth=True):
    if material:
        o.data.materials.append(material)
    if sub:
        m = o.modifiers.new('s', 'SUBSURF')
        m.levels = sub
        m.render_levels = sub
    if smooth and o.type == 'MESH':
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def rbox(size, loc, material, rot=(0, 0, 0), bev=0.15, sub=2):
    """קופסה מעוגלת: bevel על מידות אמיתיות ואז subdivision."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.rotation_euler = rot
    b = o.modifiers.new('b', 'BEVEL')
    b.width = bev
    b.segments = 3
    b.limit_method = 'NONE'
    return finish(o, material, sub)


def sphere(r, loc, material, scale=(1, 1, 1), rot=(0, 0, 0), sub=1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
    o = bpy.context.object
    o.scale = scale
    o.rotation_euler = rot
    return finish(o, material, sub)


def cylinder(r, depth, loc, material, rot=(0, 0, 0), verts=64, bev=0.03, sub=1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    o = bpy.context.object
    o.rotation_euler = rot
    if bev:
        b = o.modifiers.new('b', 'BEVEL')
        b.width = bev
        b.segments = 3
        b.limit_method = 'ANGLE'
    return finish(o, material, sub)


def capsule(a, b, r, material, sub=2):
    """גליל מעוגל בין שתי נקודות (אצבעות, ידיים)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=max(d.length, 0.001), location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bv = o.modifiers.new('b', 'BEVEL')
    bv.width = r * 0.95
    bv.segments = 4
    bv.limit_method = 'NONE'
    return finish(o, material, sub)


def mesh_obj(name, verts, faces, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if uvs:
        uv = me.uv_layers.new()
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uv.data[li].uv = uvs[vi]
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def lathe(name, profile, segs=72, rfun=None):
    """גוף סיבוב סביב z מפרופיל (r, z); rfun(r, z, angle) מאפשר קפלים."""
    verts, faces = [], []
    n = len(profile)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for (r, z) in profile:
            rr = rfun(r, z, a) if rfun else r
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
    for i in range(segs):
        j = (i + 1) % segs
        for k in range(n - 1):
            faces.append((i * n + k, j * n + k, j * n + k + 1, i * n + k + 1))
    o = mesh_obj(name, verts, faces)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(o.data)
    bm.free()
    return o


def text(body, size, loc, material, rot=(math.pi / 2, 0, 0), extrude=0.03):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.object
    t.data.body = body
    t.data.font = bpy.data.fonts.load(SYM_FONT)
    t.data.size = size
    t.data.extrude = extrude
    t.data.bevel_depth = extrude * 0.35
    t.data.bevel_resolution = 3
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.data.materials.append(material)
    return t


def coin(r, loc, rot=(0, 0, 0)):
    """מטבע זהב עם כוכב (כמו מטבע מסך הטעינה), פונה ל-‎-Y לפני הסיבוב."""
    gold = metal('gold')
    gold2 = metal('gold_sym')
    parts = [cylinder(r, r * 0.2, (0, 0, 0), gold, rot=(math.pi / 2, 0, 0), bev=r * 0.05)]
    bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.82, minor_radius=r * 0.045, location=(0, -r * 0.1, 0), rotation=(math.pi / 2, 0, 0))
    parts.append(finish(bpy.context.object, gold2, 1))
    parts.append(text('★', r * 1.25, (0, -r * 0.1, -r * 0.02), gold2, extrude=r * 0.05))
    return group(parts, loc, rot)


def group(parts, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    bpy.ops.object.empty_add(location=(0, 0, 0))
    p = bpy.context.object
    for o in parts:
        o.parent = p
    p.location = loc
    p.rotation_euler = rot
    p.scale = (scale, scale, scale)
    return p


# ================================================================== שטר מעופף
def wing_layer(scale, mat_, z_off=0.0, scallops=4, thick=0.14):
    """צללית כנף (ימנית, הכתף ב-0,0): קשת עליונה חלקה וקצה תחתון מסולסל של נוצות."""
    tip = Vector((1.7, 0, 1.85))
    base = Vector((0.1, 0, -0.28))
    pts = []
    for i in range(25):  # קשת עליונה מהכתף לקצה
        t = i / 24
        pts.append(Vector((1.7 * t ** 1.15, 0, 0.12 + 1.73 * t ** 0.8 + 0.18 * math.sin(math.pi * t))))
    d = (base - tip).normalized()
    nrm = Vector((-d.z, 0, d.x))
    sizes = [1.0 - 0.08 * k for k in range(scallops)]
    tot = sum(sizes)
    acc = 0.0
    for k in range(scallops):  # סלסולים מהקצה חזרה לכתף
        a0, a1 = acc / tot, (acc + sizes[k]) / tot
        for i in range(1, 13):
            u = i / 12
            g = a0 + (a1 - a0) * u
            bump = 0.36 * sizes[k] * math.sin(math.pi * u) ** 0.7 * (4 / scallops) ** 0.5
            pts.append(tip.lerp(base, g) + nrm * bump)
        acc += sizes[k]
    verts = [(p.x * scale, z_off, p.z * scale) for p in pts[:-1]]
    me = bpy.data.meshes.new('wing')
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('wing', me)
    bpy.context.collection.objects.link(o)
    sol = o.modifiers.new('t', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 0
    return finish(o, mat_, 2)


def build_fly_money():
    note_m = engraved('note', 'banknote.jpg')
    white = metal('silver')
    tip = metal('silver_matte')

    # שטר גלי: רשת עם UV
    nx, nz, W, H = 48, 24, 3.2, 1.6
    verts, uvs, faces = [], [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / nz
            x, z = (u - 0.5) * W, (v - 0.5) * H
            y = 0.2 * math.sin(x * 1.5 + 0.6) + 0.06 * z * z
            verts.append((x, y, z)); uvs.append((u, v))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    note = mesh_obj('note', verts, faces, uvs)
    sol = note.modifiers.new('t', 'SOLIDIFY')
    sol.thickness = 0.04
    finish(note, note_m, 1)
    parts = [note]

    # כנפיים: נוצות ראשיות במניפה + שכבת נוצות כיסוי קצרות + בסיס רך
    for sx in (-1, 1):
        wing = [wing_layer(1.0, tip, 0.0, 5),          # נוצות ראשיות, בגוון תכלת
                wing_layer(0.7, white, -0.07, 4),       # שכבת כיסוי
                wing_layer(0.42, white, -0.14, 2, 0.16)]  # כתף
        g = group(wing, (sx * 1.35, 0.3, 0.5))
        g.scale = (sx * 0.72, 0.72, 0.72)
        g.rotation_euler = (0, -sx * math.radians(18), 0)  # כנפיים זקופות: האייקון כמעט ריבועי
        parts.append(g)
    return group(parts, rot=(math.radians(-6), math.radians(-24), math.radians(-6)))


# ================================================================== שק כסף
def build_money_bag():
    sack = metal('gold')
    rope = metal('gold_matte')
    prof = [(0.0, -1.05), (0.6, -1.02), (1.0, -0.84), (1.2, -0.5), (1.24, -0.1), (1.12, 0.3), (0.86, 0.62),
            (0.52, 0.86), (0.36, 0.98), (0.35, 1.06), (0.48, 1.18), (0.7, 1.36), (0.8, 1.48), (0.62, 1.5), (0.0, 1.36)]

    def folds(r, z, a):
        k = 0.0
        if 0.55 < z < 1.05:
            k = 0.07 * (z - 0.55) / 0.5
        elif z >= 1.05:
            k = 0.16
        return r * (1 + k * math.sin(9 * a))
    bag = finish(lathe('bag', prof, 90, folds), sack, 2)
    parts = [bag]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.075, location=(0, 0, 1.0))
    parts.append(finish(bpy.context.object, rope, 1))
    # פפיון קדמי
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.055, location=(sx * 0.2, -0.42, 1.04), rotation=(math.pi / 2, sx * 0.5, 0))
        lp = bpy.context.object
        lp.scale = (1.4, 1, 0.8)
        parts.append(finish(lp, rope, 1))
        parts.append(capsule((sx * 0.04, -0.44, 0.98), (sx * 0.2, -0.5, 0.62), 0.05, rope))
    parts.append(sphere(0.09, (0, -0.46, 1.02), rope))
    # מטבע על החזית ומטבעות שנשפכו
    parts.append(coin(0.5, (0, -1.18, -0.25), rot=(math.radians(-6), 0, 0)))
    parts.append(coin(0.36, (1.05, -0.72, -0.82), rot=(math.radians(-10), 0, math.radians(-25))))
    parts.append(coin(0.32, (-1.0, -0.6, -1.0), rot=(math.radians(-75), 0, math.radians(15))))
    return group(parts, rot=(math.radians(-6), 0, math.radians(-6)))


# ================================================================== מגילה
def build_scroll():
    paper = engraved('paper', 'scroll.jpg', strength=0.6)
    wax = metal('copper')
    wax2 = metal('copper')
    W, F, R0, turns = 1.8, 1.15, 0.24, 2.3
    nx = 20
    rows = []  # (y, z, v)
    for i in range(40):  # גלילה עליונה לאחור
        phi = turns * 2 * math.pi * (1 - i / 39)
        r = R0 * (1 - 0.1 * phi / (2 * math.pi))
        rows.append((R0 - r * math.cos(phi), F + r * math.sin(phi), 1.0))
    for i in range(1, 30):
        z = F - 2 * F * i / 30
        rows.append((0.0, z, 0.5 + z / (2 * F)))
    for i in range(40):  # גלילה תחתונה קדימה
        phi = turns * 2 * math.pi * i / 39
        r = R0 * (1 - 0.1 * phi / (2 * math.pi))
        rows.append((-(R0 - r * math.cos(phi)), -F - r * math.sin(phi), 0.0))
    verts, uvs, faces = [], [], []
    for (y, z, v) in rows:
        for i in range(nx + 1):
            u = i / nx
            verts.append(((u - 0.5) * W, y, z)); uvs.append((u, v))
    for j in range(len(rows) - 1):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    sheet = mesh_obj('sheet', verts, faces, uvs)
    s = sheet.modifiers.new('t', 'SOLIDIFY')
    s.thickness = 0.025
    finish(sheet, paper, 1)
    parts = [sheet]
    # חותמת שעווה עם סרטים
    for sx in (-1, 1):
        parts.append(rbox((0.16, 0.03, 0.55), (0.55 + sx * 0.1, -0.06, -0.95), wax2, rot=(0, sx * 0.25, 0), bev=0.02, sub=1))
    seal = lathe('seal', [(0.0, -0.05), (0.3, -0.05), (0.33, 0.0), (0.3, 0.05), (0.0, 0.06)], 48,
                 lambda r, z, a: r * (1 + 0.06 * math.sin(7 * a)))
    seal.location = (0.55, -0.1, -0.7)
    seal.rotation_euler = (math.pi / 2, 0, 0)
    parts.append(finish(seal, wax, 2))
    parts.append(text('★', 0.36, (0.55, -0.17, -0.71), wax2, extrude=0.02))
    return group(parts, rot=(math.radians(-6), math.radians(-10), math.radians(-14)))


# ================================================================== פנקס
def build_notebook():
    cover = metal('gold')
    print_ = engraved('cover_print', 'notebook.jpg', strength=0.6)
    pages = metal('silver_matte')
    metal_ = metal('silver')
    yellow = metal('gold_sym')
    wood = metal('gold_matte')
    lead = metal('silver')
    pink = metal('copper')
    ribbon = metal('copper')
    W, H = 2.0, 2.6
    parts = [rbox((W, 0.09, H), (0, 0.22, 0), cover, bev=0.14),
             rbox((W - 0.1, 0.26, H - 0.14), (0.04, 0.07, 0), pages, bev=0.05),
             rbox((W, 0.09, H), (0, -0.1, 0), cover, bev=0.14)]
    # הדפס הכריכה: משטח עם UV מעל החזית
    hw, hh = (W - 0.28) / 2, (H - 0.28) / 2
    pr = mesh_obj('print', [(-hw, -0.147, -hh), (hw, -0.147, -hh), (hw, -0.147, hh), (-hw, -0.147, hh)], [(0, 1, 2, 3)],
                  [(0, 0), (1, 0), (1, 1), (0, 1)])
    parts.append(finish(pr, print_, 0, smooth=False))
    # ספירלה
    for k in range(9):
        z = H / 2 - 0.28 - k * (H - 0.56) / 8
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.035, location=(-W / 2 + 0.05, 0.06, z))
        t = bpy.context.object
        t.scale = (1, 1.6, 1)
        parts.append(finish(t, metal_, 1))
    # סימנייה
    parts.append(rbox((0.16, 0.02, 0.6), (0.55, 0.05, -H / 2 - 0.2), ribbon, bev=0.01, sub=1))
    # עיפרון באלכסון
    L = 2.2
    pen = [cylinder(0.11, L, (0, 0, 0), yellow, rot=(0, math.pi / 2, 0), verts=6, bev=0.015, sub=0)]
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.11, radius2=0.03, depth=0.32, location=(L / 2 + 0.16, 0, 0), rotation=(0, math.pi / 2, 0))
    pen.append(finish(bpy.context.object, wood, 0))
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.032, radius2=0.0, depth=0.09, location=(L / 2 + 0.36, 0, 0), rotation=(0, math.pi / 2, 0))
    pen.append(finish(bpy.context.object, lead, 0))
    pen.append(cylinder(0.115, 0.18, (-L / 2 - 0.09, 0, 0), metal_, rot=(0, math.pi / 2, 0), bev=0.01, sub=0))
    pen.append(cylinder(0.11, 0.2, (-L / 2 - 0.27, 0, 0), pink, rot=(0, math.pi / 2, 0), bev=0.05))
    parts.append(group(pen, (0.25, -0.38, -0.35), (0, math.radians(38), 0)))
    return group(parts, rot=(math.radians(-6), math.radians(-6), math.radians(14)))


# ================================================================== לחיצת יד
EMOJI_FONT = os.path.join(HERE, 'fonts', 'NotoEmoji-Bold-subset.ttf')  # Noto Emoji (OFL), משקל 700, רק התווים שבשימוש


def glyph(ch, size, loc, material, extrude=0.09):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object
    t.data.body = ch
    t.data.font = bpy.data.fonts.load(EMOJI_FONT)
    t.data.size = size
    t.data.extrude = extrude
    t.data.bevel_depth = 0.012
    t.data.bevel_resolution = 3
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.data.materials.append(material)
    bpy.context.view_layer.update()
    return t


def fit_glyphs(objs, max_diag, y):
    """מקטין ומרכז קבוצת תווים לפי תיבת הגבולות האמיתית שלהם, שתיכנס בתוך הטבעת."""
    xs, zs = [], []
    for t in objs:
        for c in t.bound_box:
            p = t.matrix_world @ Vector(c)
            xs.append(p.x); zs.append(p.z)
    w, h = max(xs) - min(xs), max(zs) - min(zs)
    cx, cz = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2
    s = max_diag / math.hypot(w, h)
    g = group(objs)
    g.location = (-cx * s, y, -cz * s)
    g.scale = (s, 1, s)
    return g


def medallion(glyph_parts):
    """מדליון כמו מטבע האפליקציה (coin.py): גוף, טבעת מורמת, משטח פנימי מט ותבליט מבריק."""
    gold, sym, matte = metal('gold'), metal('gold_sym'), metal('gold_matte')
    parts = [cylinder(1.0, 0.16, (0, 0, 0), gold, rot=(math.pi / 2, 0, 0), verts=96, bev=0.035, sub=0)]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.86, minor_radius=0.035, major_segments=96, minor_segments=16,
                                     location=(0, -0.085, 0), rotation=(math.pi / 2, 0, 0))
    parts.append(finish(bpy.context.object, sym, 0))
    parts.append(cylinder(0.8, 0.02, (0, -0.08, 0), matte, rot=(math.pi / 2, 0, 0), verts=96, bev=0, sub=0))
    parts.append(fit_glyphs(glyph_parts(sym), 1.62, -0.12))
    return group(parts, rot=(math.radians(-4), math.radians(-11), math.radians(4)))


def build_handshake():
    return medallion(lambda m: [glyph('\U0001F91D', 1.0, (0, 0, 0), m)])


def build_family():
    def figures(m):
        # שני מבוגרים וילד באמצע, מאותה צללית (בלי אפיון נוסף)
        return [glyph('\U0001F464', 1.0, (-0.62, 0, 0.0), m), glyph('\U0001F464', 1.0, (0.62, 0, 0.0), m),
                glyph('\U0001F464', 0.68, (0, -0.02, -0.17), m)]
    return medallion(figures)


BUILDERS = {'fly-money': build_fly_money, 'handshake': build_handshake, 'money-bag': build_money_bag,
            'scroll': build_scroll, 'notebook': build_notebook, 'family': build_family}


def render(name, out, res, samples):
    sc = setup(res, samples)
    BUILDERS[name]()
    fit_camera(sc)
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
