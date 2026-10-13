# Geometry gate report —

class: **character** · meshes: 1 · triangles: 288 · dims: [0.6153, 1.575, 1.906] · Blender

**Result: PASS** (0 hard failures, 2 warnings)

| Gate | Measured | Threshold | Verdict | Fix |
| --- | --- | --- | --- | --- |
| triangle budget | 288 | <= 900 | PASS |  |
| dimensions (m) | [0.6153, 1.575, 1.906] | plausible for the object | PASS |  |
| lowest point z | 0.0 | |z| <= 0.02 | PASS |  |
| deer: transforms applied | True | True | PASS |  |
| deer: negative scale | False | False | PASS |  |
| deer: UV layers | 1 | >= 1 | PASS |  |
| deer: empty material slots | 0 | 0 | PASS |  |
| deer: degenerate faces | 0 | 0 | PASS |  |
| deer: loose vertices | 0 | 0 | PASS |  |
| deer: loose parts | 24 | <= 3 | WARN | delete debris islands / join intended parts |
| deer: non-manifold edges | 0 | 0 | PASS |  |
| deer: boundary edges | 0 | 0 on closed shapes | PASS |  |
| deer: smooth shading | 0.0% smooth | 100% smooth | WARN | shade_smooth() / smooth by angle |
| deer: materials | 1 | <= 4 | PASS |  |
