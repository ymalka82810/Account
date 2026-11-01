import bpy, math, sys, os
args = sys.argv[sys.argv.index('--')+1:]
out = args[0]; res = int(args[1]); samples = int(args[2]); symbol = args[3] if len(args)>3 else "\u20aa"
tilt = float(args[4]) if len(args)>4 else 1

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = False
sc.render.resolution_x = res; sc.render.resolution_y = res
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [v.identifier for v in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'

def mat(name, base, metal, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m
gold = mat('gold', (1.0, 0.72, 0.16, 1), 1.0, 0.22)
gold_dark = mat('gold_dark', (0.9, 0.62, 0.14, 1), 1.0, 0.16)
gold_matte = mat('gold_matte', (0.9, 0.58, 0.1, 1), 1.0, 0.42)

# coin body
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=0.16)
body = bpy.context.object; body.rotation_euler = (math.pi/2, 0, 0)
bev = body.modifiers.new('b','BEVEL'); bev.width = 0.035; bev.segments = 5
body.data.materials.append(gold)
bpy.ops.object.shade_smooth()

# raised rim ring
bpy.ops.mesh.primitive_torus_add(major_radius=0.86, minor_radius=0.035, major_segments=96, minor_segments=16)
ring = bpy.context.object; ring.rotation_euler = (math.pi/2,0,0); ring.location = (0,-0.085,0)
ring.data.materials.append(gold_dark); bpy.ops.object.shade_smooth()

# inner recessed disc
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.8, depth=0.02)
inner = bpy.context.object; inner.rotation_euler=(math.pi/2,0,0); inner.location=(0,-0.08,0)
inner.data.materials.append(gold_matte); bpy.ops.object.shade_flat()

# embossed symbol
bpy.ops.object.text_add()
t = bpy.context.object
t.data.body = symbol
t.data.font = bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
t.data.size = 1.55; t.data.extrude = 0.07; t.data.bevel_depth = 0.012; t.data.bevel_resolution = 3
t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
t.rotation_euler = (math.pi/2, 0, 0); t.location = (0, -0.12, 0)
t.data.materials.append(gold_dark)

# tilt whole coin
parts = [body, ring, inner, t]
bpy.ops.object.empty_add(); pivot = bpy.context.object
for p in parts: p.parent = pivot
pivot.rotation_euler = (math.radians(-8*tilt), math.radians(-22*tilt), math.radians(8*tilt))

# camera
bpy.ops.object.camera_add(location=(0,-5.2,0.1))
cam = bpy.context.object; cam.rotation_euler = (math.pi/2,0,0); cam.data.lens = 70
sc.camera = cam

# world with gradient for reflections
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB'); bg = nt.nodes.new('ShaderNodeBackground'); o = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
ramp.color_ramp.elements[0].color = (0.18,0.2,0.32,1); ramp.color_ramp.elements[1].color = (1,0.97,0.9,1)
nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.6
nt.links.new(bg.outputs[0], o.inputs[0])

# lights
def area(loc, energy, size, rot):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object; l.data.energy = energy; l.data.size = size; l.rotation_euler = rot
area((-3,-4,3), 400, 4, (math.radians(55),0,math.radians(-35)))
area((3.5,-3,-1), 150, 4, (math.radians(80),0,math.radians(40)))

bpy.context.scene.render.filepath = out
bpy.ops.render.render(write_still=True)
