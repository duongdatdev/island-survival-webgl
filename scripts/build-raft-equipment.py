"""Run through Blender MCP. Native-metre attachments share the raft's waterline origin."""
from pathlib import Path
import bpy
import math
from mathutils import Vector

ROOT = Path('D:/Project/webgl/island-survival')
OUT = ROOT / 'assets/campaign/models'
collection = bpy.data.collections.get('IslandSurvival_RaftEquipment')
if collection is None:
    collection = bpy.data.collections.new('IslandSurvival_RaftEquipment')
    bpy.context.scene.collection.children.link(collection)
else:
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

def material(name, color):
    mat = bpy.data.materials.get('IS2_' + name) or bpy.data.materials.new('IS2_' + name)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = 0.85
    mat.diffuse_color = (*color, 1)
    return mat

wood = material('driftwood', (0.38, 0.23, 0.11))
cloth = material('canvas', (0.70, 0.66, 0.43))
patch = material('sail_patch', (0.46, 0.36, 0.20))
metal = material('iron', (0.17, 0.22, 0.23))
rust = material('motor_rust', (0.40, 0.22, 0.13))
parts = []

def keep(obj, mat):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def box(position, size, mat, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = keep(bpy.context.object, mat)
    obj.scale = size
    if rotation: obj.rotation_euler = rotation
    return obj

def beam(a, b, radius, mat, vertices=8):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)/2)
    obj = keep(bpy.context.object, mat)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def export(name, gallery):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for face in obj.data.polygons: face.use_smooth = False
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')), use_selection=True, export_apply=True)
    print(name, 'faces', len(obj.data.polygons), 'size', tuple(round(v, 3) for v in obj.dimensions))
    obj.location = gallery
    parts.clear()

# Lashed driftwood frame. Floats and paddle remain separate installable modules.
for x in (-0.58, 0, 0.58): beam((x, -1.1, 0.18), (x, 1.1, 0.18), 0.075, wood)
for y in (-0.85, 0, 0.85): beam((-0.70, y, 0.18), (0.70, y, 0.18), 0.055, wood)
for row in range(11):
    y = -1 + row*0.2
    box((0, y, 0.29), (1.42, 0.19, 0.10), wood)
for x in (-0.58, 0.58):
    for y in (-0.85, 0.85):
        for offset in (-0.035, 0.035):
            beam((x-0.08, y+offset, 0.34), (x+0.08, y+offset, 0.34), 0.014, patch, 5)
export('campaign_raft_frame', (6.4, 19.2, 0))

for x in (-0.58, 0.58):
    for y in (-0.70, 0, 0.70):
        beam((x, y-0.28, -0.05), (x, y+0.28, -0.05), 0.25, rust, 12)
        for end in (-0.24, 0.24):
            beam((x, y+end-0.018, -0.05), (x, y+end+0.018, -0.05), 0.256, metal, 12)
        # Straps run over the deck and down onto the barrel sides.
        beam((x-0.25, y, -0.05), (x-0.20, y, 0.35), 0.012, patch, 5)
        beam((x-0.20, y, 0.35), (x+0.20, y, 0.35), 0.012, patch, 5)
        beam((x+0.20, y, 0.35), (x+0.25, y, -0.05), 0.012, patch, 5)
export('campaign_raft_floats', (9.6, 19.2, 0))

beam((0.80, -0.94, 0.43), (0.80, 0.92, 0.43), 0.024, wood)
box((0.80, -0.91, 0.43), (0.30, 0.54, 0.045), wood)
beam((0.71, 0.92, 0.43), (0.89, 0.92, 0.43), 0.027, wood)
export('campaign_raft_paddle', (12.8, 19.2, 0))

# Curved canvas, reinforced seams, visible repair patch and rigging.
beam((0, 0, 0.32), (0, 0, 2.85), 0.045, wood)
beam((-0.86, 0, 2.62), (0.86, 0, 2.62), 0.027, wood)
beam((-0.70, 0, 0.88), (0.70, 0, 0.88), 0.027, wood)
verts = []
for row in range(5):
    for column in range(5):
        u, v = column/4, row/4
        width = 0.70 + v*0.16
        verts.append(((u*2-1)*width, -0.16*math.sin(u*math.pi)*math.sin(v*math.pi), 0.88+v*1.74))
faces = []
for row in range(4):
    for column in range(4):
        a = row*5+column
        faces.extend([(a, a+1, a+6), (a, a+6, a+5)])
mesh = bpy.data.meshes.new('SailCanvas')
mesh.from_pydata(verts, [], faces)
mesh.update()
obj = bpy.data.objects.new('SailCanvas', mesh)
collection.objects.link(obj)
obj.data.materials.append(cloth)
obj.data.materials.append(patch)
for face in obj.data.polygons:
    if face.index in (10, 11, 18, 19): face.material_index = 1
parts.append(obj)
for row in (0, 2, 4):
    for column in range(4): beam(verts[row*5+column], verts[row*5+column+1], 0.006, patch, 5)
for x in (-0.46, 0.46):
    beam((x, 0.85, 0.30), (0, 0, 2.75), 0.009, patch, 5)
    beam((x, -0.85, 0.30), (0, 0, 2.75), 0.009, patch, 5)
box((0, 0, 0.34), (0.23, 0.22, 0.10), metal)
export('campaign_raft_sail', (0, 19.2, 0))

# Salvaged outboard: clamps straddle the stern, shaft and propeller sit below water.
for x in (-0.14, 0.14):
    box((x, 0.91, 0.34), (0.08, 0.36, 0.12), metal)
    beam((x, 0.78, 0.24), (x, 0.78, 0.45), 0.035, metal)
box((0, 1.02, 0.62), (0.48, 0.36, 0.40), rust)
box((0, 1.02, 0.84), (0.50, 0.38, 0.06), metal)
for x in (-0.12, 0, 0.12): box((x, 0.827, 0.64), (0.025, 0.025, 0.19), metal)
beam((0.18, 0.92, 0.55), (0.18, 0.48, 0.55), 0.024, metal)
beam((0, 1.10, 0.44), (0, 1.10, -0.36), 0.047, metal)
box((0, 1.10, -0.36), (0.14, 0.25, 0.13), metal)
beam((0, 1.09, -0.36), (0, 1.30, -0.36), 0.035, metal)
for angle in (0, math.tau/3, 2*math.tau/3):
    radius = 0.12
    box((math.sin(angle)*radius, 1.29, -0.36+math.cos(angle)*radius), (0.09, 0.045, 0.26), rust, (0, angle, 0))
export('campaign_raft_motor', (3.2, 19.2, 0))

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/campaign/sources/campaign-props.blend'))
print('Raft equipment exported; project Blender source saved.')
