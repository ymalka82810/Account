"""שלב 2 לאווטארים מפלסטלינה: מרנדר כל דמות מהמפות של avatars_prep.py. דורש Blender 4.x (Cycles CPU, בלי denoiser).

    blender -b -P scripts/blender/avatars.py -- /tmp/avatars_maps /tmp/avatars_raw 256 40

הכרית הנפוחה היא רשת צפופה עם Displace ממפת הגובה; החומר פלסטלינה מט עם גרגר של טביעות אצבע.
אפשר להמשיך ריצה שנקטעה (קבצים קיימים מדולגים). מנותק לגמרי מ-icons.py ומהאייקונים הקיימים.
"""
import bpy, math, os, sys
from mathutils import Vector


def clay_material(color_png):
    m = bpy.data.materials.new('clay'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(color_png)
    nt.links.new(img.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(img.outputs['Alpha'], mx.inputs['Fac'])
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(b.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Subsurface Weight'].default_value = 0.1
    b.inputs['Subsurface Scale'].default_value = 0.04
    b.inputs['Sheen Weight'].default_value = 0.3
    b.inputs['Specular IOR Level'].default_value = 0.3
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 38; n.inputs['Detail'].default_value = 8; n.inputs['Roughness'].default_value = 0.65
    v = nt.nodes.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 22
    mix = nt.nodes.new('ShaderNodeMixRGB'); mix.inputs['Fac'].default_value = 0.35
    nt.links.new(tc.outputs['Object'], n.inputs['Vector']); nt.links.new(tc.outputs['Object'], v.inputs['Vector'])
    nt.links.new(n.outputs['Fac'], mix.inputs['Color1']); nt.links.new(v.outputs['Distance'], mix.inputs['Color2'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.26; bp.inputs['Distance'].default_value = 0.01
    nt.links.new(mix.outputs['Color'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def render(hpng, cpng, out, res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=383, y_subdivisions=383, size=2)
    o = bpy.context.object
    o.rotation_euler = (math.pi / 2, 0, math.radians(-7))
    o.data.materials.append(clay_material(cpng))
    tex = bpy.data.textures.new('h', 'IMAGE')
    img = bpy.data.images.load(hpng); img.colorspace_settings.name = 'Non-Color'
    tex.image = img
    d = o.modifiers.new('disp', 'DISPLACE')
    d.texture = tex; d.texture_coords = 'UV'; d.strength = 0.5; d.mid_level = 0.0
    bpy.ops.object.shade_smooth()
    cam_d = bpy.data.cameras.new('c'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 2.12
    cam = bpy.data.objects.new('c', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.35, -6, 0.45)
    cam.rotation_euler = (Vector((0, 0, 0.1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

    def area(loc, e, size):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = size
        lo = bpy.data.objects.new('l', ld); sc.collection.objects.link(lo); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    area((-3, -4, 4), 620, 4); area((4, -3, 1), 230, 4); area((0, 3, 3), 110, 3)
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.92, 0.9, 0.96, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.85; sc.world = w
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    maps, out_dir, res, samples = a[0], a[1], int(a[2]), int(a[3])
    os.makedirs(out_dir, exist_ok=True)
    keys = [k for k in open(os.path.join(maps, 'keys.txt')).read().split() if k]
    for key in (a[4].split(',') if len(a) > 4 else keys):
        dst = os.path.join(out_dir, key + '.png')
        if os.path.exists(dst):
            continue
        render(os.path.join(maps, key + '_h.png'), os.path.join(maps, key + '_c.png'), dst, res, samples)
        print('DONE', key, flush=True)
