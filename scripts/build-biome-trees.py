"""Blender MCP recipe: mangrove stilt roots and umbrella acacia, 800 tris each.
One palette material; OBJ uses per-face palette names for the game's vertex-color loader.
"""
import bpy, sys, os, json, math
from mathutils import Vector
sys.path.insert(0, r'C:/Users/DuongDat/.codex/skills/blender-lpm-skill/scripts')
import lpm, inspect_scene
ROOT = r'D:/Project/webgl/island-survival/assets/environment'
os.makedirs(ROOT+'/source', exist_ok=True)
P = lpm.Palette([('wood', '#73512F'), ('leaves', '#387F3D')])
for name, biome in [('MangroveTree', 'Mangrove'), ('AcaciaTree', 'Savanna')]:
    for old in list(bpy.data.objects):
        if old.name == name or old.name.startswith(name+'_'): bpy.data.objects.remove(old, do_unlink=True)
    parts = []
    def branch(a, b, width):
        start, end = Vector(a), Vector(b)
        ob = lpm.prism(name+'_wood', sides=6, radius=width, height=(end-start).length, color=P['wood'], radius_top=width*.7)
        ob.rotation_euler = (end-start).to_track_quat('Z','Y').to_euler()
        ob.location = start
        parts.append(ob)
    # Prisms stand on their base; orient the base at the branch start.
    if biome == 'Mangrove':
        branch((0,0,.7),(.15,0,3.2),.20)
        for i in range(6):
            angle = i*math.tau/6
            x,y = math.cos(angle),math.sin(angle)
            branch((x*.90,y*.90,.02),(x*.65,y*.65,.65),.09)
            branch((x*.65,y*.65,.65),(0,0,1.6),.09)
        for x,y,z,r in [(-.65,0,2.65,1.1),(.7,.2,2.8,1.0),(0,-.6,3.0,1.15)]:
            parts.append(lpm.lathe(name+'_leaves', [(0,z-.35),(r*.85,z-.25),(r,z+.1),(r*.65,z+.7),(0,z+.85)], segments=8, at=(x,y,0), color=P['leaves']))
    else:
        branch((0,0,0),(.1,0,2.4),.17)
        for i in range(4):
            a=i*math.tau/4
            x,y=math.cos(a)*1.4,math.sin(a)*1.4
            branch((.1,0,1.7),(x,y,3),.10)
            parts.append(lpm.lathe(name+'_leaves',[(0,2.8),(1.2,2.95),(1.35,3.18),(.7,3.45),(0,3.48)],segments=8,at=(x,y,0),color=P['leaves']))
    bpy.context.view_layer.update()
    ob=lpm.finish(name,parts,P,budget=800)
    bpy.context.view_layer.update()
    rep=lpm.export_unity(ob,ROOT+'/source/'+name,glb=True)
    m=inspect_scene.mesh_metrics(ob,bpy.context.evaluated_depsgraph_get(),1e-9)
    with open(ROOT+'/source/'+name+'.inspect.json','w') as f:
        json.dump({'meshes':[m],'totals':{'tris':rep['tris']},'bounds_world':{**m['bounds_world'],'dims':m['dims_world']}},f,indent=2)
    # Explicit Y-up conversion and face-local normals, retaining palette definitions.
    lines=['# Original Island Survival Blender LPM; metres, Y up']
    attr=ob.data.attributes['lpm_color']
    offset=1
    for face in ob.data.polygons:
        lines.append('usemtl '+P.entries[attr.data[face.index].value][0])
        for index in face.vertices:
            v=ob.data.vertices[index].co
            lines.append(f'v {v.x:.6f} {v.z:.6f} {-v.y:.6f}')
        n=face.normal
        for _ in face.vertices: lines.append(f'vn {n.x:.6f} {n.z:.6f} {-n.y:.6f}')
        lines.append('f '+' '.join(f'{i}//{i}' for i in range(offset,offset+len(face.vertices))))
        offset+=len(face.vertices)
    with open(ROOT+'/OBJ/'+name+'.obj','w') as f: f.write('\n'.join(lines)+'\n')
    meta={'id':name.lower(),'displayName':name,'category':'Tree','biome':biome,'collision':True,
          'navigationBlocker':True,'proceduralPlacement':True,'minScale':.8,'maxScale':1.2,
          'spawnWeight':8,'license':'CC0-1.0','source':'Original Blender LPM recipe'}
    with open(ROOT+'/OBJ/'+name+'.asset.json','w') as f: json.dump(meta,f,indent=2)
    ob.location=(0,4 if biome=='Mangrove' else 9,0)
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/source/biome-trees.blend')
