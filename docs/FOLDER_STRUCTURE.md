# Folder Structure

Here is the actual folder structure of the **Island Survival: Escape** project:

```text
island-survival/
├── docs/                           # Design documents and development guidelines
├── src/                            # Application source code
│   ├── core/                       # Core engine module managers
│   │   ├── AssetManager.js         # Asynchronous asset loading (Textures, Text)
│   │   ├── AudioManager.js         # Procedural audio synthesis (SFX/Ambient)
│   │   ├── Engine.js               # WebGL initialization, loop & scene orchestration
│   │   ├── GameLoop.js             # Logic updates and rendering tick loop
│   │   ├── InputManager.js         # Keyboard & mouse event listeners
│   │   ├── Scene.js                # Base class for game scenes
│   │   └── SceneManager.js         # Handles transitions and lifecycle of scenes
│   │
│   ├── math/                       # Matrix and Vector mathematics
│   │   ├── Mat4.js                 # 4x4 Matrix transformations (Translation, Rotation, Scale, Projection)
│   │   └── Vec3.js                 # 3D Vector calculation utilities
│   │
│   ├── renderer/                   # WebGL 2 rendering wrappers
│   │   ├── Camera.js               # Third-person orbital camera (Yaw, Pitch, Zoom, Follow, FOV)
│   │   ├── CameraCollision.js      # Keeps the camera from clipping into geometry
│   │   ├── CameraConfig.js         # Tunable camera constants per mode
│   │   ├── CameraDebug.js          # Camera state readout for the debug panel
│   │   ├── CameraOcclusion.js      # Fades objects between camera and player
│   │   ├── CameraState.js          # Base class for camera modes
│   │   ├── CameraTerrain.js        # Stops the camera dipping below the ground
│   │   ├── CameraZoomController.js # Mouse-wheel zoom handling
│   │   ├── BillboardSprite.js      # Camera-facing quads (sun, moon)
│   │   ├── Frustum.js              # v1.0 — clip-plane extraction & sphere culling
│   │   ├── Light.js                # Ambient & directional light management (Day/Night)
│   │   ├── Mesh.js                 # Geometry buffers wrapper (Vertex, Index, UV, Normal)
│   │   ├── PostProcessing.js       # v1.0 — HDR target, bloom chain, composite pass
│   │   ├── ShaderProgram.js        # Compiles and links Vertex & Fragment Shaders
│   │   └── Texture.js              # WebGL Texture initialization and properties setup
│   │
│   ├── entities/                   # Game world entities
│   │   ├── Entity.js               # Base entity class (Transform, Model Matrix)
│   │   ├── Player.js               # Player character (Movement, Terrain snap, Rotation)
│   │   ├── Terrain.js              # Procedural island heightmap grid generation
│   │   ├── Water.js                # Procedural dynamic ocean plane with waves
│   │   ├── Waterfall.js            # v0.3 — cliff POI with thirst-restoring water
│   │   ├── WorldResource.js        # Gatherable resources on the island (Trees, Rocks)
│   │   ├── EnvironmentObject.js    # Placed environment prop instance
│   │   ├── DriftingDebris.js       # Ocean debris (Wood, Stone, Ropes, Barrels)
│   │   ├── RaftAssembly.js         # Raft construction entity at the beach site
│   │   ├── Campfire.js             # v0.2 — placeable cooking structure
│   │   ├── WaterCollector.js       # v0.2 — placeable rainwater collector
│   │   ├── Creature.js             # v0.5 — base wildlife AI state machine
│   │   ├── Crab.js                 # v0.5 — passive beach creature
│   │   ├── Seagull.js              # v0.5 — passive flying creature
│   │   ├── Boar.js                 # v0.5 — hostile forest creature (charge attack)
│   │   └── Shark.js                # v0.5 — hostile water creature
│   │
│   ├── systems/                    # Core logic and state management systems
│   │   ├── InventoryV2.js          # 28-slot inventory (20 grid + 8 hotbar)
│   │   ├── CraftingSystem.js       # Verifies recipes and consumes materials
│   │   ├── ResourceManager.js      # Spawns, updates, and harvests island resources
│   │   ├── DebrisManager.js        # Spawns, drifts, and collects ocean debris
│   │   ├── ParticleSystem.js       # Visual effects system (Dust, Splash, Pickup, Build)
│   │   ├── TutorialSystem.js       # Sequential tutorial checklist manager
│   │   ├── VitalsSystem.js         # v0.2 — Health/Hunger/Thirst/Stamina drain
│   │   ├── DayNightCycle.js        # v0.4 — sun progression, sky and light colour
│   │   ├── WeatherSystem.js        # v0.4 — Clear/Cloudy/Rain/Storm state machine
│   │   ├── RainSystem.js           # v0.4 — rain particle volume around the player
│   │   ├── CombatSystem.js         # v0.5 — melee cone & ranged raycast attacks
│   │   ├── SaveSystem.js           # v1.0 — seed-based localStorage snapshots
│   │   ├── SettingsManager.js      # v1.0 — persisted, clamped user preferences
│   │   ├── AchievementSystem.js    # v1.0 — milestone predicates and unlock toasts
│   │   ├── MenuUI.js               # v1.0 — settings/achievements/credits overlays
│   │   ├── CollisionSystem.js      # Resolves actor-vs-world overlap
│   │   ├── CollisionLayers.js      # Collision layer bitmask definitions
│   │   ├── CollisionMatrix.js      # Which layer pairs interact
│   │   ├── CollisionDebug.js       # Collider wireframe visualisation
│   │   ├── ColliderFactory.js      # Builds colliders from asset metadata
│   │   ├── ResourceDatabase.js     # Data definitions for resources & weapon stats
│   │   ├── RecipeDatabase.js       # Crafting recipe definitions
│   │   └── DebrisDatabase.js       # Floating debris settings and configuration
│   │
│   ├── gameplay/world/             # Deterministic procedural world generation
│   │   ├── PRNG.js                 # Seeded pseudo-random number generator
│   │   ├── IslandGenerator.js      # Island radius, beach ring and shelf extents
│   │   ├── TerrainGenerator.js     # Heightmap synthesis
│   │   ├── BiomeGenerator.js       # Biome sector assignment
│   │   ├── EnvironmentBuilder.js   # Prop and resource-node placement rules
│   │   └── WorldGenerator.js       # Orchestrates the whole generation pass
│   │
│   ├── characters/                 # Player character model loading
│   │   ├── CharacterDefinition.js  # Character metadata
│   │   ├── CharacterLoader.js      # Async model loading
│   │   ├── CharacterRegistry.js    # Available character lookup
│   │   └── CharacterRenderer.js    # Draws the character mesh
│   │
│   ├── shaders/                    # GLSL shaders embedded in JS files
│   │   ├── BasicShader.js          # Blinn-Phong lighting + Textures shader
│   │   ├── WaterShader.js          # Vertex-displaced wave simulation shader
│   │   ├── ParticleShader.js       # Instanced billboard rendering shader
│   │   ├── UnlitShader.js          # Flat-colour shader (sprites, debug lines)
│   │   └── PostShader.js           # v1.0 — bright pass, blur and composite stages
│   │
│   ├── scenes/                     # Distinct game scene modules
│   │   ├── LoadingScene.js         # Simulated loading screen with rotating gameplay tips
│   │   ├── MainMenuScene.js        # Interactive main menu scene
│   │   └── GameScene.js            # Main active gameplay scene
│   │
│   └── main.js                     # Application entry point (Bootstrap)
│
├── scripts/                        # Node-run build helpers (not shipped)
│   ├── generate-manifest.js        # Rebuilds assets/environment/manifest.json
│   └── update-asset-colliders.js   # Batch-edits collider data in .asset.json files
│
├── index.html                      # HTML5 Canvas container & HUD overlay
├── index.css                       # Rustic survival-RPG UI styles (wood, leather, parchment)
└── README.md                       # Brief project description
```

> [!NOTE]
> Cache-busting query strings (`?v=N`) appear **only** on the two entry points in
> `index.html` (`index.css` and `src/main.js`). ES modules are keyed by URL, so a
> `?v=` on a deep import makes that module a *different* module from the same
> file imported without one — which is exactly how v0.5 ended up instantiating
> `ResourceDatabase`, `RecipeDatabase`, `WorldResource` and `BiomeGenerator`
> twice each. Keep deep imports bare.
