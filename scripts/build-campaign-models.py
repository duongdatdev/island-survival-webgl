"""Run inside Blender through MCP; create/export the bespoke campaign prop kit."""
from pathlib import Path
import bpy
import math
import random
from mathutils import Vector

ROOT = Path('D:/Project/webgl/island-survival')
OUT = ROOT / 'assets/campaign/models'
OUT.mkdir(parents=True, exist_ok=True)
COLLECTION = 'IslandSurvival_CampaignAssets'
collection = bpy.data.collections.get(COLLECTION)
if collection is None:
    collection = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(collection)
else:
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name, color):
    m = bpy.data.materials.get('IS2_' + name) or bpy.data.materials.new('IS2_' + name)
    m.use_nodes = True
    node = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = 0.85
    m.diffuse_color = (*color, 1)
    return m


wood = material('driftwood', (0.38, 0.23, 0.11))
lightwood = material('cutwood', (0.62, 0.43, 0.23))
metal = material('iron', (0.17, 0.22, 0.23))
stone = material('stone', (0.33, 0.35, 0.32))
leaf = material('leaves', (0.20, 0.39, 0.13))
cloth = material('canvas', (0.70, 0.66, 0.43))
orange = material('embers', (0.95, 0.27, 0.045))
blue = material('glass', (0.25, 0.55, 0.56))
parts = []


def keep(obj, mat):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj


