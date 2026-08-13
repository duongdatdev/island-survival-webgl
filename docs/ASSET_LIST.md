# Asset List

The **Island Survival: Escape** project uses a low-poly, stylized art direction combining imported runtime assets with **Procedural Content Generation & Real-time Synthesis**. Environment props, survival items, characters, and creatures may be loaded from OBJ/GLB files, while terrain, water, weather, effects, and audio remain generated at runtime.

---

## 📐 3D Models

### Creature GLB assets

Creature models are loaded from `assets/creatures/manifest.json`, compiled once, and shared by all instances. Skeletal animations remain embedded in the source GLBs but are not played yet.

| Game creature | File | Source title | Author |
| --- | --- | --- | --- |
| Boar | `boar.glb` | Boar | Poly by Google |
| Crab | `crab.glb` | Crab Enemy | Quaternius |
| Seagull | `seagull.glb` | Pigeon | Quaternius |
| Shark | `shark.glb` | Shark | Quaternius |

### Procedural meshes

Other meshes are generated programmatically using algorithms or built by combining primary geometric shapes:

-   **Player Character:** Built using color-coded box shapes (Cubes) representing the torso (red), head (flesh-toned), and visor (dark black).
-   **Island Terrain:** Programmatically built on a radial 80x80 height grid, featuring noise-based slopes and valleys that naturally descend toward sea level.
-   **Ocean Water:** A 60x60 grid flat plane displaced in real-time inside the Vertex Shader using sine/cosine equations to simulate waves.
-   **Gatherable Resources:**
    -   *Palm Trees:* A stack of slightly tilted brown boxes for the trunk, topped with flat green boxes for leaves.
    -   *Rock Formations:* Randomized polygonal blocks scattered along the shoreline.
    -   *Wood/Stone Pickups:* Small boxes colored appropriately, spawned at random spots on the island.
-   **Ocean Debris:**
    -   *Wood Barrel:* Cylinder approximation made by arranging box segments.
    -   *Rope Coil:* A small golden-brown torus/ring approximation.
    -   *Wood / Stone:* Simple box shapes representing wood planks or drifting stones.
-   **Raft Modules:**
    -   *Raft Frame:* A flat wooden platform composed of intersecting timber beams.
    -   *Barrel Floats:* Three barrels placed horizontally underneath the frame.
    -   *Paddle:* A long steering paddle attached to the rear.
-   **Survival Structures:**
    -   *Campfire:* Uses the Survival Pack `Bonfire_Fire.obj` model; retains the procedural campfire as a load-failure fallback.
    -   *Water Collector:* A wooden support frame catching drips into a collector container with an animated falling water drop.
-   **New Collectibles/Consumables:**
    -   *Coconut:* A small green/brown cube shape.
    -   *Raw Fish:* A flat silver/gray box shape.
    -   *Fresh Water:* Blue water surface inside the collector.

---

## 🎨 Image Textures

GLB creature models may contain embedded base-color textures. Procedural geometry continues to use vertex colors:

-   **Player Skin (Data URL):** A 1x1 base64 encoded transparent PNG texture loaded as a default WebGL Texture.
-   **Vertex Colors & Shaders:** Procedural objects use vertex-colored geometry coupled with Blinn-Phong lighting calculations inside the shader program to achieve a clean, modern low-poly look.

---

## 🔊 Audio Assets (Procedural Web Audio Synthesis)
The `AudioManager` synthesizes all sound effects and music loops at runtime using browser audio nodes (no static `.mp3` or `.wav` files are loaded):

-   **Ocean Waves Ambient Loop:** Generated from a white noise buffer filtered through a lowpass filter, modulated in volume by a slow LFO (0.1Hz - 0.2Hz) to simulate tides.
-   **Wind Ambient Loop:** Generated from pink noise passed through a bandpass filter with a random, drifting cutoff frequency.
-   **Seagull Calls:** High-frequency (800Hz - 2500Hz) sine wave pulses with rapid frequency pitch bends.
-   **Footsteps SFX:** Short noise bursts shaped by a lowpass envelope to sound like footsteps on sand.
-   **Item Pickup SFX:** A fast, ascending musical arpeggio (880Hz -> 1320Hz -> 1760Hz).
-   **Craft/Build SFX:** Low-frequency square wave pulses combined with short white noise clicks to simulate hammering wood.
-   **Victory Fanfare:** A triumphant chord arpeggio based on a C-major scale (C4 -> E4 -> G4 -> C5 -> E5 -> G5) with exponential decay.
