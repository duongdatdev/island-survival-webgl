# Feature Checklist

Checklist of implemented features, current as of **v1.0**. Sections are grouped
by the milestone that introduced them — see [ROADMAP.md](ROADMAP.md) for the
release narrative and balance tables.

## v0.1 — MVP

## 🧑‍🚀 Player & Camera
- [x] **Movement:** Player moves smoothly via `W`, `A`, `S`, `D` or arrow keys with a subtle head-bobbing animation.
- [x] **Third-person Camera:** Follows the player, rotates via left-click + drag, and supports zooming in/out with the mouse wheel.
- [x] **Collision Boundaries:** Prevents the player from clipping through rocks on the island or wandering too far into the ocean.

## 🎒 Inventory System
- [x] **Pickup:** Gather island resources (Wood, Stone) and ocean debris (Rope, Barrel) by standing nearby and pressing `E`.
- [x] **HUD Display:** Resource count displays at the bottom-left of the screen and updates instantly upon collection/consumption.

## 🔨 Crafting System
- [x] **Crafting Panel:** Press `C` to open the interface, which shows available recipes and their required materials.
- [x] **Resource Consumption:** Deducts materials automatically from the inventory upon successful crafting (e.g., Stone Axe costs 2 Wood + 2 Stone).
- [x] **Item Categories:** Supports tools (Stone Axe) and raft structural modules (Raft Frame, Barrel Floats, Paddle).

## ⛵ Raft Assembly & Win Condition
- [x] **Assembly Site:** Located at the beach on the south side of the island, marked by a reddish wireframe guide.
- [x] **Assembly Sequence:** Player stands near the assembly site and presses `E` to place components in order:
  1. Raft Frame (`raft_frame`)
  2. Barrel Floats (`barrel_floats`)
  3. Paddle (`paddle`)
- [x] **Escape Cutscene:** Once the raft is complete, clicking "Escape" triggers a cinematic camera sequence showing the raft sailing away from the island.
- [x] **Victory Screen:** Displays total survival duration in minutes and seconds, along with a replay button.

## ⚙️ Additional Features
- [x] **Particle System:** Displays dust under player feet, water splashes when sailing, yellow flares on pickup, and wood splinters during construction.
- [x] **Tutorial System:** Sequentially guides new players with a toast overlay at the bottom center (Move -> Collect -> Craft -> Build -> Escape).
- [x] **Advanced Debug Panel:** Press `F3` to toggle. Displays FPS, player position, camera rotation, and options for wireframe rendering and light rotation.
- [x] **Procedural AudioManager:** Synthesizes sound effects (Click, pickup, hit, victory) and ambient loops (Waves, wind, birds) dynamically using Web Audio API nodes.
- [x] **Developer Cheats:** Press `K` to teleport to the beach and receive all necessary raft components immediately for testing.

---

## v0.2 — Survival Systems
- [x] **Vitals HUD:** Health, Hunger, Thirst and Stamina bars with drain rates and low-value warning states.
- [x] **Grid Inventory:** 28 slots — a 20-slot backpack grid (indices 0–19) plus an 8-slot hotbar (20–27), with drag & drop and tooltips.
- [x] **Consumables:** Any resource carrying a `vitalEffect` can be used with `Q`, right-click or double-click; all three routes share `GameScene._consumeItemAt`.
- [x] **Campfire:** Placeable structure that cooks raw food into Cooked Meals.
- [x] **Water Collector:** Placeable structure that accumulates rainwater over time.
- [x] **Game Over:** Health reaching 0 shows a death screen and clears the save.

## v0.3 — Island Expansion
- [x] **Biomes & POIs:** Forest, rock areas, caverns and an interactive waterfall that restores thirst.
- [x] **Fishing:** Craftable fishing rod for catching fish along the coastline.
- [x] **Treasure Chests:** Four hidden chests holding rare resources and crafting blueprints.
- [x] **Raft Upgrades:** Sail and motor modules that speed up the escape cutscene.

## v0.4 — Dynamic World
- [x] **Day/Night Cycle:** Sun progression driving light angle, colour and sky gradient through dawn/day/dusk/night.
- [x] **Weather System:** Clear → Cloudy → Rain → Storm with smooth interpolation and lightning flashes.
- [x] **Dynamic Waves:** Weather-driven amplitude and speed multipliers feeding the water shader.
- [x] **Rain Particles:** Procedural rain spawned around the player during wet weather.
- [x] **Dynamic Audio:** Runtime-synthesised wind, rain and thunder tied to weather intensity.

## v0.5 — Wildlife & Combat
- [x] **Creature AI:** Shared Idle/Patrol/Chase/Attack/Flee/Dead state machine in [Creature.js](../src/entities/Creature.js), with per-species overrides.
- [x] **Four Species:** Crab (beach, passive), Seagull (sky, passive), Boar (forest, hostile charge), Shark (ocean, hostile while the player is in water).
- [x] **Combat:** Left-click attacks with the equipped hotbar item; melee uses a ±63° cone with a vertical reach limit, the bow raycasts along the aim heading.
- [x] **Weapon Stats in Data:** Damage/range/cooldown live on the ResourceDatabase entry (`weaponType`, `weaponDamage`, `weaponRange`, `weaponCooldown`); only the bare fist is a constant in CombatSystem.
- [x] **Ammunition:** Arrows craft 3 at a time (`yield: 3`) and are consumed per bow shot, with a hotbar ammo counter.
- [x] **Healing:** Bandages (3 Herb → +25 HP) — the only heal, since the player has no passive regeneration.
- [x] **Creature Loot:** Corpses drop meat as ordinary world pickups; sea creatures drop raw fish.
- [x] **Creature Collision:** Creatures collide with terrain, environment and each other, but never push the player.

## v1.0 — Release Polish
- [x] **Save/Load:** Full run state in `localStorage`, keyed on the **world seed** rather than terrain geometry. Autosaves every 60s and on exit; death and escape clear it.
- [x] **Settings Menu:** Audio, controls (sensitivity, invert-Y, FOV) and graphics, shared by the main menu and pause menu via [MenuUI.js](../src/systems/MenuUI.js).
- [x] **Graphics Presets:** Thấp / Trung Bình / Cao / Siêu Cao, falling back to *Tùy chỉnh* the moment an individual switch is toggled.
- [x] **Culling:** Frustum + draw-distance rejection for environment props, world resources and creatures.
- [x] **Post-Processing:** Half-float scene target → soft-knee bright pass → two-iteration separable bloom at half resolution → composite with grade tint, exposure and vignette. Falls back to direct rendering when the driver can't provide a float target.
- [x] **Achievements:** 14 milestones with unlock toasts and a browsable panel; unlocks persist at the profile level and survive a wiped save.
- [x] **Main Menu / Credits:** Continue (with survival-time preview), Start, Tutorial, Settings, Achievements and Credits.

---

## Not Implemented (deliberately)
- [ ] **Key rebinding** — the settings menu covers sensitivity, invert-Y and FOV, but remapping needs an input-action layer `InputManager` doesn't have.
- [ ] **Screen-space reflections / shadow maps** — both need a depth pre-pass and a second camera pass; bloom, grading and vignette deliver the visual lift far more cheaply.
