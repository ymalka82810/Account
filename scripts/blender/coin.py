"""מרנדר מטבע זהב תלת-ממדי עם סמל מורם. דורש Blender 4.x (Cycles CPU, בלי denoiser).

מטבע בודד:  blender -b -P scripts/blender/coin.py -- out.png 768 100 "★" 0.7
כל המטבעות: blender -b -P scripts/blender/coin.py -- --all out_dir 512 72 0.5
"""
import bpy, math, sys, os

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
# אותו מיפוי כמו VARIANTS ב-scripts/gen-currency-icons.py
SYMBOLS = {
    'ILS': '\u20aa', 'USD': '$', 'EUR': '\u20ac', 'GBP': '\u00a3', 'JPY': '\u00a5', 'INR': '\u20b9',
    'RUB': '\u20bd', 'UAH': '\u20b4', 'TRY': '\u20ba', 'THB': '\u0e3f', 'PLN': 'z\u0142', 'SEK': 'kr',
    'CZK': 'K\u010d', 'HUF': 'Ft', 'CHF': 'Fr', 'ZAR': 'R', 'BRL': 'R$',
    'AED': 'AED',  # הסמל החדש של הדירהם (D עם שני פסים), נבנה ידנית למטה
}
MAX_DIAG = 1.12  # אלכסון הסמל המרבי (רדיוס המשטח הפנימי 0.8)


def mat(name, base, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


def render_coin(out, res, samples, symbol, tilt):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False  # ה-build של Ubuntu בלי OpenImageDenoise
    sc.cycles.sample_clamp_indirect = 3.0
    sc.cycles.blur_glossy = 0.4
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Filmic'  # ברירת המחדל AgX מחווירה את הזהב

    gold = mat('gold', (1.0, 0.72, 0.16, 1), 1.0, 0.22)
    gold_sym = mat('gold_sym', (0.9, 0.62, 0.14, 1), 1.0, 0.16)
    gold_matte = mat('gold_matte', (0.9, 0.58, 0.1, 1), 1.0, 0.42)

    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=0.16)
    body = bpy.context.object
    body.rotation_euler = (math.pi / 2, 0, 0)
    bev = body.modifiers.new('b', 'BEVEL')
    bev.width = 0.035
    bev.segments = 5
    body.data.materials.append(gold)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_torus_add(major_radius=0.86, minor_radius=0.035, major_segments=96, minor_segments=16)
    ring = bpy.context.object
    ring.rotation_euler = (math.pi / 2, 0, 0)
    ring.location = (0, -0.085, 0)
    ring.data.materials.append(gold_sym)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.8, depth=0.02)
    inner = bpy.context.object
    inner.rotation_euler = (math.pi / 2, 0, 0)
    inner.location = (0, -0.08, 0)
    inner.data.materials.append(gold_matte)
    bpy.ops.object.shade_flat()

    bpy.ops.object.text_add()
    t = bpy.context.object
    dirham = symbol == 'AED'
    t.data.body = 'D' if dirham else symbol
    t.data.font = bpy.data.fonts.load(FONT)
    t.data.size = 1.55
    t.data.extrude = 0.07
    t.data.bevel_depth = 0.012
    t.data.bevel_resolution = 3
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    # התאמת גודל ומרכוז לפי תיבת הגבולות האמיתית של הסמל (כדי ש-"Kč" ו-"R$" ייכנסו בתוך הטבעת)
    xs = [v[0] for v in t.bound_box]
    ys = [v[1] for v in t.bound_box]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    ext = 0.19 * h if dirham else 0  # הפסים בולטים שמאלה מה-D
    s = min(1.0, MAX_DIAG / math.hypot(w + ext, h))
    t.scale = (s, s, 1)
    t.location = (-cx * s + ext * s / 2, -0.12, -cy * s)
    t.data.materials.append(gold_sym)

    parts = [body, ring, inner, t]
    if dirham:
        for sign in (1, -1):
            bpy.ops.mesh.primitive_cube_add(size=1)
            bar = bpy.context.object
            bar.scale = (w * s + ext * s, 0.14, 0.1 * h * s)
            bar.location = (0, -0.12, sign * 0.129 * h * s)
            bm = bar.modifiers.new('b', 'BEVEL')
            bm.width = 0.012
            bm.segments = 2
            bar.data.materials.append(gold_sym)
            parts.append(bar)
    bpy.ops.object.empty_add()
    pivot = bpy.context.object
    for p in parts:
        p.parent = pivot
    pivot.rotation_euler = (math.radians(-8 * tilt), math.radians(-22 * tilt), math.radians(8 * tilt))

    bpy.ops.object.camera_add(location=(0, -5.2, 0.1))
    cam = bpy.context.object
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.lens = 70
    sc.camera = cam

    w_ = bpy.data.worlds.new('w')
    sc.world = w_
    w_.use_nodes = True
    nt = w_.node_tree
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

    def area(loc, energy, size, rot):
        bpy.ops.object.light_add(type='AREA', location=loc)
        l = bpy.context.object
        l.data.energy = energy
        l.data.size = size
        l.rotation_euler = rot
    area((-3, -4, 3), 400, 4, (math.radians(55), 0, math.radians(-35)))
    area((3.5, -3, -1), 150, 4, (math.radians(80), 0, math.radians(40)))

    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    if a[0] == '--all':
        out_dir, res, samples, tilt = a[1], int(a[2]), int(a[3]), float(a[4])
        os.makedirs(out_dir, exist_ok=True)
        for key, sym in SYMBOLS.items():
            dst = os.path.join(out_dir, key + '.png')
            if os.path.exists(dst):
                continue  # אפשר להמשיך ריצה שנקטעה
            render_coin(dst, res, samples, sym, tilt)
            print('DONE', key, flush=True)
    else:
        render_coin(a[0], int(a[1]), int(a[2]), a[3] if len(a) > 3 else '\u20aa', float(a[4]) if len(a) > 4 else 0.7)
