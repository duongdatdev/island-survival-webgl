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
│   │   ├── Camera.js               # Third-person orbital camera (Yaw, Pitch, Zoom, Follow)
│   │   ├── Light.js                # Ambient & directional light management (Day/Night)
│   │   ├── Mesh.js                 # Geometry buffers wrapper (Vertex, Index, UV, Normal)
│   │   ├── ShaderProgram.js        # Compiles and links Vertex & Fragment Shaders
│   │   └── Texture.js              # WebGL Texture initialization and properties setup
│   │
│   ├── entities/                   # Game world entities
│   │   ├── Entity.js               # Base entity class (Transform, Model Matrix)
│   │   ├── Player.js               # Player character (Movement, Terrain snap, Rotation)
│   │   ├── Terrain.js              # Procedural island heightmap grid generation
│   │   ├── Water.js                # Procedural dynamic ocean plane with waves
│   │   ├── WorldResource.js        # Gatherable resources on the island (Trees, Rocks)
│   │   ├── DriftingDebris.js       # Ocean debris (Wood, Stone, Ropes, Barrels)
│   │   └── RaftAssembly.js         # Raft construction entity at the beach site
│   │
│   ├── systems/                    # Core logic and state management systems
│   │   ├── Inventory.js            # Tracks item quantities and triggers change events
│   │   ├── CraftingSystem.js       # Verifies recipes and consumes materials
│   │   ├── ResourceManager.js      # Spawns, updates, and harvests island resources
│   │   ├── DebrisManager.js        # Spawns, drifts, and collects ocean debris
│   │   ├── ParticleSystem.js       # Visual effects system (Dust, Splash, Pickup, Build)
│   │   ├── TutorialSystem.js       # Sequential tutorial checklist manager
│   │   ├── ResourceDatabase.js     # Data definitions for resource nodes
│   │   ├── RecipeDatabase.js       # Crafting recipe definitions
│   │   └── DebrisDatabase.js       # Floating debris settings and configuration
│   │
│   ├── shaders/                    # GLSL shaders embedded in JS files
│   │   ├── BasicShader.js          # Blinn-Phong lighting + Textures shader
│   │   ├── WaterShader.js          # Vertex-displaced wave simulation shader
│   │   └── ParticleShader.js       # Instanced billboard rendering shader
│   │
│   ├── scenes/                     # Distinct game scene modules
│   │   ├── LoadingScene.js         # Simulated loading screen with rotating gameplay tips
│   │   ├── MainMenuScene.js        # Interactive main menu scene
│   │   └── GameScene.js            # Main active gameplay scene
│   │
│   └── main.js                     # Application entry point (Bootstrap)
│
├── index.html                      # HTML5 Canvas container & HUD overlay
├── index.css                       # Modern UI styles (Glassmorphism, Neon glows)
└── README.md                       # Brief project description
```
