# Geometry gate report —

class: **environment-module** · meshes: 1 · triangles: 404 · dims: [2.95, 3.4348, 3.9014] · Blender

**Result: PASS** (0 hard failures, 1 warnings)

| Gate | Measured | Threshold | Verdict | Fix |
| --- | --- | --- | --- | --- |
| triangle budget | 404 | <= 800 | PASS |  |
| dimensions (m) | [2.95, 3.4348, 3.9014] | plausible for the object | PASS |  |
| lowest point z | 0.0 | |z| <= 0.02 | PASS |  |
| MangroveTree: transforms applied | True | True | PASS |  |
| MangroveTree: negative scale | False | False | PASS |  |
| MangroveTree: UV layers | 1 | >= 1 | PASS |  |
| MangroveTree: empty material slots | 0 | 0 | PASS |  |
| MangroveTree: degenerate faces | 0 | 0 | PASS |  |
| MangroveTree: loose vertices | 0 | 0 | PASS |  |
| MangroveTree: loose parts | 16 | <= 12 | WARN | delete debris islands / join intended parts |
| MangroveTree: non-manifold edges | 0 | 0 | PASS |  |
| MangroveTree: flat shading | 0.0% smooth | 0% smooth | PASS |  |
| MangroveTree: materials | 1 | <= 2 | PASS |  |