def box(pos, size, mat, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = keep(bpy.context.object, mat)
    obj.scale = size
    if rotation:
        obj.rotation_euler = rotation
    return obj


def cylinder(pos, radius, depth, mat, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    return keep(bpy.context.object, mat)


def beam(a, b, radius, mat, vertices=6):
    a, b = Vector(a), Vector(b)
    obj = cylinder((a + b) / 2, radius, (b - a).length, mat, vertices)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def ring(pos, radius, thickness, mat, rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=12, minor_segments=5,
                                    major_radius=radius, minor_radius=thickness, location=pos)
    obj = keep(bpy.context.object, mat)
    if rotation:
        obj.rotation_euler = rotation
    return obj


def export(name, gallery_index):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = 'campaign_' + name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    bpy.ops.export_scene.gltf(filepath=str(OUT / (obj.name + '.glb')),
                              use_selection=True, export_apply=True)
    obj.location = ((gallery_index % 5) * 3.2, (gallery_index // 5) * 3.2, 0)
    print(name, 'faces', len(obj.data.polygons))
    parts.clear()
    return obj


# Three-pronged hook with eyelet and a wrapped handle.
beam((0, 0, 0.08), (0, 0, 0.55), 0.035, metal)
for k in range(3):
    a = k * math.tau / 3
    points = [(0, 0, 0.28), (math.cos(a)*0.16, math.sin(a)*0.16, 0.16),
              (math.cos(a)*0.23, math.sin(a)*0.23, 0.30), (math.cos(a)*0.17, math.sin(a)*0.17, 0.42)]
    for p, q in zip(points, points[1:]):
        beam(p, q, 0.025, metal)
ring((0, 0, 0.59), 0.055, 0.016, metal, (math.pi/2, 0, 0))
export('hook', 0)

# A stacked-stone smelter, open firebox, metal grate and chimney.
box((0, 0.13, 0.18), (1.2, 0.95, 0.36), stone)
for level in range(3):
    for x in (-0.46, 0.46):
        box((x, 0, 0.46+level*0.29), (0.28, 0.95, 0.27), stone)
    box((0, 0.36, 0.46+level*0.29), (0.72, 0.23, 0.27), stone)
box((0, 0, 1.2), (1.2, 0.95, 0.24), stone)
cylinder((0, 0.17, 1.55), 0.28, 0.5, stone, 8)
cylinder((0, 0.17, 1.83), 0.36, 0.08, metal, 8)
box((0, -0.06, 0.4), (0.61, 0.55, 0.08), orange)
for x in (-0.24, -0.12, 0, 0.12, 0.24):
    beam((x, -0.49, 0.35), (x, -0.49, 0.84), 0.012, metal)
export('smelter', 1)

# Open smoking rack: crossed poles, hanging strips, embers below.
for x in (-0.55, 0.55):
    for y in (-0.35, 0.35):
        beam((x, y, 0), (x, y, 1.65), 0.055, wood)
beam((-0.6, 0, 1.67), (0.6, 0, 1.67), 0.06, wood)
for x in (-0.33, 0, 0.33):
    beam((x, 0, 1.67), (x, 0, 1.12), 0.009, cloth)
    box((x, 0, 0.95), (0.14, 0.06, 0.36), lightwood)
box((0, 0, 0.045), (0.95, 0.65, 0.09), stone)
for x in (-0.25, 0.1, 0.3):
    beam((x, -0.15, 0.1), (x+0.12, 0.2, 0.12), 0.045, wood)
export('smoker', 2)

# Woven fish trap with open funnel and visible ribs.
for z, radius in [(0.05,0.28),(0.32,0.3),(0.65,0.22),(0.83,0.11)]:
    ring((0, 0, z), radius, 0.018, lightwood)
for k in range(14):
    a=k*math.tau/14
    beam((math.cos(a)*0.28,math.sin(a)*0.28,0.05),
         (math.cos(a)*0.11,math.sin(a)*0.11,0.83), 0.012, wood)
export('fish_trap', 3)

# Water tank with bands, tap and a sloped rain-catching canopy.
cylinder((0, 0, 0.52), 0.43, 1.0, wood, 12)
for z in (0.16,0.47,0.86):
    ring((0,0,z),0.435,0.025,metal)
beam((0,-0.43,0.25),(0,-0.58,0.25),0.028,metal)
beam((0,-0.58,0.25),(0,-0.58,0.16),0.028,metal)
for x in (-0.55,0.55):
    beam((x,0.15,0),(x,0.15,1.65),0.04,wood)
box((0,0,1.6),(1.35,1.05,0.06),cloth,(0,0.16,0))
export('water_tank',4)

# Compact diving mask and twin air cylinders.
for x in (-0.14,0.14):
    ring((x,-0.13,0.5),0.14,0.035,metal,(math.pi/2,0,0))
    box((x,-0.13,0.5),(0.2,0.025,0.17),blue)
for x in (-0.18,0.18):
    cylinder((x,0.17,0.41),0.13,0.74,metal)
    cylinder((x,0.17,0.82),0.045,0.08,lightwood)
box((0,0.17,0.13),(0.68,0.09,0.07),cloth)
box((0,0.17,0.62),(0.68,0.09,0.07),cloth)
export('dive_kit',5)

# Signal tower, diagonal bracing, dish and service cabinet.
for x,y in [(-0.7,-0.4),(0.7,-0.4),(0,0.8)]:
    beam((x,y,0),(x*0.22,y*0.22,5.4),0.055,metal)
    box((x,y,0.075),(0.4,0.4,0.15),stone)
for level in range(4):
    z=level*1.3
    scale=1-z/6.8
    pts=[(-0.7*scale,-0.4*scale,z),(0.7*scale,-0.4*scale,z),(0,0.8*scale,z)]
    upper=1-(z+1.3)/6.8
    tops=[(-0.7*upper,-0.4*upper,z+1.3),(0.7*upper,-0.4*upper,z+1.3),(0,0.8*upper,z+1.3)]
    for k in range(3):
        beam(pts[k],pts[(k+1)%3],0.025,metal)
        beam(pts[k],tops[(k+1)%3],0.025,metal)
beam((0,0,5.35),(0,0,6.15),0.03,metal)
ring((0,-0.35,4.9),0.42,0.055,cloth,(math.pi/2,0,0))
beam((0,-0.35,4.9),(0,-0.75,4.9),0.025,metal)
box((0,0,0.65),(0.65,0.38,0.8),metal)
box((0,-0.2,0.72),(0.28,0.04,0.18),blue)
export('antenna',6)

# Irrigated planting bed, bare so growth-stage models can be swapped independently.
box((0,0,0.12),(1.9,0.95,0.24),stone)
for x in (-1,1):box((x,0,0.21),(0.1,1.1,0.42),wood)
for y in (-0.5,0.5):box((0,y,0.21),(2,0.1,0.42),wood)
export('planter',7)

for stage in range(1,4):
    height=0.12+stage*0.15
    beam((0,0,0),(0,0,height),0.018,leaf)
    for k in range(stage*3):
        angle=k*2.399
        end=(math.cos(angle)*0.1*stage,math.sin(angle)*0.1*stage,height*(0.35+0.5*k/max(1,stage*3-1)))
        beam((0,0,end[2]*0.6),end,0.02,leaf)
        box(end,(0.10*stage,0.035,0.06),leaf,(0,0.3,angle))
    export('herb_'+str(stage),7+stage)

# Wooden 2 m building grid; windows/door have true openings.
for name in ('foundation','floor','wall','doorway','door','roof'):
    if name in ('foundation','floor'):
        for k in range(8):box((-0.875+k*0.25,0,0.1),(0.24,2,0.2),lightwood)
        for x in (-0.75,0.75):box((x,0,0.04),(0.14,2,0.08),wood)
    elif name=='wall':
        for k in range(8):box((-0.875+k*0.25,0,1.2),(0.24,0.12,2.4),lightwood)
        for z in (0.2,2.2):box((0,0.09,z),(2,0.08,0.1),wood)
    elif name=='doorway':
        for x in (-0.75,0.75):box((x,0,1.2),(0.5,0.14,2.4),lightwood)
        box((0,0,2.25),(1,0.14,0.3),lightwood)
    elif name=='door':
        for k in range(4):box((0.125+k*0.25,0,1.02),(0.24,0.12,2.04),lightwood)
        for z in (0.25,1.8):box((0.5,0.08,z),(0.95,0.08,0.1),wood)
        cylinder((0.83,-0.1,1),0.045,0.07,metal)
    else:
        for k in range(8):box((-0.875+k*0.25,0,0.055),(0.24,2.15,0.11),wood)
    export(name,11+('foundation','floor','wall','doorway','door','roof').index(name))

# Convert growth stages and existing Quaternius survival props to native metre GLBs.
imports = [(ROOT/'assets/campaign/sources/crops'/('Carrot_'+str(i)+'.obj'), 'crop_carrot_'+str(i), 0.15+i*0.13) for i in range(1,5)]
imports += [(ROOT/'assets/survival-pack/SurvivalPack/OBJ'/f, name, height) for f,name,height in
            [('Radio.obj','radio',0.32),('Battery_Big.obj','battery',0.3),('Compass_Open.obj','compass',0.12),('Tent.obj','tent',1.65),('Torch.obj','torch',0.7),('Raft.obj','raft',0.4)]]
for index,(path,name,height) in enumerate(imports):
    before=set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=str(path))
    imported=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
    if name == 'tent':
        # The source OBJ's very dark cloth is unreadable in the game renderer.
        # Use a dedicated palette so shared imported materials stay untouched.
        tent_colors = {
            'Green': (0.43, 0.39, 0.18),
            'LightGreen': (0.62, 0.56, 0.29),
            'DarkWood': (0.32, 0.19, 0.09),
            'Black': (0.085, 0.075, 0.055),
        }
        for obj in imported:
            for slot in obj.material_slots:
                if slot.material:
                    source_name = slot.material.name.split('.')[0]
                    if source_name in tent_colors:
                        slot.material = material('tent_' + source_name, tent_colors[source_name])
    for obj in imported:
        for c in list(obj.users_collection):c.objects.unlink(obj)
        collection.objects.link(obj)
        parts.append(obj)
    bounds=[o.matrix_world @ Vector(p) for o in imported for p in o.bound_box]
    low=Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
    high=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    scale=height/max(high.z-low.z,0.0001)
    center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    for obj in imported:
        for v in obj.data.vertices:v.co=(obj.matrix_world @ v.co-center)*scale
        obj.matrix_world.identity()
    export(name,17+index)

exec(compile((ROOT/'scripts/build-raft-equipment.py').read_text(encoding='utf-8'), 'build-raft-equipment.py', 'exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/campaign/sources/campaign-props.blend'))
print('Exported campaign prop kit and saved editable Blender source.')
