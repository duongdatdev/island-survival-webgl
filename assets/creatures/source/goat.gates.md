# Geometry gate report —

class: **character** · meshes: 1 · triangles: 252 · dims: [0.5634, 1.575, 1.4145] · Blender

**Result: PASS** (0 hard failures, 2 warnings)

| Gate | Measured | Threshold | Verdict | Fix |
| --- | --- | --- | --- | --- |
| triangle budget | 252 | <= 700 | PASS |  |
| dimensions (m) | [0.5634, 1.575, 1.4145] | plausible for the object | PASS |  |
| lowest point z | 0.0 | |z| <= 0.02 | PASS |  |
| goat: transforms applied | True | True | PASS |  |
| goat: negative scale | False | False | PASS |  |
| goat: UV layers | 1 | >= 1 | PASS |  |
| goat: empty material slots | 0 | 0 | PASS |  |
| goat: degenerate faces | 0 | 0 | PASS |  |
| goat: loose vertices | 0 | 0 | PASS |  |
| goat: loose parts | 21 | <= 3 | WARN | delete debris islands / join intended parts |
| goat: non-manifold edges | 0 | 0 | PASS |  |
| goat: boundary edges | 0 | 0 on closed shapes | PASS |  |
| goat: smooth shading | 0.0% smooth | 100% smooth | WARN | shade_smooth() / smooth by angle |
| goat: materials | 1 | <= 4 | PASS |  |
