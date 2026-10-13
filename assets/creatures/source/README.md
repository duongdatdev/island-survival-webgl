# Original biome wildlife

Created for Island Survival using Blender MCP and the Blender LPM toolkit.
These original models and recipes are dedicated to the public domain under CC0 1.0:
https://creativecommons.org/publicdomain/zero/1.0/
Existing boar, crab, seagull and shark models retain their original licenses.

| Asset | Triangles / budget | Dimensions (X/Y/Z, Blender metres) |
| --- | --- | --- |
| Deer | 288 / 900 | 0.6153 / 1.575 / 1.906 |
| Goat | 252 / 700 | 0.5634 / 1.575 / 1.4145 |
| Monitor lizard | 420 / 700 | 0.7133 / 2.1791 / 0.3494 |

Each model uses one palette material, flat shading and grounded geometry.
GLB runtime copies are one directory above; FBX, blend files, palette textures,
inspection JSON and geometry gate reports are retained here for editing.
Gate warnings for separate primitive shells and flat character shading are intentional.
Five-view silhouette sheet: `views/sheet.png`.
Recipe: `scripts/build-biome-wildlife.py` at the repository root.
Runtime motion uses body sway; these models do not contain skeletal animation clips.
