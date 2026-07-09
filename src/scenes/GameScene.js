import { Scene } from '../core/Scene.js';
import { Camera } from '../renderer/Camera.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { Mesh } from '../renderer/Mesh.js';
import { BasicShader } from '../shaders/BasicShader.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { Player } from '../entities/Player.js';
import { CharacterRenderer } from '../characters/CharacterRenderer.js';
import { CharacterRegistry } from '../characters/CharacterRegistry.js';
import { Terrain } from '../entities/Terrain.js';
import { Water } from '../entities/Water.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { ResourceManager } from '../systems/ResourceManager.js?v=6';
import { DebrisManager } from '../systems/DebrisManager.js?v=6';
import { Inventory } from '../systems/InventoryV2.js?v=6';
import { getAllRecipes, getRecipeDef } from '../systems/RecipeDatabase.js?v=6';
import { getResourceDef } from '../systems/ResourceDatabase.js?v=6';
import { CraftingSystem } from '../systems/CraftingSystem.js?v=6';
import { RaftAssembly } from '../entities/RaftAssembly.js?v=6';
import { ParticleSystem } from '../systems/ParticleSystem.js?v=6';
import { TutorialSystem } from '../systems/TutorialSystem.js?v=6';
import { VitalsSystem } from '../systems/VitalsSystem.js?v=6';
import { Campfire } from '../entities/Campfire.js';
import { WaterCollector } from '../entities/WaterCollector.js';
import { Waterfall } from '../entities/Waterfall.js';
import { WorldGenerator } from '../gameplay/world/WorldGenerator.js?v=6';
import { EnvironmentObject } from '../entities/EnvironmentObject.js?v=6';
import { WorldResource } from '../entities/WorldResource.js?v=6';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { CollisionDebug } from '../systems/CollisionDebug.js';


/**
 * Main active gameplay scene — v0.2 with Survival Systems
 */
export class GameScene extends Scene {
    init() {
        console.log('GameScene: Initializing gameplay state...');
        const gl = this.gl;

        // 1. Shaders Initialisation
        this.basicShader = new ShaderProgram(gl, BasicShader.vertex, BasicShader.fragment);
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);

        // 2. Camera Setup
        this.camera = new Camera(45 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.1, 1000.0);

        // 3. Lighting Setup
        this.dirLight = new DirectionalLight([0, 1.0, 0], [1.0, 0.95, 0.85], 1.0);
        this.ambientLight = new AmbientLight([0.22, 0.28, 0.38], 0.4);
        this.lightTime = 0.0;

        // 4. Entities Setup
        this.player = new Player();
        
        // Procedural World Generation Setup
        this.worldSeed = this.engine.worldSeed || Math.floor(Math.random() * 1000000).toString();
        this.debugBiomeColors = false;
        this.worldGenerator = new WorldGenerator(120, 100.0);
        
        if (this.engine.generatedWorld) {
            this.world = this.engine.generatedWorld;
            this.worldSeed = this.world.seed;
        } else {
            console.log(`GameScene: Generating fallback world with seed: ${this.worldSeed}`);
            this.world = this.worldGenerator.generate(this.worldSeed, this.engine.assets.environmentMetadata, this.debugBiomeColors);
        }

        // Initialize terrain with generated data
        this.terrain = new Terrain(gl, 120, 100.0, this.world.terrain, this.world.terrainGenerator);
        this.water = new Water(gl, 100, 200.0);   // 100x100 divisions, size 200

        // Instantiate environment props (trees, bushes, rocks) from the generated world
        this.environmentEntities = [];
        for (const obj of this.world.placedObjects) {
            const mesh = this.engine.assets.models[obj.objPath];
            if (mesh) {
                const entity = new EnvironmentObject(
                    gl,
                    mesh,
                    obj.position,
                    obj.rotation,
                    obj.scale,
                    obj.collision,
                    obj.navigationBlocker,
                    obj.category || ''
                );
                this.environmentEntities.push(entity);
            }
        }

        // 5. Build Character Renderer from OBJ
        const characterDef = CharacterRegistry.get('casual_male');
        this.characterRenderer = new CharacterRenderer(characterDef);
        this.characterRenderer.load(gl, this.engine.assets);

        // 6. Resource System Initialization
        this.inventory = new Inventory(20);
        this.resourceManager = new ResourceManager();
        this.debrisManager = new DebrisManager(this.engine.assets);

        // Spawn resources from procedural generator nodes list
        this.resourceManager.worldResources = [];
        for (const node of this.world.resourceNodes) {
            const def = getResourceDef(node.id);
            if (def) {
                const terrainY = this.terrain.getHeight(node.position[0], node.position[2]);
                const y = terrainY + def.meshScale[1] * 0.5 + 0.3;

                const resource = new WorldResource(gl, def, [node.position[0], y, node.position[2]]);
                this.resourceManager.worldResources.push(resource);
            }
        }

        // Bind inventory changes to UI updates
        this.inventory.onChange = (resourceId, newCount, delta) => {
            this._updateGridInventory();
            this._renderCraftingPanel();
        };

        // 7. Particle System
        this.particleSystem = new ParticleSystem(gl);

        // 8. Tutorial System
        this.tutorial = new TutorialSystem();
        this.tutorial.init();
        this.tutorial.start();

        // 9. Unified Inventory & Crafting UI Bindings
        this.inventoryMenu = document.getElementById('inventory-menu');
        this.inventoryMenuCloseBtn = document.getElementById('inventory-menu-close');
        this.selectedCraftingCategory = 'tool';
        this.selectedRecipeId = null;
        this._notificationTimeoutId = null;

        if (this.inventoryMenuCloseBtn) {
            this.inventoryMenuCloseBtn.addEventListener('click', () => this._closeInventoryMenu());
        }

