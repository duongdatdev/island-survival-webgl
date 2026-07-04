# Game Systems

The **Island Survival: Escape** codebase is built around modular, decoupled systems that handle logic and presentation, orchestrated together within the central [GameScene](file:///d:/Project/webgl/island-survival/src/scenes/GameScene.js) class.

---

## 1. Player System
*Class:* [Player](file:///d:/Project/webgl/island-survival/src/entities/Player.js)
* Manages character translation in response to `W`, `A`, `S`, `D` inputs relative to the camera's current yaw angle.
* Computes player altitude automatically by querying the [Terrain](file:///d:/Project/webgl/island-survival/src/entities/Terrain.js) height map using bilinear interpolation across the nearest grid cells.
* Handles collision boundaries to prevent the player from clipping through island rocks or walking too far off the island boundary.
* Emits dust particle effects (`DUST`) and triggers footstep audio cues when moving.

---

## 2. Inventory System
*Class:* [Inventory](file:///d:/Project/webgl/island-survival/src/systems/Inventory.js)
* Uses a standard JavaScript `Map` to store item IDs paired with numerical quantities.
* Exposes core functions: `addItem`, `removeItem`, `getCount`, and `hasItem`.
* Employs an event-driven `onChange` callback pattern that automatically alerts UI overlays (HUD, crafting panel) to redraw whenever inventory contents change.

---

## 3. Crafting System
*Class:* [CraftingSystem](file:///d:/Project/webgl/island-survival/src/systems/CraftingSystem.js) & [RecipeDatabase](file:///d:/Project/webgl/island-survival/src/systems/RecipeDatabase.js)
* Houses the recipe databases for all craftable components (Stone Axe, Raft Frame, Barrel Floats, Paddle).
* Validates crafting requirements against the player's current inventory.
* Consumes resource ingredients and inserts the newly crafted product into the inventory.

---

## 4. Ocean Debris System
*Classes:* [DebrisManager](file:///d:/Project/webgl/island-survival/src/systems/DebrisManager.js) & [DriftingDebris](file:///d:/Project/webgl/island-survival/src/entities/DriftingDebris.js)
* Spawns random debris (Wood, Stone, Ropes, Barrels) at a fixed radius out in the ocean.
* Updates debris positions based on a drift vector modeling ocean currents.
* Detects collision with the sandy beach, halting drift movement so they stay on the beach waiting for pickup.
* Automatically prunes and despawns debris that drifts too far past the island to save CPU/GPU memory.

---

## 5. Raft Assembly System (Build System)
*Class:* [RaftAssembly](file:///d:/Project/webgl/island-survival/src/entities/RaftAssembly.js)
* Tracks assembly progress at the dedicated shoreline site `[0, 0, 20]`.
* Manages the build state machine through flags: `framePlaced` -> `floatsPlaced` -> `paddlePlaced`.
* Show/hides component meshes dynamically depending on the current assembly state.
* Performs proximity checks to display the contextual build/interact HUD overlay prompts.

---

## 6. Terrain & Water System
*Classes:* [Terrain](file:///d:/Project/webgl/island-survival/src/entities/Terrain.js) & [Water](file:///d:/Project/webgl/island-survival/src/entities/Water.js)
* **Terrain:** Generates a radial 80x80 height grid using a conical function modified by random noise. Calculates vertex normals for Blinn-Phong lighting.
* **Water:** Generates a flat 60x60 grid surrounding the island. Relies on vertex shader displacement to create real-time wavy water movement.

---

## 7. UI System
*Classes:* Handled via DOM overlays in [GameScene](file:///d:/Project/webgl/island-survival/src/scenes/GameScene.js) & [index.html](file:///d:/Project/webgl/island-survival/index.html)
* Renders overlays (Loading Screen, Main Menu, Resource HUD, Crafting Panel, Pause Menu, Victory Screen) using HTML/CSS instead of canvas drawing, improving typography rendering performance.
* Handles layout styles including Glassmorphism and glow effects.

---

## 8. Audio System
*Class:* [AudioManager](file:///d:/Project/webgl/island-survival/src/core/AudioManager.js)
* Initializes a browser `AudioContext` upon the first explicit user gesture.
* Synthesizes audio waveforms dynamically using Web Audio API nodes.
* Manages volume states and saves user preferences to `localStorage`.

---

## 9. Particle System
*Class:* [ParticleSystem](file:///d:/Project/webgl/island-survival/src/systems/ParticleSystem.js) & [ParticleShader](file:///d:/Project/webgl/island-survival/src/shaders/ParticleShader.js)
* Spawns and animates hundreds of particles simultaneously on the GPU.
* Configures presets:
  *   `DUST`: Kick-up dust behind player's feet when running.
  *   `SPLASH`: Water splash particles when sailing or debris hits shore.
  *   `PICKUP`: Yellow sparks shrinking toward the player.
  *   `BUILD`: Flying wood splinters when hammering raft modules.
* Leverages WebGL 2 Instanced Rendering to draw all particles in a single draw call.

---

## 10. Tutorial System
*Class:* [TutorialSystem](file:///d:/Project/webgl/island-survival/src/systems/TutorialSystem.js)
* Leads players through sequentially structured tasks:
  1. Prompt player to move using WASD keys.
  2. Ask player to collect resources from the island/ocean.
  3. Prompt player to craft a Stone Axe and raft components.
  4. Direct player to the southern beach build site.
  5. Instruct player to click the Escape button to win.
