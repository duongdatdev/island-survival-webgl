# Feature Checklist

Here is the checklist of the implemented features. All core MVP features are fully completed and functional in the current version's codebase.

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
