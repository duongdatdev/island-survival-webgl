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
*Class:* [Inventory](file:///d:/Project/webgl/island-survival/src/systems/InventoryV2.js)
* Slot-based since v0.2: a flat 28-entry array — indices `0–19` are the backpack grid, `20–27` the hotbar. Each slot holds `{ id, count }` or `null`.
* `addItem` fills the hotbar first, then the grid, respecting each resource's `stackSize`. It returns `false` when the bag can't take the whole amount, which is what lets `ResourceManager` refuse a pickup instead of destroying it.
* Exposes `addItem`, `removeItem`, `removeItemAt`, `getCount`, `hasItem` and `getEquippedItem`.
* Consumption is data-driven: `GameScene._consumeItemAt` reads the `vitalEffect` off the ResourceDatabase entry, so adding an edible item needs no new branch in the input handlers.

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

## 8. Audio System (v1.1)
*Classes:* [AudioManager](file:///d:/Project/webgl/island-survival/src/core/AudioManager.js), [AmbienceDirector](file:///d:/Project/webgl/island-survival/src/core/audio/AmbienceDirector.js), [MusicDirector](file:///d:/Project/webgl/island-survival/src/core/audio/MusicDirector.js), [AudioBuffers](file:///d:/Project/webgl/island-survival/src/core/audio/AudioBuffers.js), [Spatial](file:///d:/Project/webgl/island-survival/src/core/audio/Spatial.js)

Architecture (v1.1 restructure):
```
master ─┬─ sfx ──────────── one-shots (AudioManager)
        └─ duck ─┬─ ambient ──── loops + 3D emitters (AmbienceDirector)
                 └─ music ────── procedural pad (MusicDirector)
```

* **AudioManager** — facade. Initializes the `AudioContext` on first user gesture and owns the mixer graph, per-bus volume sliders, and every one-shot SFX method (pickups, combat, crafting, footsteps, UI feedback). Noise-based cues render through `AudioBuffers` rather than building arrays at play time.
* **AudioBuffers** — pre-rendered, cached procedural sample banks. Multiple randomised variants per key so repeated plays don't sound identical. Also holds `crossfadeLoop`, `fillNoiseBurst` and `fillBrownNoise` helpers.
* **AmbienceDirector** — every looping, world-driven sound: surf, wind, rain, day/night wildlife beds (insects, crickets), scheduled one-shots (birdsong, owl hoots), and positional 3D emitters (waterfall, campfire). Levels smooth toward targets each frame for fade transitions.
* **MusicDirector** — procedural ambient score. Four chord voices (detuned oscillator pairs) through a lowpass filter and tremolo. Mood changes (`calm`/`night`/`danger`) retune the same voices instead of restarting.
* **Spatial** — `createPanner`, `setPannerPosition`, `setListenerPose` wrappers that detect `AudioParam` vs legacy `setPosition()`/`setOrientation()` support.
* Per-call `detune` (±35 cents) on every one-shot prevents mechanical repetition.
* The **duck bus** pulls ambient + music under menus and death screens while SFX stays audible.
* **Heartbeat** fades in below 35% health; frequency increases with severity.
* **Positional emitters** use `PannerNode` with distance profiles per emitter class (`prop`, `landmark`, `creature`).
* Thunder is routed through the ambient bus (not SFX) so the ambient volume slider controls it.
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

---

## 11. Environment System (v0.4)
*Classes:* [DayNightCycle](file:///d:/Project/webgl/island-survival/src/systems/DayNightCycle.js), [WeatherSystem](file:///d:/Project/webgl/island-survival/src/systems/WeatherSystem.js) & [RainSystem](file:///d:/Project/webgl/island-survival/src/systems/RainSystem.js)
* **DayNightCycle:** advances a normalised `timeOfDay` in `[0, 1)` and derives the sun direction, light colour/intensity and a two-stop sky gradient from it.
* **WeatherSystem:** a state machine over Clear → Cloudy → Rain → Storm, interpolating `cloudCover`, `windSpeed` and `rainIntensity` between states. Storms also emit lightning flashes, which drive the post-processing exposure spike.
* **RainSystem:** spawns rain particles in a volume that follows the player, so density stays constant regardless of where they are.
* Weather feeds the water shader's wave amplitude/speed and the AudioManager's wind/rain/thunder gains.

---

## 12. Wildlife System (v0.5)
*Classes:* [Creature](file:///d:/Project/webgl/island-survival/src/entities/Creature.js) and its subclasses [Crab](file:///d:/Project/webgl/island-survival/src/entities/Crab.js), [Seagull](file:///d:/Project/webgl/island-survival/src/entities/Seagull.js), [Boar](file:///d:/Project/webgl/island-survival/src/entities/Boar.js), [Shark](file:///d:/Project/webgl/island-survival/src/entities/Shark.js)
* Shared state machine: `IDLE → PATROL → CHASE → ATTACK → FLEE → DEAD`. Subclasses override individual handlers rather than the whole loop — the Boar replaces `_updateChase` with a rate-limited charge, the Seagull and Shark replace `update` outright because they move in 3D / at a fixed water plane.
* Damage to the player is applied by `GameScene`, not by the creature: the creature only reports readiness via `canDamagePlayer()`, which is also what arms its attack cooldown. Arming the cooldown inside `_updateAttack` made every swing self-cancel.
* Movement match-ups are tuned against a 3.2 m/s walk and 4.4 m/s stamina sprint. Boars telegraph and lock their 5.2 m/s charge direction; sharks choose either a 3.6 m/s circle step or a capped 5.2 m/s rush, never both in one frame.
* Corpses set `collider.type = 'none'` so they stop shoving things while they fade out, then are unregistered and deleted once `deadDuration` elapses.
* **Spawn placement** (all counts are targets; the loops retry and may fall short on a hostile seed):

| Species | Count | Placement |
| :--- | :---: | :--- |
| Crab | 12 | Beach ring between `innerRadius` and `radius`, terrain height `0 < y ≤ 0.35` |
| Seagull | 4 | Anywhere inside `innerRadius × 0.6`, at altitude 10–15 |
| Boar | 5 | Forest biome only (real `BiomeGenerator.getBiome` lookup), height `> 0.3`, min 10 units apart |
| Shark | 3 | Open water ring `island.radius + 5` to `+ 13`, at the water surface |

---

## 13. Combat System (v0.5)
*Class:* [CombatSystem](file:///d:/Project/webgl/island-survival/src/systems/CombatSystem.js)
* Weapon stats come from the equipped item's ResourceDatabase entry (`weaponType`, `weaponDamage`, `weaponRange`, `weaponCooldown`). Anything without those fields swings as a fist, which is the one set of numbers hardcoded here.
* **Melee:** picks the closest living creature inside a ±63° cone, rejecting targets whose vertical offset exceeds the weapon range — this is why only the bow can reach a circling seagull.
* **Ranged:** projects each creature onto the aim heading and accepts the nearest whose perpendicular distance falls inside its collider radius. Consumes one arrow per shot and reports `no_ammo` rather than firing dry.
* A single global cooldown is shared across weapons; a swing that misses still pays it, so whiffing has a cost.
* Aim uses the **camera heading**, not `player.rotation`, because the player model only turns while walking.

---

## 14. Persistence & Settings (v1.0)
*Classes:* [SaveSystem](file:///d:/Project/webgl/island-survival/src/systems/SaveSystem.js), [SettingsManager](file:///d:/Project/webgl/island-survival/src/systems/SettingsManager.js), [AchievementSystem](file:///d:/Project/webgl/island-survival/src/systems/AchievementSystem.js) & [MenuUI](file:///d:/Project/webgl/island-survival/src/systems/MenuUI.js)
* **SaveSystem:** stores the **world seed** instead of terrain geometry — generation is deterministic, so the island rebuilds exactly for a fraction of the storage cost. Only divergence from a fresh world is written: surviving pickups, inventory, vitals, structures, blueprints, weather and run stats. Transient things (debris, particles, creatures) respawn on load. A save whose `version` doesn't match is treated as absent rather than half-applied.
* **SettingsManager:** single source of truth for every user preference, clamped on load so a hand-edited value can't push the renderer into an invalid state. Publishes changes through `onChange`, which `Engine` and `GameScene` both subscribe to.
* **AchievementSystem:** each milestone is a `check(stats)` predicate evaluated once a second against the running stat block. Unlocks persist at the **profile** level, so wiping a save keeps the trophy case.
* **MenuUI:** binds the shared settings/achievements/credits overlays once. Both the main menu and the pause menu construct one and `dispose()` it on teardown — the overlays are shared DOM, so a leaked listener would fire every action twice.
* Storage keys: `island_survival_save_v1`, `island_survival_settings_v1`, `island_survival_achievements_v1`.

---

## 15. Rendering Optimisation (v1.0)
*Classes:* [Frustum](file:///d:/Project/webgl/island-survival/src/renderer/Frustum.js) & [PostProcessing](file:///d:/Project/webgl/island-survival/src/renderer/PostProcessing.js)
* **Frustum:** extracts the six clip planes straight out of `projection × view` (Gribb/Hartmann), costing one matrix multiply per frame. Combined with a draw-distance test, it typically rejects ~90% of the ~1,900 placed props before they reach the GPU. Disabling culling in settings disables the distance check too — players who ask for "no culling" mean nothing should pop.
* **PostProcessing:** the scene renders into a half-float framebuffer, then a soft-knee bright pass, a two-iteration separable Gaussian blur at half resolution, and a composite with bloom, time-of-day grade tint, lightning-driven exposure and vignette. If the driver reports the float extension but can't actually render to `RGBA16F`, it retries once at `RGBA8` before disabling itself and falling back to direct rendering.
* **Render scale:** `Engine._resize` sizes the drawing buffer by the `renderScale` setting while CSS still fills the window, trading sharpness for fill rate without touching layout.

---

## 16. Collision System
*Classes:* [CollisionSystem](file:///d:/Project/webgl/island-survival/src/systems/CollisionSystem.js), [CollisionLayers](file:///d:/Project/webgl/island-survival/src/systems/CollisionLayers.js) & [CollisionMatrix](file:///d:/Project/webgl/island-survival/src/systems/CollisionMatrix.js)
* Layers are a bitmask (`Player`, `Environment`, `Terrain`, `Debris`, `BuildArea`, `Trigger`, `UI`, `Creature`); the matrix decides which pairs interact.
* `resolvePlayerCollisions` handles any moving actor, not just the player. It takes an `ignoreLayerMask` so the player can be resolved while ignoring the `Creature` layer — creatures get pushed out of the player, never the reverse, which stopped wildlife from shoving the player around.
* Overlap is tested on XZ **and** Y: without the vertical test a seagull orbiting 12 units overhead still collided with everything below it.
* Colliders may set `snapToTerrain: false` so flying and swimming creatures aren't dragged down to the ground plane.
