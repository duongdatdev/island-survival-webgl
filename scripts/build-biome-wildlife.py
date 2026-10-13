"""Run in Blender MCP. Three original flat-shaded palette wildlife, metres, -Y forward.
Budgets: deer 900 tris / 1.9 m tall with antlers; goat 700 / 1.4 m; monitor 700 / 2.18 m long.
"""
import sys, os, json, math
import bpy
from mathutils import Vector
sys.path.insert(0, r'C:/Users/DuongDat/.codex/skills/blender-lpm-skill/scripts')
import lpm
import inspect_scene

OUT = r'D:/Project/webgl/island-survival/assets/creatures'
SOURCE = os.path.join(OUT, 'source')
os.makedirs(SOURCE, exist_ok=True)
P = lpm.Palette([('fur', '#A46C3C'), ('cream', '#E4D1AA'), ('dark', '#302B26'),
                 ('horn', '#776650'), ('goat', '#B7ACA0'), ('green', '#556747'), ('belly', '#A8B17D')])
reports = []
# Re-running replaces only this recipe's objects.
for previous in list(bpy.data.objects):
    if any(previous.name == key or previous.name.startswith(key + '_') for key in ['deer', 'goat', 'monitor']):
        bpy.data.objects.remove(previous, do_unlink=True)
for species, budget in [('deer', 900), ('goat', 700), ('monitor', 700)]:
    parts = []
    def box(name, size, at, color, taper=(1, 1)):
        ob = lpm.box(species + '_' + name, size, at, P[color], taper)
        parts.append(ob)
        return ob
    def limb(name, start, end, width, color):
        a, b = Vector(start), Vector(end)
        ob = box(name, (width, width, (b-a).length), (0, 0, 0), color, (.65, .65))
        ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        ob.location = a
        return ob
    if species != 'monitor':
        deer = species == 'deer'
        fur = 'fur' if deer else 'goat'
        h = .68 if deer else .38
        box('body', (.40, .88, .42), (0, .08, h), fur, (.82, .88))
        box('chest', (.31, .30, .44), (0, -.28, h-.02), 'cream' if deer else fur)
        limb('neck', (0, -.31, h+.25), (0, -.48, h+.68), .23, fur)
        box('head', (.24, .35, .25), (0, -.57, h+.55), fur, (.82, .9))
        box('muzzle', (.19, .22, .13), (0, -.79, h+.53), 'dark' if deer else 'cream')
        for side in [-1, 1]:
            limb('ear', (side*.09, -.49, h+.70), (side*.26, -.46, h+(.89 if deer else .80)), .10, fur)
            box('eye', (.018, .06, .045), (side*.124, -.68, h+.68), 'dark')
            for y in [-.24, .39]:
                limb('leg', (side*.14, y, h+.08), (side*.16, y+.04, .10), .085, fur)
                box('hoof', (.10, .13, .11), (side*.16, y+.02, 0), 'dark')
            if deer:
                limb('antler', (side*.08, -.50, h+.76), (side*.19, -.35, h+1.02), .045, 'horn')
                limb('antler_tip', (side*.19, -.35, h+1.02), (side*.23, -.48, h+1.22), .033, 'horn')
                limb('antler_branch', (side*.16, -.39, h+.95), (side*.30, -.40, h+1.12), .028, 'horn')
            else:
                limb('horn', (side*.08, -.47, h+.77), (side*.13, -.24, h+1.02), .065, 'horn')
        box('tail', (.10, .23, .12), (0, .56, h+.18), 'cream', (.5, .5))
        if not deer:
            box('beard', (.10, .11, .20), (0, -.66, h+.34), 'dark', (.7, .7))
    else:
        box('body', (.34, .68, .20), (0, 0, .16), 'green', (.8, .9))
        box('belly', (.27, .60, .05), (0, -.01, .13), 'belly')
        box('neck', (.22, .28, .16), (0, -.39, .18), 'green')
        box('head', (.25, .28, .16), (0, -.60, .17), 'green', (.8, .75))
        box('snout', (.18, .18, .10), (0, -.80, .17), 'belly')
        for side in [-1, 1]:
            box('eye', (.018, .055, .04), (side*.126, -.65, .27), 'dark')
            for y in [-.23, .23]:
                limb('upper_leg', (side*.12, y, .24), (side*.32, y+.10, .12), .11, 'green')
                limb('foot', (side*.32, y+.10, .12), (side*.30, y-.06, .04), .07, 'belly')
                for toe in range(3):
                    box('claw', (.025, .09, .035), (side*(.27+toe*.03), y-.10, .025), 'dark')
        limb('tail_base', (0, .28, .25), (0, .68, .16), .23, 'green')
        limb('tail_mid', (0, .65, .16), (.12, 1.01, .07), .12, 'green')
        limb('tail_tip', (.12, 1.0, .07), (.25, 1.28, .04), .055, 'green')
        for i in range(5):
            box('back_mark', (.14, .04, .012), (0, -.20+i*.11, .357), 'dark')
    ob = lpm.finish(species, parts, P, budget=budget)
    bpy.context.view_layer.update()
    rep = lpm.export_unity(ob, os.path.join(SOURCE, species), glb=True)
    # Runtime file is separate from source FBX/Blender/palette delivery.
    import shutil
    shutil.copyfile(os.path.join(SOURCE, species+'.glb'), os.path.join(OUT, species+'.glb'))
    metrics = inspect_scene.mesh_metrics(ob, bpy.context.evaluated_depsgraph_get(), 1e-9)
    with open(os.path.join(SOURCE, species+'.inspect.json'), 'w') as f:
        json.dump({'meshes': [metrics], 'totals': {'tris': rep['tris']},
                   'bounds_world': {**metrics['bounds_world'], 'dims': metrics['dims_world']}}, f, indent=2)
    reports.append(rep)
    ob.location.x = {'deer': -2.1, 'goat': 0, 'monitor': 2.1}[species]

with open(os.path.join(SOURCE, 'wildlife-metrics.json'), 'w') as f:
    json.dump(reports, f, indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE, 'wildlife-lineup.blend'))
print(json.dumps([{'species': r['name'], 'triangles': r['tris'], 'budget': r['budget'], 'dimensions': r['dims_m']} for r in reports]))
