# Geometry gate report —

class: **character** · meshes: 1 · triangles: 420 · dims: [0.7133, 2.1791, 0.3494] · Blender

**Result: PASS** (0 hard failures, 2 warnings)

| Gate | Measured | Threshold | Verdict | Fix |
| --- | --- | --- | --- | --- |
| triangle budget | 420 | <= 700 | PASS |  |
| dimensions (m) | [0.7133, 2.1791, 0.3494] | plausible for the object | PASS |  |
| lowest point z | 0.0 | |z| <= 0.02 | PASS |  |
| monitor: transforms applied | True | True | PASS |  |
| monitor: negative scale | False | False | PASS |  |
| monitor: UV layers | 1 | >= 1 | PASS |  |
| monitor: empty material slots | 0 | 0 | PASS |  |
| monitor: degenerate faces | 0 | 0 | PASS |  |
| monitor: loose vertices | 0 | 0 | PASS |  |
| monitor: loose parts | 35 | <= 3 | WARN | delete debris islands / join intended parts |
| monitor: non-manifold edges | 0 | 0 | PASS |  |
| monitor: boundary edges | 0 | 0 on closed shapes | PASS |  |
| monitor: smooth shading | 0.0% smooth | 100% smooth | WARN | shade_smooth() / smooth by angle |
| monitor: materials | 1 | <= 4 | PASS |  |
