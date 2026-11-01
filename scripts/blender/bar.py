"""מרנדר את מטילי הזהב של "אני חייב" / "חייבים לי" (ראו GoldBar.jsx ו-.sum ב-style.css). דורש Blender 4.0.x.

    blender -b -P scripts/blender/bar.py -- --all /tmp/bars_raw
    blender -b -P scripts/blender/bar.py -- parent-get out.png 640 128      (מטיל בודד)

מטיל הורים/נוער (ingot): פירמידה קטומה במבט אלכסוני, בדיוק הגיאומטריה של ה-viewBox 202x124 של GoldBarArt,
כדי שהטקסט (padding ב-CSS) ימשיך לשבת על החזית. מטיל ילדים (toy): לוח מעוגל במבט חזיתי ל-border-image.
"""
import bpy, math, sys, os

# (סוג, (hi, g1, g2, g3) כמו משתני --g-* ב-style.css, חספוס)
STYLES = {
    'parent-get': ('ingot', ('#f1dd9d', '#d9ba6b', '#b18f3b', '#7d5f1d'), 0.30),
    'parent-owe': ('ingot', ('#ebcdb0', '#cfa482', '#a8744a', '#744626'), 0.30),
    'teen-get':   ('ingot', ('#fffbd0', '#ffe94d', '#ffc400', '#ff9d00'), 0.12),
    'teen-owe':   ('ingot', ('#ffeadb', '#ffc9a3', '#ff9a5c', '#ff6a3d'), 0.12),
    'child-get':  ('toy',   ('#fff6c2', '#ffe27a', '#f3b81f', '#c98a08'), 0.14),
    'child-owe':  ('toy',   ('#ffe6c8', '#f8bd80', '#e48f3f', '#b5561e'), 0.14),
}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SHIFT = (0.0, 0.0)  # הזזת מצלמה (בחלקי ortho_scale) למירכוז המטיל ב-viewBox
PX = 50.0  # פיקסלים ב-viewBox ליחידת בלנדר (170px בסיס = 3.4 יחידות)