        // Bind category button clicks inside menu
        const categoryButtons = document.querySelectorAll('.cat-btn');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.selectedCraftingCategory = btn.getAttribute('data-category');
                this.selectedRecipeId = null; // Clear selection on category switch
                this._renderCraftingPanel();
                this.engine.audio.playClick();
            });
        });

        // Initialize panel render
        this._updateGridInventory();

        // 10. Vitals System (v0.2)
        this.vitals = new VitalsSystem();
        this.vitals.onChange = (vitalId, value, max) => {
            this._updateVitalBar(vitalId, value, max);
        };
        this.vitals.onGameOver = () => {
            this._showGameOver();
        };

        // Show vitals & hotbar HUD
        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.remove('hidden');
        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.remove('hidden');

        // 11. Campfire Entity (v0.2) — placed near island center
        this.campfire = new Campfire(gl, [5.0, 0.0, 5.0]);
        // Position campfire on terrain
        const campfireY = this.terrain.getHeight(5.0, 5.0);
        this.campfire.position[1] = campfireY;
        this.campfire.updateModelMatrix();

        // 12. Water Collector Entity (v0.2) — placed near beach
        this.waterCollector = new WaterCollector(gl, [-5.0, 0.0, 15.0]);
        const wcY = this.terrain.getHeight(-5.0, 15.0);
        this.waterCollector.position[1] = wcY;
        this.waterCollector.updateModelMatrix();

        // 13. Raft Assembly & Escape HUD Initializations (v0.3: procedurally placed buildArea)
        this.raftAssembly = new RaftAssembly(gl, this.world.buildArea);

        // Setup Biome Colors debug switch
        this.toggleBiomeColorsEl = document.getElementById('toggle-biome-colors');
        if (this.toggleBiomeColorsEl) {
            this.toggleBiomeColorsEl.checked = this.debugBiomeColors;
            
            // Remove any old listeners by replacing the element or adding a standard event listener
            const newListener = (e) => {
                this.debugBiomeColors = e.target.checked;
                this._regenerateWorld();
            };
            this.toggleBiomeColorsEl.addEventListener('change', newListener);
        }
        
        // Render initial world metrics in the debug HUD
        this._updateWorldDebugInfo();
        
        // 13.5 Waterfall POI (v0.3) — procedural placement from world.landmarks
        const wfPos = this.world.landmarks && this.world.landmarks.waterfall
            ? this.world.landmarks.waterfall
            : [25.0, this.terrain.getHeight(25.0, -20.5), -20.5];
        this.waterfall = new Waterfall(gl, [wfPos[0], 0.0, wfPos[2]]);
        this.waterfall.position[1] = wfPos[1];
        this.waterfall.updateModelMatrix();

        // 13.6 Blueprints & Fishing tracking (v0.3)
        this.unlockedBlueprints = new Set();
        this.isFishing = false;
        this.fishingTimer = 0.0;

        // 13.7 Spawning Treasure Chests (v0.3) — procedural per-quadrant placement
        const chestSpots = this.world.landmarks && this.world.landmarks.treasureChests
            ? this.world.landmarks.treasureChests
            : [];
        for (const spot of chestSpots) {
            this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
        }

        this.escapeHud = document.getElementById('escape-hud');
        this.escapeBtn = document.getElementById('escape-btn');
        this.victoryScreen = document.getElementById('victory-screen');
        this.restartBtn = document.getElementById('restart-btn');
        this.statTimeEl = document.getElementById('stat-time');
        this.gameoverScreen = document.getElementById('gameover-screen');
        this.gameoverRestartBtn = document.getElementById('gameover-restart-btn');
        this.gameoverTimeEl = document.getElementById('gameover-time');

        if (this.escapeBtn) {
            this.escapeBtn.addEventListener('click', () => this._startEscapeCutscene());
        }
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }
        if (this.gameoverRestartBtn) {
            this.gameoverRestartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        this.isEscaping = false;
        this.escapeTime = 0.0;
        this.survivalSeconds = 0.0;
        this._isGameOver = false;

        // 14. Pause state
        this.isPaused = false;
        this._pauseResumeBtn = document.getElementById('pause-resume-btn');
        this._pauseSoundBtn = document.getElementById('pause-sound-btn');
        this._pauseMenuBtn = document.getElementById('pause-menu-btn');

        this._onPauseResume = () => {
            this.engine.audio.playClick();
            this._resumeGame();
        };
        this._onPauseSound = () => {
            this.engine.audio._ensureContext();
            const muted = this.engine.audio.toggleMute();
            this._updatePauseSoundButton(muted);
            if (!muted) this.engine.audio.playClick();
        };
        this._onPauseMenu = () => {
            this.engine.audio.playClick();
            this._resumeGame();
            // Small delay for transition
            setTimeout(() => {
                this.engine.scenes.switchScene('MainMenu');
            }, 100);
        };

        if (this._pauseResumeBtn) this._pauseResumeBtn.addEventListener('click', this._onPauseResume);
        if (this._pauseSoundBtn) this._pauseSoundBtn.addEventListener('click', this._onPauseSound);
        if (this._pauseMenuBtn) this._pauseMenuBtn.addEventListener('click', this._onPauseMenu);

        // 15. Running properties
        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        // Footstep timer
        this._footstepTimer = 0;
        this._footstepInterval = 0.35; // Seconds between footstep sounds

        // 16. Collision System
        this.collisionSystem = new CollisionSystem();
        this.collisionDebug = new CollisionDebug(gl);

        this.collisionSystem.register(this.player);
        for (const entity of this.environmentEntities) {
            this.collisionSystem.register(entity);
        }

        // 17. Debug Collision toggle
        const debugCollisionEl = document.getElementById('toggle-collision-debug');
        if (debugCollisionEl) {
            debugCollisionEl.addEventListener('change', (e) => {
                this.collisionSystem.setDebugMode(e.target.checked);
                this.collisionDebug.setEnabled(e.target.checked);
            });
        }

        // Configure depth states
        gl.clearColor(0.53, 0.74, 0.90, 1.0); // Nice sky blue clear color

        // Show HUD
        const hud = document.getElementById('resource-hud');
        if (hud) hud.style.display = '';

        // Start ambient audio
        this.engine.audio._ensureContext();
        this.engine.audio.resume();
        this.engine.audio.startAmbientWaves();
    }

    update(deltaTime) {
        // Handle ESC for pause toggle
        if (this.engine.input.isKeyPressed('Escape')) {
            if (this.isPaused) {
                this._resumeGame();
            } else {
                this._pauseGame();
            }
            return;
        }

        // If paused or game over, don't update game logic
        if (this.isPaused || this._isGameOver) return;

        this.time += deltaTime;

        // Escape cutscene update loop
        if (this.isEscaping) {
            this.escapeTime += deltaTime;

            // Sail the raft forward (v0.3: dynamic speed based on raft upgrades)
            let sailSpeed = 1.0 + this.escapeTime * 0.8;
            if (this.raftAssembly.motorPlaced) {
                sailSpeed = 8.0 + this.escapeTime * 3.0;
            } else if (this.raftAssembly.sailPlaced) {
                sailSpeed = 3.5 + this.escapeTime * 1.5;
            }

            this.raftAssembly.position[2] += sailSpeed * deltaTime;
            this.raftAssembly.position[1] = Math.sin(this.time * 2.5) * 0.08;
            this.raftAssembly.updateModelMatrix();

            // Pin player character to raft frame
            this.player.position[0] = this.raftAssembly.position[0];
            this.player.position[1] = this.raftAssembly.position[1] + (0.20 * 0.45) + 0.9 * this.player.scaleFactor;
            this.player.position[2] = this.raftAssembly.position[2];
            this.player.rotation[1] = 0.0;
            this.player.updateModelMatrix();

            // Cinematic camera track
            this.camera.target[0] = this.player.position[0];
            this.camera.target[1] = this.player.position[1];
            this.camera.target[2] = this.player.position[2];

            // 3/4 high side view camera panning
            this.camera.position[0] = -7.0 - this.escapeTime * 0.3;
            this.camera.position[1] = 4.0 + this.escapeTime * 0.15;
            this.camera.position[2] = this.raftAssembly.position[2] - 8.0 - this.escapeTime * 0.2;

            const up = [0, 1.0, 0];
            Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

            // Water splash particles during escape
            if (Math.random() < 0.3) {
                const splashPos = [
                    this.raftAssembly.position[0] + (Math.random() - 0.5) * 1.5,
                    0.2,
                    this.raftAssembly.position[2] - 1.0
                ];
                this.particleSystem.emit(splashPos, ParticleSystem.PRESET.SPLASH);
            }

            // Engine exhaust particles during escape (v0.3)
            if (this.raftAssembly.motorPlaced && Math.random() < 0.4) {
                const enginePos = [
                    this.raftAssembly.position[0] + (Math.random() - 0.5) * 0.3,
                    0.3,
                    this.raftAssembly.position[2] - 1.6
                ];
                this.particleSystem.emit(enginePos, {
                    count: 3,
                    color: [0.3, 0.3, 0.3],
                    colorVariance: 0.05,
                    size: 6,
                    sizeVariance: 2,
                    speed: 1.5,
                    speedVariance: 0.5,
                    lifetime: 0.8,
                    lifetimeVariance: 0.3,
                    gravity: 0.8, // Float upwards
                    spread: 0.3,
                    yBias: 1.0,
                });
            }

            // Update particles during cutscene
            this.particleSystem.update(deltaTime);

            // Handle victory overlay trigger
            if (this.escapeTime >= 6.0) {
                if (this.victoryScreen && this.victoryScreen.classList.contains('hidden')) {
                    this.victoryScreen.classList.remove('hidden');
                    
                    const mins = Math.floor(this.survivalSeconds / 60).toString().padStart(2, '0');
                    const secs = Math.floor(this.survivalSeconds % 60).toString().padStart(2, '0');
                    if (this.statTimeEl) {
                        this.statTimeEl.textContent = `${mins}:${secs}`;
                    }

                    // Update custom victory description (v0.3)
                    const subtitleEl = this.victoryScreen.querySelector('.victory-subtitle');
                    if (subtitleEl) {
                        if (this.raftAssembly.motorPlaced) {
                            subtitleEl.innerHTML = "⚡ <b>CHIẾN THẮNG TUYỆT ĐỐI!</b> Bạn đã lắp động cơ phản lực cực mạnh, phóng rẽ sóng vượt đại dương và trở về đất liền trong sự ngỡ ngàng của mọi người!";
                        } else if (this.raftAssembly.sailPlaced) {
                            subtitleEl.innerHTML = "⛵ <b>CHIẾN THẮNG VẺ VANG!</b> Nhờ cánh buồm đón gió lộng căng tràn, bè lướt êm ru vượt nghìn trùng khơi đưa bạn về đất liền an toàn.";
                        } else {
                            subtitleEl.innerHTML = "🛶 <b>BÈ GỖ THÔ SƠ!</b> Bè gỗ ọp ẹp cùng mái chèo thô mộc đưa bạn đi chậm chạp. Hành trình đầy gian nan thử thách nhưng cuối cùng bạn đã thoát hiểm thành công!";
                        }
                    }

                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    }

                    // Play victory fanfare
                    this.engine.audio.playVictory();
                }
            }
            return;
        }

        // Increment survived time
        this.survivalSeconds += deltaTime;

        // Rescale aspect ratio if canvas resized
        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);

        // ---- Fishing Channel Update (v0.3) ----
        if (this.isFishing) {
            this.fishingTimer -= deltaTime;
            
            // Show prompt with countdown
            const hintEl = document.getElementById('pickup-hint');
            if (hintEl) {
                hintEl.innerHTML = `🎣 Đang câu cá... (còn ${Math.max(1, Math.ceil(this.fishingTimer))} giây)`;
                hintEl.classList.remove('hidden');
                hintEl.dataset.hintOwner = 'fishing';
            }

            // Periodically emit water splash particles in player's forward direction
            if (Math.random() < 0.25) {
                const angle = this.player.rotation[1];
                const splashPos = [
                    this.player.position[0] + Math.sin(angle) * 3.0,
                    0.15,
                    this.player.position[2] + Math.cos(angle) * 3.0
                ];
                this.particleSystem.emit(splashPos, ParticleSystem.PRESET.SPLASH);
            }

            if (this.fishingTimer <= 0.0) {
                this.isFishing = false;
                this.inventory.addItem('raw_fish', 1);
                this._showNotification('🐟 Bạn đã câu được: Cá Sống!');
                this.engine.audio.playPickup();
                
                const angle = this.player.rotation[1];
                this.particleSystem.emit(
                    [this.player.position[0] + Math.sin(angle) * 3.0, 0.3, this.player.position[2] + Math.cos(angle) * 3.0],
                    ParticleSystem.PRESET.PICKUP
                );
            }
        }

        // Update Vitals System (v0.2)
        const isPlayerMoving = this.player.currentSpeed > 0.1;
        this.vitals.update(deltaTime, isPlayerMoving);

        // Apply stamina speed modifier to player
        this.player.speed = this.isFishing ? 0.0 : 5.0 * this.vitals.getSpeedMultiplier();

        const prevPlayerPos = [this.player.position[0], this.player.position[1], this.player.position[2]];

        // Update player movements using keyboards and camera reference
        const movementInput = this.isFishing 
            ? { isKeyDown: () => false, isKeyPressed: () => false, keys: {} } 
            : this.engine.input;
        this.player.update(deltaTime, movementInput, this.camera, this.terrain);

        // Collision resolution via CollisionSystem (data-driven, layer-filtered)
        if (this.collisionSystem) {
            this.collisionSystem.resolvePlayerCollisions(this.player, this.terrain);
        }

        // Footstep sounds while moving
        if (this.player.currentSpeed > 0.1) {
            this._footstepTimer += deltaTime;
            if (this._footstepTimer >= this._footstepInterval) {
                this._footstepTimer = 0;
                this.engine.audio.playFootstep();

                // Dust particles at player feet
                const dustPos = [
                    this.player.position[0],
                    this.player.position[1] - this.player.collider.height * 0.5 + 0.1,
                    this.player.position[2]
                ];
                this.particleSystem.emit(dustPos, ParticleSystem.PRESET.DUST);
            }
        } else {
            this._footstepTimer = this._footstepInterval * 0.8; // Quick first step on resume
        }

        // Toggle Inventory & Crafting Menu via 'C' or 'Tab' key
        if (this.engine.input.isKeyPressed('KeyC') || this.engine.input.isKeyPressed('Tab')) {
            this._toggleInventoryMenu();
        }

        // Consume or place item via 'Q' key
        if (this.engine.input.isKeyPressed('KeyQ')) {
            this._useActiveItem();
        }

        // Hotbar selection keys 1 to 8
        for (let i = 0; i < 8; i++) {
            if (this.engine.input.isKeyPressed('Digit' + (i + 1))) {
                this.inventory.selectedHotbarIndex = i;
                this.engine.audio.playClick();
                this._updateGridInventory();
            }
        }

        // Mouse scroll hotbar selection (only when menu is closed)
        const isMenuOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        if (!isMenuOpen) {
            const scroll = this.engine.input.mouse.wheelDelta;
            const isShiftDown = this.engine.input.isKeyDown('ShiftLeft') || this.engine.input.isKeyDown('ShiftRight');
            if (scroll !== 0 && !isShiftDown) {
                let nextIndex = this.inventory.selectedHotbarIndex + scroll;
                if (nextIndex < 0) nextIndex = 7;
                else if (nextIndex > 7) nextIndex = 0;
                
                this.inventory.selectedHotbarIndex = nextIndex;
                this._updateGridInventory();
                this.engine.input.mouse.wheelDelta = 0; // Consume the scroll delta
            }
        }

        // Developer Debug Cheat: Press 'K' to teleport to beach & get all raft modules (v0.3: upgraded)
        if (this.engine.input.isKeyPressed('KeyK')) {
            // Teleport close to raft building site (Z = 38.5)
            this.player.position[0] = 0.0;
            this.player.position[1] = this.player.collider.height * 0.5;
            this.player.position[2] = 38.5;
            this.player.updateModelMatrix();

            // Add required items & upgrades
            this.inventory.addItem('raft_frame', 1);
            this.inventory.addItem('barrel_floats', 1);
            this.inventory.addItem('paddle', 1);
            this.inventory.addItem('raft_sail', 1);
            this.inventory.addItem('raft_motor', 1);
            this.inventory.addItem('fishing_rod', 1);

            // Unlock blueprints
            this.unlockedBlueprints.add('fishing_rod_blueprint');
            this.unlockedBlueprints.add('sail_raft_blueprint');
            this.unlockedBlueprints.add('motor_raft_blueprint');

            this._showNotification('🛠️ CHEAT: Teleported to beach, items added & blueprints unlocked!');
        }


        // Snap camera tracking around player
        this.camera.update(this.engine.input, this.player.position, 1.2 * this.player.scaleFactor);

        // ---- Campfire proximity (v0.2) ----
        let showCampfirePrompt = false;
        let campfirePromptText = '';
        if (this.campfire.isPlayerNear(this.player.position)) {
            const hasRawFood = this.inventory.hasItem('coconut') || this.inventory.hasItem('raw_fish');
            if (hasRawFood) {
                campfirePromptText = '<span class="hint-key">E</span> Nấu thức ăn 🔥';
                showCampfirePrompt = true;
            }
        }

        // Handle campfire cooking via 'E' key
        if (showCampfirePrompt && this.engine.input.isKeyPressed('KeyE')) {
            this.engine.input.keys['KeyE'] = false;
            // Cook raw fish first, then coconut
            if (this.inventory.hasItem('raw_fish')) {
                this.inventory.removeItem('raw_fish', 1);
                this.inventory.addItem('cooked_meal', 1);
                this._showNotification('🔥 Đã nấu: 🍖 Thức Ăn Chín!');
                this.engine.audio.playCraft();
                this.particleSystem.emit(
                    [this.campfire.position[0], this.campfire.position[1] + 0.5, this.campfire.position[2]],
                    ParticleSystem.PRESET.CRAFT
                );
            } else if (this.inventory.hasItem('coconut')) {
                this.inventory.removeItem('coconut', 1);
                this.inventory.addItem('cooked_meal', 1);
                this._showNotification('🔥 Đã nấu: 🍖 Thức Ăn Chín!');
                this.engine.audio.playCraft();
                this.particleSystem.emit(
                    [this.campfire.position[0], this.campfire.position[1] + 0.5, this.campfire.position[2]],
                    ParticleSystem.PRESET.CRAFT
                );
            }
        }

        // ---- Water Collector proximity (v0.2) ----
        let showWaterPrompt = false;
        let waterPromptText = '';
        if (this.waterCollector.isPlayerNear(this.player.position)) {
            if (this.waterCollector.waterStored > 0) {
                waterPromptText = `<span class="hint-key">E</span> Lấy nước (${this.waterCollector.waterStored}/${this.waterCollector.maxWater}) 💧`;
                showWaterPrompt = true;
            } else {
                waterPromptText = 'Bẫy nước đang hứng... (0/' + this.waterCollector.maxWater + ') 💧';
                showWaterPrompt = true;
            }
        }

        // Handle water collection via 'E' key
        if (showWaterPrompt && this.waterCollector.waterStored > 0 && this.engine.input.isKeyPressed('KeyE')) {
            this.engine.input.keys['KeyE'] = false;
            if (this.waterCollector.collectWater()) {
                this.inventory.addItem('fresh_water', 1);
                this._showNotification('💧 Đã lấy: Nước Ngọt!');
                this.engine.audio.playPickup();
            }
        }

        // Proximity detection for raft assembly (v0.3: support sequential sail and motor upgrades)
        let showRaftPrompt = false;
        let raftPromptText = '';
        let hasModule = false;
        let targetModule = '';

        const distToRaft = this.raftAssembly.distanceTo(this.player.position);
        if (distToRaft < 3.0) {
            if (!this.raftAssembly.framePlaced) {
                targetModule = 'raft_frame';
                hasModule = this.inventory.hasItem('raft_frame');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Khung Bè 🧱' : 'Cần chế tạo Khung Bè 🧱 để lắp ráp';
                showRaftPrompt = true;
            } else if (!this.raftAssembly.floatsPlaced) {
                targetModule = 'barrel_floats';
                hasModule = this.inventory.hasItem('barrel_floats');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Phao Thùng 🛢️' : 'Cần chế tạo Phao Thùng 🛢️ để lắp ráp';
                showRaftPrompt = true;
            } else if (!this.raftAssembly.paddlePlaced) {
                targetModule = 'paddle';
                hasModule = this.inventory.hasItem('paddle');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Mái Chèo 🛶' : 'Cần chế tạo Mái Chèo 🛶 để lắp ráp';
                showRaftPrompt = true;
            } else if (!this.raftAssembly.sailPlaced) {
                targetModule = 'raft_sail';
                hasModule = this.inventory.hasItem('raft_sail');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Nâng Cấp: Lắp Cánh Buồm ⛵' : 'Chế tạo Cánh Buồm ⛵ giúp di chuyển nhanh hơn';
                showRaftPrompt = true;
            } else if (!this.raftAssembly.motorPlaced) {
                targetModule = 'raft_motor';
                hasModule = this.inventory.hasItem('raft_motor');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Nâng Cấp: Lắp Động Cơ Bè 🚀' : 'Chế tạo Động Cơ Bè 🚀 để đạt tốc độ tối đa!';
                showRaftPrompt = true;
            }
        }

        // Intercept KeyE to place modules on the raft assembly
        if (showRaftPrompt && hasModule && this.engine.input.isKeyPressed('KeyE')) {
            this.engine.input.keys['KeyE'] = false; // consume key
            
            if (targetModule === 'raft_frame') {
                this.inventory.removeItem('raft_frame', 1);
                this.raftAssembly.framePlaced = true;
                this._showNotification('🧱 Lắp Khung Bè thành công!');
            } else if (targetModule === 'barrel_floats') {
                this.inventory.removeItem('barrel_floats', 1);
                this.raftAssembly.floatsPlaced = true;
                this._showNotification('🛢️ Lắp Phao Thùng thành công!');
            } else if (targetModule === 'paddle') {
                this.inventory.removeItem('paddle', 1);
                this.raftAssembly.paddlePlaced = true;
                this._showNotification('🛶 Lắp Mái Chèo thành công!');
            } else if (targetModule === 'raft_sail') {
                this.inventory.removeItem('raft_sail', 1);
                this.raftAssembly.sailPlaced = true;
                this._showNotification('⛵ Lắp Cánh Buồm thành công! Bè lướt gió nhanh hơn.');
            } else if (targetModule === 'raft_motor') {
                this.inventory.removeItem('raft_motor', 1);
                this.raftAssembly.motorPlaced = true;
                this._showNotification('🚀 Lắp Động Cơ thành công! Đạt công suất phản lực.');
            }

            // Sound + particle effects for raft building
            this.engine.audio.playRaftBuild();
            this.particleSystem.emit(
                [this.raftAssembly.position[0], this.raftAssembly.position[1] + 0.5 * 0.45, this.raftAssembly.position[2]],
                ParticleSystem.PRESET.BUILD
            );
        }

        // ---- v0.3: Waterfall Interaction Check ----
        let showWaterfallPrompt = false;
        if (this.waterfall && this.waterfall.isPlayerInPond(this.player.position)) {
            showWaterfallPrompt = true;
            if (this.engine.input.isKeyPressed('KeyE')) {
                this.engine.input.keys['KeyE'] = false; // Consume key
                this.vitals.drink(100); // Fully restore thirst
                this._showNotification('💧 Đã uống nước thác! Khôi phục hết Thối Khát.');
                this.engine.audio.playPickup();
                
                this.particleSystem.emit(
                    [this.player.position[0], this.player.position[1] - 0.5 * this.player.scaleFactor, this.player.position[2]],
                    ParticleSystem.PRESET.SPLASH
                );
            }
        }

        // ---- v0.3: Coastline Fishing Check ----
        let showFishingPrompt = false;
        const playerTerrainHeight = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
        const hotbarItem = this.inventory.slots[hotbarIdx];
        const hasFishingRod = hotbarItem && hotbarItem.id === 'fishing_rod';

        if (playerTerrainHeight <= 0.15 && hasFishingRod && !this.isFishing) {
            showFishingPrompt = true;
            if (this.engine.input.isKeyPressed('KeyE')) {
                this.engine.input.keys['KeyE'] = false; // Consume key
                this.isFishing = true;
                this.fishingTimer = 4.0; // 4 seconds channel
                this.engine.audio.playRaftBuild();
            }
        }

        // ---- v0.3: Treasure Chest Interaction Check ----
        let showChestPrompt = false;
        if (this.resourceManager.nearestPickable && this.resourceManager.nearestPickable.resourceId === 'treasure_chest') {
            showChestPrompt = true;
            if (this.engine.input.isKeyPressed('KeyE')) {
                this.engine.input.keys['KeyE'] = false; // Consume key
                this._openTreasureChest(this.resourceManager.nearestPickable);
            }
        }

        // Update resource system (animations, pickup detection)
        const prevPickupCount = this._getTotalInventoryCount();
        this.resourceManager.update(deltaTime, this.player.position, this.inventory, this.engine.input);
        
        // Check if a pickup happened (for sound + particles)
        if (this._getTotalInventoryCount() > prevPickupCount) {
            this.engine.audio.playPickup();
            this.particleSystem.emit(this.player.position, ParticleSystem.PRESET.PICKUP);
            this.tutorial.notifyPickup();
        }

        // Update drifting debris system (skip pickup if resource pickup is available)
        const prevDebrisCount = this._getTotalInventoryCount();
        this.debrisManager.update(deltaTime, this.player.position, this.inventory, this.engine.input, this.terrain, this.gl, this.resourceManager.nearestPickable);

        // Check if debris pickup happened
        if (this._getTotalInventoryCount() > prevDebrisCount) {
            this.engine.audio.playPickup();
            this.particleSystem.emit(this.player.position, ParticleSystem.PRESET.PICKUP);
            this.tutorial.notifyPickup();
        }

        // Override pickup hint text — priority: waterfall > fishing > chest > campfire > water collector > raft > default
        const hintEl = document.getElementById('pickup-hint');
        if (showWaterfallPrompt && hintEl) {
            hintEl.innerHTML = `<span class="hint-key">E</span> Uống nước thác ngọt mát 💧`;
            hintEl.classList.remove('hidden');
        } else if (showFishingPrompt && hintEl) {
            hintEl.innerHTML = `<span class="hint-key">E</span> Thả cần câu cá 🎣`;
            hintEl.classList.remove('hidden');
        } else if (showChestPrompt && hintEl) {
            hintEl.innerHTML = `<span class="hint-key">E</span> Mở Rương Kho Báu 📦`;
            hintEl.classList.remove('hidden');
        } else if (showCampfirePrompt && hintEl) {
            hintEl.innerHTML = campfirePromptText;
            hintEl.classList.remove('hidden');
        } else if (showWaterPrompt && hintEl) {
            hintEl.innerHTML = waterPromptText;
            hintEl.classList.remove('hidden');
        } else if (showRaftPrompt && hintEl) {
            hintEl.innerHTML = raftPromptText;
            hintEl.classList.remove('hidden');
        }

        // Display Escape HUD if raft is completed
        if (this.raftAssembly.isComplete() && !this.isEscaping) {
            if (distToRaft < 4.0) {
                if (this.escapeHud && this.escapeHud.classList.contains('hidden')) {
                    this.escapeHud.classList.remove('hidden');
                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    }
                }
            } else {
                if (this.escapeHud && !this.escapeHud.classList.contains('hidden')) {
                    this.escapeHud.classList.add('hidden');
                }
            }
        }

        // Update raft assembly animations
        if (this.raftAssembly) {
            this.raftAssembly.update(deltaTime);
        }

        // Update Campfire + WaterCollector animations (v0.2)
        this.campfire.update(deltaTime);
        this.waterCollector.update(deltaTime);

        // Update particle system
        this.particleSystem.update(deltaTime);

        // Update Waterfall POI (v0.3)
        if (this.waterfall) {
            this.waterfall.update(deltaTime, this.particleSystem);
        }

        // Update tutorial
        this.tutorial.update(deltaTime, this.engine.input, this.player);

        // Manage light rotation from Debug UI checkbox
        const rotLightEl = document.getElementById('toggle-light-rot');
        const rotateLight = rotLightEl ? rotLightEl.checked : true;
        if (rotateLight) {
            this.lightTime += deltaTime * 0.15;
            const lx = Math.cos(this.lightTime) * 0.6;
            const lz = Math.sin(this.lightTime) * 0.6;
            this.dirLight.setDirection(lx, 1.0, lz);
        }

        // Push light direction to Debug panel
        const lightDirEl = document.getElementById('debug-light-dir');
        if (lightDirEl) {
            const dir = this.dirLight.direction;
            lightDirEl.textContent = `X: ${dir[0].toFixed(2)}, Y: ${dir[1].toFixed(2)}, Z: ${dir[2].toFixed(2)}`;
        }
    }

    render() {
        const gl = this.gl;

        // Fetch display controls from DOM checkboxes
        const wireframeEl = document.getElementById('toggle-wireframe');
        const drawWireframe = wireframeEl ? wireframeEl.checked : false;
        const drawMode = drawWireframe ? gl.LINES : gl.TRIANGLES;

        const waterAnimEl = document.getElementById('toggle-water');
        const animateWater = waterAnimEl ? waterAnimEl.checked : true;

        // Clear Color and Depth Buffers
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // --- DRAW TERRAIN & PLAYER & RESOURCES (Solid Geometry, BasicShader) ---
        this.basicShader.use();
        
        // Load Camera matrices
        this.basicShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.basicShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.basicShader.setUniform3fv('uViewPosition', this.camera.position);

        // Load Lighting uniforms
        this.basicShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.basicShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.basicShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.basicShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.basicShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);

        // 1. Draw Terrain
        this.terrain.draw(this.basicShader);

        Mat4.identity(this.tempMatrix);
        const playerRenderPos = [this.player.position[0], this.player.position[1] - this.player.collider.height * 0.5, this.player.position[2]];
        Mat4.translate(this.tempMatrix, this.tempMatrix, playerRenderPos);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, this.player.rotation[1]);
        this.characterRenderer.draw(this.basicShader, this.tempMatrix, drawMode);

        // 5. Draw World Resources
        this.resourceManager.drawAll(this.basicShader, drawMode);

        // 6. Draw Drifting Debris (on water surface, before water pass)
        this.debrisManager.drawAll(this.basicShader, drawMode);

        // 7. Draw solid components of the Raft Assembly
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, false);
        }

        // Draw environment objects (trees, bushes, rocks)
        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                entity.draw(this.basicShader, drawMode);
            }
        }

        // 8. Draw Campfire (v0.2)
        this.campfire.draw(this.basicShader, drawMode);

        // 9. Draw Water Collector (v0.2)
        this.waterCollector.draw(this.basicShader, drawMode);

        // --- DRAW WATER (Translucent Geometry, WaterShader) ---
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Draw ghost/hologram parts of Raft Assembly (translucent pass)
        this.basicShader.use();
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, true);
        }

        // Draw Waterfall POI with translucency (v0.3)
        if (this.waterfall) {
            this.waterfall.draw(this.basicShader, drawMode);
        }
        
        // Disable backface culling to draw wave interiors correctly
        gl.disable(gl.CULL_FACE);

        this.waterShader.use();

        // Load Camera matrices
        this.waterShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.waterShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.waterShader.setUniform3fv('uViewPosition', this.camera.position);

        // Load Lighting uniforms
        this.waterShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.waterShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.waterShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.waterShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.waterShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);

        // Load Time & Animation Control Uniforms
        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', animateWater ? 1.0 : 0.0);

        // Draw Water Grid
        this.water.draw(this.waterShader);

        // Restore default WebGL drawing state
        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);

        // 10. Draw Particles (additive blending, on top)
        this.particleSystem.draw(this.camera);

        // 11. Collision Debug Overlay
        if (this.collisionDebug && this.collisionDebug.isEnabled()) {
            const colliders = this.collisionSystem.getColliders();
            this.collisionDebug.draw(
                this.basicShader,
                this.camera.viewMatrix,
                this.camera.projectionMatrix,
                colliders
            );
        }
    }

    // ============================================
    //  PAUSE SYSTEM
    // ============================================

    _pauseGame() {
        if (this.isPaused || this.isEscaping) return;
        this.isPaused = true;

        // Show pause menu
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.remove('hidden');

        // Update sound button state
        this._updatePauseSoundButton(this.engine.audio.isMuted);

        // Exit pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        this.engine.audio.playClick();
    }

    _resumeGame() {
        if (!this.isPaused) return;
        this.isPaused = false;

        // Hide pause menu
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');
    }

    _updatePauseSoundButton(isMuted) {
        if (this._pauseSoundBtn) {
            this._pauseSoundBtn.innerHTML = isMuted
                ? '<span class="btn-icon">🔇</span><span class="btn-text">ÂM THANH: TẮT</span>'
                : '<span class="btn-icon">🔊</span><span class="btn-text">ÂM THANH: BẬT</span>';
        }
    }

    // ============================================
    //  UI HELPERS
    // ============================================

    /**
     * Get total count of all items in inventory (for detecting pickups)
     */
    _getTotalInventoryCount() {
        let total = 0;
        const all = this.inventory.getAll();
        for (const key in all) {
            total += all[key];
        }
        return total;
    }

    /**
     * Update the Grid Inventory & Hotbar HUD (replaces old resource slots)
     */
    _updateGridInventory() {
        const gridEl = document.getElementById('inventory-grid');
        const hotbarEl = document.getElementById('hotbar-hud');
        const counterEl = document.getElementById('slot-counter');

        if (counterEl) {
            counterEl.textContent = `${this.inventory.getUsedSlots()}/${this.inventory.maxSlots}`;
        }

        // Render Main Inventory Grid (slots 0 to 19)
        if (gridEl) {
            let html = '';
            for (let i = 0; i < 20; i++) {
                const slot = this.inventory.slots[i];
                if (slot) {
                    const resDef = getResourceDef(slot.id);
                    const icon = resDef ? resDef.icon : '📦';
                    const name = resDef ? resDef.name : slot.id;
                    const isConsumable = resDef && resDef.consumable;
                    const consumableClass = isConsumable ? ' consumable' : '';

                    html += `
                        <div class="inv-slot${consumableClass}" data-index="${i}" draggable="true" title="${name}">
                            <span class="slot-icon">${icon}</span>
                            <span class="slot-count">${slot.count}</span>
                            <div class="slot-tooltip">${name}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="inv-slot empty" data-index="${i}">
                            <span class="slot-icon">·</span>
                        </div>
                    `;
                }
            }
            gridEl.innerHTML = html;
        }

        // Render Hotbar HUD (slots 20 to 27)
        if (hotbarEl) {
            let html = '';
            for (let i = 0; i < 8; i++) {
                const slotIndex = 20 + i;
                const slot = this.inventory.slots[slotIndex];
                const isActive = (i === this.inventory.selectedHotbarIndex) ? ' active' : '';
                
                if (slot) {
                    const resDef = getResourceDef(slot.id);
                    const icon = resDef ? resDef.icon : '📦';
                    const name = resDef ? resDef.name : slot.id;
                    const isConsumable = resDef && resDef.consumable;
                    const consumableClass = isConsumable ? ' consumable' : '';

                    html += `
                        <div class="hotbar-slot${isActive}${consumableClass}" data-index="${slotIndex}" draggable="true" title="${name}">
                            <span class="hotbar-key">${i + 1}</span>
                            <span class="slot-icon">${icon}</span>
                            <span class="slot-count">${slot.count}</span>
                            <div class="slot-tooltip">${name}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="hotbar-slot empty${isActive}" data-index="${slotIndex}">
                            <span class="hotbar-key">${i + 1}</span>
                            <span class="slot-icon">·</span>
                        </div>
                    `;
                }
            }
            hotbarEl.innerHTML = html;
        }

        // Re-bind drag & drop and click events
        this._bindDragAndDropEvents();
        this._bindRightClickEvents();
    }

    _bindDragAndDropEvents() {
        const slots = document.querySelectorAll('.inv-slot, .hotbar-slot');
        let dragSourceIndex = null;

        slots.forEach(slot => {
            slot.addEventListener('dragstart', (e) => {
                const indexAttr = slot.getAttribute('data-index');
                if (indexAttr === null) return;
                
                dragSourceIndex = parseInt(indexAttr);
                e.dataTransfer.setData('text/plain', dragSourceIndex);
                slot.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            slot.addEventListener('dragend', () => {
                slot.classList.remove('dragging');
                const trashEl = document.getElementById('trash-slot');
                if (trashEl) trashEl.classList.remove('drag-over');
            });

            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                return false;
            });

            slot.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (!slot.classList.contains('dragging')) {
                    slot.classList.add('drag-over');
                }
            });

            slot.addEventListener('dragleave', () => {
                slot.classList.remove('drag-over');
            });

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                
                const srcIdxStr = e.dataTransfer.getData('text/plain');
                if (!srcIdxStr) return;
                
                const srcIdx = parseInt(srcIdxStr);
                const destIdx = parseInt(slot.getAttribute('data-index'));
                
                if (srcIdx !== destIdx) {
                    this.inventory.moveOrMerge(srcIdx, destIdx);
                    this.engine.audio.playClick();
                }
            });
        });

        // Trash Slot
        const trashEl = document.getElementById('trash-slot');
        if (trashEl) {
            trashEl.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            trashEl.addEventListener('dragenter', () => {
                trashEl.classList.add('drag-over');
            });

            trashEl.addEventListener('dragleave', () => {
                trashEl.classList.remove('drag-over');
            });

            trashEl.addEventListener('drop', (e) => {
                e.preventDefault();
                trashEl.classList.remove('drag-over');
                
                const srcIdxStr = e.dataTransfer.getData('text/plain');
                if (!srcIdxStr) return;
                
                const srcIdx = parseInt(srcIdxStr);
                const item = this.inventory.slots[srcIdx];
                if (item) {
                    const def = getResourceDef(item.id);
                    const name = def ? def.name : item.id;
                    this.inventory.slots[srcIdx] = null;
                    this.inventory.onChange();
                    this._showNotification(`🗑️ Đã vứt bỏ: ${item.count}x ${name}`);
                    this.engine.audio.playClick();
                }
            });
        }
    }

    _bindRightClickEvents() {
        const slots = document.querySelectorAll('.inv-slot, .hotbar-slot');
        slots.forEach(slot => {
            // Right-click to consume/place
            slot.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const indexAttr = slot.getAttribute('data-index');
                if (indexAttr === null) return;
                
                const idx = parseInt(indexAttr);
                const item = this.inventory.slots[idx];
                if (!item) return;

                const resDef = getResourceDef(item.id);
                if (resDef && resDef.consumable) {
                    if (item.id === 'cooked_meal') {
                        this.inventory.removeItemAt(idx, 1);
                        this.vitals.eat(40);
                        this._showNotification('🍖 Đã ăn Thức Ăn Chín! Hunger +40');
                        this.engine.audio.playPickup();
                    } else if (item.id === 'fresh_water') {
                        this.inventory.removeItemAt(idx, 1);
                        this.vitals.drink(50);
                        this._showNotification('💧 Đã uống Nước Ngọt! Thirst +50');
                        this.engine.audio.playPickup();
                    } else if (item.id === 'campfire' || item.id === 'water_collector') {
                        // Place structures
                        const hotbarOffset = idx - 20;
                        if (hotbarOffset >= 0 && hotbarOffset < 8) {
                            this.inventory.selectedHotbarIndex = hotbarOffset;
                        }
                        this._closeInventoryMenu();
                        this._showNotification(`🔧 Đã chọn ${resDef.name}. Nhấn Q để đặt!`);
                    }
                }
            });

            // Double click to consume
            slot.addEventListener('dblclick', () => {
                const indexAttr = slot.getAttribute('data-index');
                if (indexAttr === null) return;
                
                const idx = parseInt(indexAttr);
                const item = this.inventory.slots[idx];
                if (!item) return;

                const resDef = getResourceDef(item.id);
                if (resDef && resDef.consumable && (item.id === 'cooked_meal' || item.id === 'fresh_water')) {
                    if (item.id === 'cooked_meal') {
                        this.inventory.removeItemAt(idx, 1);
                        this.vitals.eat(40);
                        this._showNotification('🍖 Đã ăn Thức Ăn Chín! Hunger +40');
                        this.engine.audio.playPickup();
                    } else if (item.id === 'fresh_water') {
                        this.inventory.removeItemAt(idx, 1);
                        this.vitals.drink(50);
                        this._showNotification('💧 Đã uống Nước Ngọt! Thirst +50');
                        this.engine.audio.playPickup();
                    }
                }
            });
        });
    }

    /**
     * Update a single vital bar in the HUD (v0.2)
     * @param {string} vitalId - 'health', 'hunger', 'thirst', 'stamina'
     * @param {number} value
     * @param {number} max
     */
    _updateVitalBar(vitalId, value, max) {
        const barEl = document.getElementById(`bar-${vitalId}`);
        const valEl = document.getElementById(`val-${vitalId}`);
        if (barEl) {
            const pct = Math.max(0, Math.min(100, (value / max) * 100));
            barEl.style.width = `${pct}%`;

            if (pct <= 25) {
                barEl.classList.add('low');
            } else {
                barEl.classList.remove('low');
            }
        }
        if (valEl) {
            valEl.textContent = Math.round(value);
        }
    }

    /**
     * Use or place active item in selected hotbar slot
     */
    _useActiveItem() {
        const activeIdx = 20 + this.inventory.selectedHotbarIndex;
        const activeItem = this.inventory.slots[activeIdx];
        if (!activeItem) {
            this._showNotification('❌ Ô hotbar đang chọn trống!');
            return;
        }

        const resDef = getResourceDef(activeItem.id);
        if (!resDef) return;

        if (resDef.consumable) {
            if (activeItem.id === 'cooked_meal') {
                this.inventory.removeItemAt(activeIdx, 1);
                this.vitals.eat(40);
                this._showNotification('🍖 Đã ăn Thức Ăn Chín! Hunger +40');
                this.engine.audio.playPickup();
            } else if (activeItem.id === 'fresh_water') {
                this.inventory.removeItemAt(activeIdx, 1);
                this.vitals.drink(50);
                this._showNotification('💧 Đã uống Nước Ngọt! Thirst +50');
                this.engine.audio.playPickup();
            } else if (activeItem.id === 'campfire') {
                this._placeStructure('campfire');
            } else if (activeItem.id === 'water_collector') {
                this._placeStructure('water_collector');
            }
        } else {
            if (activeItem.id === 'stone_axe') {
                this._showNotification('🪓 Đang trang bị Rìu Đá! Tăng gấp đôi tài nguyên thu hoạch.');
            } else {
                this._showNotification(`📦 Không thể sử dụng trực tiếp ${resDef.name}!`);
            }
        }
    }

    _placeStructure(type) {
        const dist = 2.0;
        const yaw = this.player.rotation[1];
        const placeX = this.player.position[0] + Math.sin(yaw) * dist;
        const placeZ = this.player.position[2] + Math.cos(yaw) * dist;

        // Keep the structure inside the island (2m buffer from the shoreline)
        const island = this.worldGenerator && this.world && this.world.terrainGenerator
            ? this.world.terrainGenerator.island
            : null;
        const maxRadius = island ? Math.max(2.0, island.radius - 2.0) : 22.0;
        const distFromCenter = Math.sqrt(placeX * placeX + placeZ * placeZ);
        let clampedX = placeX;
        let clampedZ = placeZ;
        if (distFromCenter > maxRadius && distFromCenter > 0.0001) {
            const scale = maxRadius / distFromCenter;
            clampedX *= scale;
            clampedZ *= scale;
        }
        const placeY = this.terrain.getHeight(clampedX, clampedZ);

        const activeIdx = 20 + this.inventory.selectedHotbarIndex;

        if (type === 'campfire') {
            this.campfire.position[0] = clampedX;
            this.campfire.position[1] = placeY;
            this.campfire.position[2] = clampedZ;
            this.campfire.isBuilt = true;
            this.campfire.updateModelMatrix();
            this.inventory.removeItemAt(activeIdx, 1);
            this._showNotification('🔥 Đã đặt Lửa Trại! Đến gần để nấu ăn.');
        } else if (type === 'water_collector') {
            this.waterCollector.position[0] = clampedX;
            this.waterCollector.position[1] = placeY;
            this.waterCollector.position[2] = clampedZ;
            this.waterCollector.isBuilt = true;
            this.waterCollector.updateModelMatrix();
            this.inventory.removeItemAt(activeIdx, 1);
            this._showNotification('💧 Đã đặt Bẫy Nước Mưa! Nước hứng tự động.');
        }

        this.engine.audio.playRaftBuild();
        this.particleSystem.emit(
            [clampedX, placeY + 0.5, clampedZ],
            ParticleSystem.PRESET.BUILD
        );
    }

    /**
     * Toggle the visibility of the inventory & crafting overlay
     */
    _toggleInventoryMenu() {
        if (!this.inventoryMenu) return;
        const isHidden = this.inventoryMenu.classList.contains('hidden');
        if (isHidden) {
            this.inventoryMenu.classList.remove('hidden');
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            this._renderCraftingPanel();
            this._updateGridInventory();
            this.tutorial.notifyCraftingOpened();
            this.engine.audio.playClick();
        } else {
            this._closeInventoryMenu();
        }
    }

    _closeInventoryMenu() {
        if (this.inventoryMenu) {
            this.inventoryMenu.classList.add('hidden');
            this.engine.audio.playClick();
        }
    }

    /**
     * Render dynamic recipes inside the crafting container
     */
    _renderCraftingPanel() {
        const recipesListEl = document.getElementById('crafting-recipes-list');
        const detailsEl = document.getElementById('recipe-details-panel');
        if (!recipesListEl || !detailsEl) return;

        const recipes = getAllRecipes();

        const filtered = recipes.filter(recipe => {
            if (recipe.id === 'campfire' && this.campfire && this.campfire.isBuilt) return false;
            if (recipe.id === 'water_collector' && this.waterCollector && this.waterCollector.isBuilt) return false;
            
            // Check blueprint requirements (v0.3)
            if (recipe.requiresBlueprint && !this.unlockedBlueprints.has(recipe.requiresBlueprint)) {
                return false;
            }
            
            return recipe.category === this.selectedCraftingCategory;
        });

        let html = '';
        for (const recipe of filtered) {
            const canCraft = CraftingSystem.canCraft(recipe.id, this.inventory);
            const canCraftClass = canCraft ? ' can-craft' : '';
            const isSelected = (recipe.id === this.selectedRecipeId) ? ' selected' : '';

            html += `
                <div class="recipe-item-card${canCraftClass}${isSelected}" data-recipe-id="${recipe.id}">
                    <div class="recipe-item-icon">${recipe.icon}</div>
                    <div class="recipe-item-info">
                        <div class="recipe-item-name">${recipe.name}</div>
                        <div class="recipe-item-desc">${recipe.description}</div>
                    </div>
                    <div class="recipe-item-status">${canCraft ? '✔️' : '❌'}</div>
                </div>
            `;
        }

        recipesListEl.innerHTML = html || `<div class="details-placeholder" style="margin-top: 20px;">Không có công thức nào trong nhóm này</div>`;

        const cards = recipesListEl.querySelectorAll('.recipe-item-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectedRecipeId = card.getAttribute('data-recipe-id');
                this._renderCraftingPanel();
            });
        });

        this._renderRecipeDetails(detailsEl);
    }

    _renderRecipeDetails(detailsEl) {
        if (!this.selectedRecipeId) {
            detailsEl.innerHTML = `<div class="details-placeholder">Chọn một công thức để xem chi tiết & chế tạo</div>`;
            return;
        }

        const recipe = getRecipeDef(this.selectedRecipeId);
        if (!recipe) {
            detailsEl.innerHTML = `<div class="details-placeholder">Chọn một công thức để xem chi tiết & chế tạo</div>`;
            return;
        }

        if ((recipe.id === 'campfire' && this.campfire && this.campfire.isBuilt) ||
            (recipe.id === 'water_collector' && this.waterCollector && this.waterCollector.isBuilt)) {
            this.selectedRecipeId = null;
            detailsEl.innerHTML = `<div class="details-placeholder">Chọn một công thức để xem chi tiết & chế tạo</div>`;
            return;
        }

        const canCraft = CraftingSystem.canCraft(recipe.id, this.inventory);

        let ingredientsHtml = '';
        for (const [ingredientId, requiredCount] of Object.entries(recipe.ingredients)) {
            const currentCount = this.inventory.getCount(ingredientId);
            const isMet = currentCount >= requiredCount;
            const badgeClass = isMet ? 'met' : 'missing';

            const resDef = getResourceDef(ingredientId);
            const ingredientName = resDef ? resDef.name : ingredientId;
            const ingredientIcon = resDef ? resDef.icon : '';

            ingredientsHtml += `
                <span class="ingredient-badge ${badgeClass}">
                    ${ingredientIcon} ${ingredientName} ${currentCount}/${requiredCount}
                </span>
            `;
        }

        detailsEl.innerHTML = `
            <div class="details-header">
                <div class="details-icon">${recipe.icon}</div>
                <div class="details-meta">
                    <div class="details-name">${recipe.name}</div>
                    <div class="details-desc">${recipe.description}</div>
                </div>
            </div>
            <div class="details-ingredients">
                ${ingredientsHtml}
            </div>
            <div class="details-craft-btn-row">
                <button id="details-craft-btn" class="craft-btn" ${canCraft ? '' : 'disabled'}>
                    Chế tạo
                </button>
            </div>
        `;

        const craftBtn = document.getElementById('details-craft-btn');
        if (craftBtn) {
            craftBtn.addEventListener('click', () => {
                this._craftItem(recipe.id);
            });
        }
    }

    _craftItem(recipeId) {
        const recipe = getRecipeDef(recipeId);
        if (!recipe) return;

        const success = CraftingSystem.craft(recipeId, this.inventory);
        if (success) {
            this._showNotification(`🔨 Đã chế tạo: ${recipe.icon} ${recipe.name}!`);

            this.engine.audio.playCraft();
            this.particleSystem.emit(
                [this.player.position[0], this.player.position[1] + 0.5 * this.player.scaleFactor, this.player.position[2]],
                ParticleSystem.PRESET.CRAFT
            );
            this.tutorial.notifyCrafted();
            this._renderCraftingPanel();
        } else {
            console.warn(`GameScene: Crafting failed for ${recipeId}`);
        }
    }

    _openTreasureChest(chest) {
        chest.collect();
        this.engine.audio.playPickup();

        this.particleSystem.emit(
            [chest.position[0], chest.position[1] + 0.5, chest.position[2]],
            ParticleSystem.PRESET.CRAFT
        );

        const cx = chest.position[0];
        const cz = chest.position[2];

        let msg = '';
        if (cx < 0 && cz > 0) {
            this.unlockedBlueprints.add('fishing_rod_blueprint');
            this.inventory.addItem('rope', 4);
            msg = 'Bản Thiết Kế Cần Câu 🎣 + 4 Dây Thừng!';
        } else if (cx > 0 && cz < 0) {
            this.unlockedBlueprints.add('sail_raft_blueprint');
            this.inventory.addItem('wood', 5);
            this.inventory.addItem('rope', 5);
            msg = 'Bản Thiết Kế Cánh Buồm ⛵ + 5 Gỗ & 5 Dây!';
        } else if (cx > 0 && cz > 0) {
            this.unlockedBlueprints.add('motor_raft_blueprint');
            this.inventory.addItem('barrel', 2);
            msg = 'Bản Thiết Kế Động Cơ Bè 🚀 + 2 Thùng Gỗ!';
        } else {
            this.inventory.addItem('sail_cloth', 1);
            this.inventory.addItem('engine_parts', 2);
            msg = 'Tìm thấy: ⛵ Vải Buồm & ⚙️ Phụ Tùng Động Cơ!';
        }

        this._showNotification(`🎉 Mở Rương: ${msg}`);
        this._renderCraftingPanel();
    }

    /**
     * Show game over screen (v0.2)
     */
    _showGameOver() {
        this._isGameOver = true;

        // Show game over screen
        if (this.gameoverScreen) {
            this.gameoverScreen.classList.remove('hidden');
        }

        // Hide hotbar
        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');

        // Set survival time
        const mins = Math.floor(this.survivalSeconds / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.survivalSeconds % 60).toString().padStart(2, '0');
        if (this.gameoverTimeEl) {
            this.gameoverTimeEl.textContent = `${mins}:${secs}`;
        }

        // Exit pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    /**
     * Show premium toast notification overlay
     * @param {string} message
     */
    _showNotification(message) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        el.innerHTML = message;
        el.classList.remove('hidden');
        el.classList.remove('animate-out');

        // Force reflow for animation restart
        void el.offsetWidth;
        el.classList.add('animate-in');

        // Clear existing timeout if any
        if (this._notificationTimeoutId) {
            clearTimeout(this._notificationTimeoutId);
        }

        this._notificationTimeoutId = setTimeout(() => {
            el.classList.remove('animate-in');
            el.classList.add('animate-out');
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('animate-out');
            }, 300);
        }, 2500);
    }

    /**
     * Starts the cinematic cutscene sequence
     */
    _startEscapeCutscene() {
        this.isEscaping = true;
        if (this.escapeHud) {
            this.escapeHud.classList.add('hidden');
        }
        this._closeInventoryMenu();

        // Hide hotbar
        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Hide tutorial during escape
        this.tutorial.skip();
        
        // Sound
        this.engine.audio.playClick();
    }


    destroy() {
        console.log('GameScene: Destroying meshes and shader programs...');
        
        if (this.basicShader) this.basicShader.delete();
        if (this.waterShader) this.waterShader.delete();

        if (this.terrain) this.terrain.delete();
        if (this.water) this.water.delete();

        if (this.characterRenderer) this.characterRenderer.delete();

        // Cleanup resource system
        if (this.raftAssembly) this.raftAssembly.delete();
        if (this.waterfall) this.waterfall.delete();
        if (this.resourceManager) this.resourceManager.delete();
        if (this.debrisManager) this.debrisManager.delete();
        if (this.inventory) this.inventory.clear();
        if (this._notificationTimeoutId) {
            clearTimeout(this._notificationTimeoutId);
        }

        // Cleanup particle system
        if (this.particleSystem) this.particleSystem.delete();

        // Cleanup tutorial
        if (this.tutorial) this.tutorial.destroy();

        if (this.campfire) this.campfire.delete();
        if (this.waterCollector) this.waterCollector.delete();

        // Cleanup environment entities list
        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                entity.delete();
            }
            this.environmentEntities = [];
        }

        // Cleanup collision system
        if (this.collisionSystem) {
            this.collisionSystem.clear();
            this.collisionSystem = null;
        }
        if (this.collisionDebug) {
            this.collisionDebug.delete();
            this.collisionDebug = null;
        }

        // Remove pause button listeners
        if (this._pauseResumeBtn) this._pauseResumeBtn.removeEventListener('click', this._onPauseResume);
        if (this._pauseSoundBtn) this._pauseSoundBtn.removeEventListener('click', this._onPauseSound);
        if (this._pauseMenuBtn) this._pauseMenuBtn.removeEventListener('click', this._onPauseMenu);

        // Hide overlays
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');

        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.add('hidden');

        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');

        // Stop ambient sounds
        this.engine.audio.stopAmbientWaves();
    }

    /**
     * Regenerate world dynamically (triggered on debug mode switch)
     */
    _regenerateWorld() {
        console.log(`GameScene: Regenerating world with debugBiomeColors = ${this.debugBiomeColors}`);
        const gl = this.gl;

        // 1. Generate new world
        this.world = this.worldGenerator.generate(
            this.worldSeed, 
            this.engine.assets.environmentMetadata, 
            this.debugBiomeColors
        );
        
        // 2. Rebuild terrain geometry buffers
        this.terrain.rebuild(this.world.terrain, this.world.terrainGenerator);
        
        // 3. Re-instantiate environment objects
        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                entity.delete();
            }
        }
        this.environmentEntities = [];
        
        for (const obj of this.world.placedObjects) {
            const mesh = this.engine.assets.models[obj.objPath];
            if (mesh) {
                const entity = new EnvironmentObject(
                    gl,
                    mesh,
                    obj.position,
                    obj.rotation,
                    obj.scale,
                    obj.collision,
                    obj.navigationBlocker,
                    obj.category || ''
                );
                this.environmentEntities.push(entity);
            }
        }
        
        // 4. Re-spawn resource nodes list
        if (this.resourceManager) {
            this.resourceManager.delete();
            this.resourceManager.worldResources = [];
            for (const node of this.world.resourceNodes) {
                const def = getResourceDef(node.id);
                if (def) {
                    const terrainY = this.terrain.getHeight(node.position[0], node.position[2]);
                    const y = terrainY + def.meshScale[1] * 0.5 + 0.3;

                    const resource = new WorldResource(gl, def, [node.position[0], y, node.position[2]]);
                    this.resourceManager.worldResources.push(resource);
                }
            }
        }

        // 5. Adjust POIs positions relative to new terrain
        if (this.campfire) {
            const cy = this.terrain.getHeight(this.campfire.position[0], this.campfire.position[2]);
            this.campfire.position[1] = cy;
            this.campfire.updateModelMatrix();
        }
        if (this.waterCollector) {
            const wy = this.terrain.getHeight(this.waterCollector.position[0], this.waterCollector.position[2]);
            this.waterCollector.position[1] = wy;
            this.waterCollector.updateModelMatrix();
        }
        if (this.waterfall && this.world.landmarks && this.world.landmarks.waterfall) {
            const wf = this.world.landmarks.waterfall;
            this.waterfall.position[0] = wf[0];
            this.waterfall.position[1] = wf[1];
            this.waterfall.position[2] = wf[2];
            this.waterfall.updateModelMatrix();
        } else if (this.waterfall) {
            const wfy = this.terrain.getHeight(this.waterfall.position[0], this.waterfall.position[2]);
            this.waterfall.position[1] = wfy;
            this.waterfall.updateModelMatrix();
        }

        // Re-spawn treasure chests from new landmarks
        if (this.resourceManager && this.world.landmarks && this.world.landmarks.treasureChests) {
            for (const spot of this.world.landmarks.treasureChests) {
                this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
            }
        }

        // 6. Relocate Raft assembly to procedurally calculated buildArea
        if (this.raftAssembly) {
            this.raftAssembly.position[0] = this.world.buildArea[0];
            this.raftAssembly.position[1] = this.world.buildArea[1];
            this.raftAssembly.position[2] = this.world.buildArea[2];
            this.raftAssembly.updateModelMatrix();
        }

        // 7. Snap player position to new terrain slope heights
        const py = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        this.player.position[1] = py + this.player.collider.height * 0.5;
        this.player.updateModelMatrix();

        // 8. Update HUD Metrics
        this._updateWorldDebugInfo();
    }

    /**
     * Render seed and metrics in Debug Panel
     */
    _updateWorldDebugInfo() {
        const seedEl = document.getElementById('debug-world-seed');
        if (seedEl) seedEl.textContent = this.worldSeed;

        const gentimeEl = document.getElementById('debug-world-gentime');
        if (gentimeEl) gentimeEl.textContent = `${this.world.generationTimeMs.toFixed(1)} ms`;

        const objcountEl = document.getElementById('debug-world-objcount');
        if (objcountEl) objcountEl.textContent = this.world.objectCount.toString();
    }
}