def lin(h):
    """#rrggbb (sRGB) -> RGBA ליניארי."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (c[0], c[1], c[2], 1)


def dark(c, k):
    return (c[0] * k, c[1] * k, c[2] * k, 1)


def metal(name, cols, rough, brushed=True, bands=True, end_dark=True, smooth=False):
    """מתכת עם פסי השתקפות חדים (בהיר-כהה-בהיר) כמו ה-linearGradient של GoldBarArt, מוטים מעט."""
    hi, g1, g2, g3 = [lin(c) for c in cols]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if bands:
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Rotation'].default_value = (0, math.radians(-7), 0)
        gr = nt.nodes.new('ShaderNodeTexGradient')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        # הגרדיאנט נמדד לאורך z הנורמלי של החזית (0..1 מלמטה למעלה)
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = -0.1; mr.inputs['From Max'].default_value = 2.0
        mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.0
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs['Z'], mr.inputs['Value']); nt.links.new(mr.outputs[0], ramp.inputs[0])
        stops = [(0, hi), (0.14, g1), (0.36, g2), (0.44, dark(g3, 0.88)), (0.5, g2), (0.66, g1), (0.74, hi), (0.84, g2), (1, dark(g3, 0.85))]
        if smooth:
            stops = [(0, hi), (0.22, g1), (0.62, g2), (1, g3)]
        cr = ramp.color_ramp
        cr.interpolation = 'LINEAR'
        while len(cr.elements) > 2: cr.elements.remove(cr.elements[-1])
        cr.elements[0].position, cr.elements[0].color = stops[0]
        cr.elements[1].position, cr.elements[1].color = stops[-1]
        for pos, col in stops[1:-1]:
            e = cr.elements.new(pos); e.color = col
        col_out = ramp.outputs[0]
    else:
        rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = g2
        col_out = rgb.outputs[0]
    if end_dark:
        # פאת הקצה (נורמל פונה ימינה) כהה יותר, כמו בגרדיאנט 'e' של GoldBarArt
        geo = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ')
        rng = nt.nodes.new('ShaderNodeMapRange'); rng.inputs['From Min'].default_value = 0.15; rng.inputs['From Max'].default_value = 0.9
        rng.inputs['To Min'].default_value = 1.0; rng.inputs['To Max'].default_value = 0.55
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(geo.outputs['Normal'], sp.inputs[0]); nt.links.new(sp.outputs['X'], rng.inputs['Value'])
        nt.links.new(col_out, mix.inputs['A'])
        gv = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'): nt.links.new(rng.outputs[0], gv.inputs[k])
        nt.links.new(gv.outputs[0], mix.inputs['B'])
        col_out = mix.outputs[2]
    nt.links.new(col_out, b.inputs['Base Color'])
    if brushed:
        mp2 = nt.nodes.new('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (1.5, 90, 90)
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.03
        nt.links.new(tc.outputs['Object'], mp2.inputs[0]); nt.links.new(mp2.outputs[0], nz.inputs['Vector'])
        nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def frustum(L0, D0, L1, D1, H, dy):
    """פירמידה קטומה: בסיס L0xD0 בגובה 0, עליון L1xD1 בגובה H, מוסט ב-dy כך שהחזית נטויה אחורה."""
    import bmesh
    me = bpy.data.meshes.new('bar')
    bm = bmesh.new()
    def rect(L, D, z, y0):
        return [bm.verts.new((-L / 2, y0 - D / 2, z)), bm.verts.new((L / 2, y0 - D / 2, z)),
                bm.verts.new((L / 2, y0 + D / 2, z)), bm.verts.new((-L / 2, y0 + D / 2, z))]
    b = rect(L0, D0, 0, 0)
    t = rect(L1, D1, H, dy)
    bm.faces.new(b[::-1])
    bm.faces.new(t)
    for i in range(4):
        bm.faces.new((b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('bar', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setup_scene(res_x, res_y, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.sample_clamp_indirect = 4.0
    sc.cycles.blur_glossy = 0.3
    sc.render.resolution_x, sc.render.resolution_y = res_x, res_y
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    # עולם: מעבר גובה לשיקופים
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); bg = nt.nodes.new('ShaderNodeBackground'); o = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (0.45, 0.45, 0.5, 1); ramp.color_ramp.elements[1].color = (1, 0.98, 0.94, 1)
    nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.15
    nt.links.new(bg.outputs[0], o.inputs[0])
    return sc


def area(loc, energy, size, target=(0, 0, 0), sx=None):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.data.energy = energy
    l.data.size = size
    if sx:
        l.data.shape = 'RECTANGLE'; l.data.size = sx[0]; l.data.size_y = sx[1]
    d = (target[0] - loc[0], target[1] - loc[1], target[2] - loc[2])
    l.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]) , 0, math.atan2(d[0], -d[1]) * -1)
    # הפניית האור אל המטרה
    con = l.constraints.new('TRACK_TO'); con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    t = bpy.data.objects.new('t', None); bpy.context.scene.collection.objects.link(t); t.location = target
    con.target = t
    return l


def render_ingot(style, out, res, samples):
    """הטלה אלכסונית (oblique) כמו GoldBarArt: מצלמה חזיתית, והגוף מוטה (shear) כך שהעומק מוקרן ל-(24.1, -34.4)px.
    הנקודות (viewBox 202x124): בסיס קדמי 4..174, עליון קדמי 28.2..162.2, פאת קצה עד 198.1."""
    from mathutils import Matrix
    kind, cols, rough = STYLES[style]
    Hh = round(res * 124 / 202)
    sc = setup_scene(res, Hh, samples)
    D0 = 0.6
    D1 = 0.485 * D0
    A, B = 0.482 / D0, 0.688 / D0         # הסטת x ו-z ליחידת עומק (y)
    H = 1.978 - B * (D0 - D1) / 2         # גובה החזית בפועל אחרי ההסטה
    ob = frustum(3.4, D0, 2.68, D1, H, 0)
    ob.data.materials.append(metal('m', cols, rough))
    bev = ob.modifiers.new('b', 'BEVEL'); bev.width = 0.085; bev.segments = 5; bev.limit_method = 'ANGLE'
    ob.data.use_auto_smooth = True; ob.data.auto_smooth_angle = math.radians(35)
    for p in ob.data.polygons: p.use_smooth = True
    parts = [ob]
    # לוחית חרוטה וחותמת 999.9 על הפאה העליונה (בתוך מערכת ה-shear)
    pm = metal('plate', cols, min(1, rough + 0.2), brushed=False, bands=False, end_dark=False)
    bpy.ops.mesh.primitive_cube_add(size=1); pl = bpy.context.object
    pl.scale = (1.08, D1 * 0.72, 0.014); pl.location = (0, 0, H); pl.data.materials.append(pm); parts.append(pl)
    bpy.ops.object.text_add(); t = bpy.context.object
    t.data.body = '999.9'; t.data.font = bpy.data.fonts.load(FONT); t.data.size = 0.17
    t.data.extrude = 0.01; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.location = (0, 0, H + 0.008); t.data.materials.append(metal('stamp', cols, max(0.05, rough - 0.06), brushed=False, bands=False, end_dark=False)); parts.append(t)
    # Blender מפרק את matrix_world ומאבד shear, לכן אופים את ההטיה ישירות בקודקודים
    M = Matrix(((1, A, 0, 0), (0, 1, 0, 0), (0, B, 1, 0), (0, 0, 0, 1)))
    for o in parts:
        if o.type == 'FONT':
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
            bpy.ops.object.convert(target='MESH')
        o.data.transform(M @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        for poly in o.data.polygons:
            poly.use_smooth = o is parts[0]
    # מצלמה אורתוגרפית חזיתית; מרכז ההיטל של המטיל
    vc = (-B * D0 / 2 + (H + B * D1 / 2)) / 2 if False else (-B * D0 / 2 + H + B * (D1 / 2)) / 2
    bpy.ops.object.camera_add(location=(0, -12, vc), rotation=(math.pi / 2, 0, 0))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 202 / PX
    cam.data.shift_x = SHIFT[0]; cam.data.shift_y = SHIFT[1]
    sc.camera = cam
    area((-4, -7, 6), 500, 4)
    area((6, -5, 3), 160, 3)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_toy(style, out, res, samples):
    """מטיל צעצוע עגלגל במבט חזיתי, ל-border-image (9-slice) ב-CSS: הפינות מעוגלות והמרכז חלק, כך שנמתח לכל גודל."""
    kind, cols, rough = STYLES[style]
    W = res; Hh = round(res * 0.62)
    sc = setup_scene(W, Hh, samples)
    LX, DY, LZ = 4.0, 0.9, 2.2
    def slab(sx, sz, dy, y, mat, bev_w, name):
        bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.object; o.name = name
        o.scale = (sx, dy, sz); o.location = (0, y, LZ / 2)
        bpy.ops.object.transform_apply(scale=True)
        bm = o.modifiers.new('b', 'BEVEL'); bm.width = bev_w; bm.segments = 10
        o.data.materials.append(mat)
        for p in o.data.polygons: p.use_smooth = True
        return o
    body = slab(LX, LZ, DY, 0, metal('toy', cols, rough, brushed=False, end_dark=False, smooth=True), 0.55, 'body')
    # לוח מוגבה בפנים (המשטח שעליו כתוב הסכום)
    hi = (cols[0], cols[1], cols[2], cols[3])
    slab(LX * 0.84, LZ * 0.72, DY * 0.5, -DY * 0.42, metal('face', hi, rough + 0.02, brushed=False, end_dark=False, smooth=True), 0.30, 'face')
    el = math.radians(6)
    bpy.ops.object.camera_add(location=(0, -12 * math.cos(el), LZ / 2 + 12 * math.sin(el)))
    cam = bpy.context.object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 4.5
    tgt = bpy.data.objects.new('cam_t', None); sc.collection.objects.link(tgt); tgt.location = (0, 0, LZ / 2)
    con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    sc.camera = cam
    area((-4, -7, 6), 500, 4)
    area((6, -5, 3), 160, 3)
    area((0, -6, -3), 90, 5)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    fn = lambda st: render_toy if STYLES[st][0] == 'toy' else render_ingot
    if a[0] == '--all':
        out_dir = a[1]
        os.makedirs(out_dir, exist_ok=True)
        for st in STYLES:
            dst = os.path.join(out_dir, st + '.png')
            if os.path.exists(dst):
                continue  # אפשר להמשיך ריצה שנקטעה
            fn(st)(st, dst, 640, 120)
            print('DONE', st, flush=True)
    else:
        fn(a[0])(a[0], a[1], int(a[2]), int(a[3]))
