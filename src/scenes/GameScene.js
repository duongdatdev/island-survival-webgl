import { Scene } from '../core/Scene.js';
import { Camera } from '../renderer/Camera.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { Mesh } from '../renderer/Mesh.js';
import { BasicShader } from '../shaders/BasicShader.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { Player } from '../entities/Player.js';
import { Terrain } from '../entities/Terrain.js';
import { Water } from '../entities/Water.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { ResourceManager } from '../systems/ResourceManager.js';
import { DebrisManager } from '../systems/DebrisManager.js';
import { Inventory } from '../systems/Inventory.js';
import { getAllRecipes, getRecipeDef } from '../systems/RecipeDatabase.js';
import { getResourceDef } from '../systems/ResourceDatabase.js';
import { CraftingSystem } from '../systems/CraftingSystem.js';
import { RaftAssembly } from '../entities/RaftAssembly.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';


/**
 * Main active gameplay scene
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
        this.dirLight = new DirectionalLight([0.6, 1.0, 0.3], [1.0, 0.95, 0.85], 1.0);
        this.ambientLight = new AmbientLight([0.22, 0.28, 0.38], 0.4);
        this.lightTime = 0.0;

        // 4. Entities Setup
        this.player = new Player();
        this.terrain = new Terrain(gl, 80, 50.0); // 80x80 divisions, size 50
        this.water = new Water(gl, 60, 100.0);   // 60x60 divisions, size 100

        // 5. Build Player Meshes (Cube data)
        const redBodyData = this._createCubeData(0.9, 0.25, 0.25); // Red body
        this.bodyMesh = new Mesh(gl, redBodyData);

        const skinHeadData = this._createCubeData(0.98, 0.80, 0.65); // Skin colored head
        this.headMesh = new Mesh(gl, skinHeadData);

        const blackVisorData = this._createCubeData(0.1, 0.12, 0.18); // Dark visor
        this.visorMesh = new Mesh(gl, blackVisorData);

        // 6. Resource System Initialization
        this.inventory = new Inventory();
        this.resourceManager = new ResourceManager();
        this.debrisManager = new DebrisManager();

        // Spawn resources scattered across the island
        this.resourceManager.spawnRandomResources(gl, this.terrain, 30);

        // Bind inventory changes to UI updates
        this.inventory.onChange = (resourceId, newCount, delta) => {
            this._updateResourceHUD(resourceId, newCount);
            this._renderCraftingPanel();
        };

        // 7. Particle System
        this.particleSystem = new ParticleSystem(gl);

        // 8. Tutorial System
        this.tutorial = new TutorialSystem();
        this.tutorial.init();
        this.tutorial.start();

        // 9. Crafting UI Bindings
        this.craftingPanel = document.getElementById('crafting-panel');
        this.craftingRecipesContainer = document.getElementById('crafting-recipes');
        this.craftToggleBtn = document.getElementById('craft-toggle-btn');
        this.craftingCloseBtn = document.getElementById('crafting-close');
        this._notificationTimeoutId = null;

        if (this.craftToggleBtn) {
            this.craftToggleBtn.addEventListener('click', () => this._toggleCraftingPanel());
        }
        if (this.craftingCloseBtn) {
            this.craftingCloseBtn.addEventListener('click', () => this._closeCraftingPanel());
        }

        // Initialize panel render
        this._renderCraftingPanel();

        // Raft Assembly & Escape HUD Initializations
        this.raftAssembly = new RaftAssembly(gl, [0.0, 0.0, 20.0]);
        this.escapeHud = document.getElementById('escape-hud');
        this.escapeBtn = document.getElementById('escape-btn');
        this.victoryScreen = document.getElementById('victory-screen');
        this.restartBtn = document.getElementById('restart-btn');
        this.statTimeEl = document.getElementById('stat-time');

        if (this.escapeBtn) {
            this.escapeBtn.addEventListener('click', () => this._startEscapeCutscene());
        }
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        this.isEscaping = false;
        this.escapeTime = 0.0;
        this.survivalSeconds = 0.0;

        // 10. Pause state
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

        // 11. Running properties
        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        // Footstep timer
        this._footstepTimer = 0;
        this._footstepInterval = 0.35; // Seconds between footstep sounds

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

        // If paused, don't update game logic
        if (this.isPaused) return;

        this.time += deltaTime;

        // Escape cutscene update loop
        if (this.isEscaping) {
            this.escapeTime += deltaTime;

            // Sail the raft forward
            const sailSpeed = 1.0 + this.escapeTime * 0.8;
            this.raftAssembly.position[2] += sailSpeed * deltaTime;
            this.raftAssembly.position[1] = Math.sin(this.time * 2.5) * 0.08;
            this.raftAssembly.updateModelMatrix();

            // Pin player character to raft frame
            this.player.position[0] = this.raftAssembly.position[0];
            this.player.position[1] = this.raftAssembly.position[1] + 0.45;
            this.player.position[2] = this.raftAssembly.position[2];
            this.player.rotation[1] = 0.0;
            this.player.updateModelMatrix();

            // Cinematic camera track
            this.camera.target[0] = this.raftAssembly.position[0];
            this.camera.target[1] = this.raftAssembly.position[1] + 0.8;
            this.camera.target[2] = this.raftAssembly.position[2];

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

        // Update player movements using keyboards and camera reference
        this.player.update(deltaTime, this.engine.input, this.camera, this.terrain);

        // Footstep sounds while moving
        if (this.player.currentSpeed > 0.1) {
            this._footstepTimer += deltaTime;
            if (this._footstepTimer >= this._footstepInterval) {
                this._footstepTimer = 0;
                this.engine.audio.playFootstep();

                // Dust particles at player feet
                const dustPos = [
                    this.player.position[0],
                    this.player.position[1] - 0.8,
                    this.player.position[2]
                ];
                this.particleSystem.emit(dustPos, ParticleSystem.PRESET.DUST);
            }
        } else {
            this._footstepTimer = this._footstepInterval * 0.8; // Quick first step on resume
        }

        // Toggle Crafting Panel via 'C' key
        if (this.engine.input.isKeyPressed('KeyC')) {
            this._toggleCraftingPanel();
        }

        // Toggle Inventory HUD via 'Tab' key
        if (this.engine.input.isKeyPressed('Tab')) {
            this._toggleInventoryHUD();
        }

        // Developer Debug Cheat: Press 'K' to teleport to beach & get all raft modules
        if (this.engine.input.isKeyPressed('KeyK')) {
            // Teleport close to raft building site
            this.player.position[0] = 0.0;
            this.player.position[1] = 0.9;
            this.player.position[2] = 16.5;
            this.player.updateModelMatrix();

            // Add required items
            this.inventory.addItem('raft_frame', 1);
            this.inventory.addItem('barrel_floats', 1);
            this.inventory.addItem('paddle', 1);

            this._showNotification('🛠️ CHEAT: Teleported to beach & raft modules added!');
        }


        // Snap camera tracking around player
        this.camera.update(this.engine.input, this.player.position);

        // Proximity detection for raft assembly
        let showRaftPrompt = false;
        let raftPromptText = '';
        let hasModule = false;
        let targetModule = '';

        const distToRaft = this.raftAssembly.distanceTo(this.player.position);
        if (distToRaft < 3.0 && !this.raftAssembly.isComplete()) {
            if (!this.raftAssembly.framePlaced) {
                targetModule = 'raft_frame';
                hasModule = this.inventory.hasItem('raft_frame');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Khung Bè 🧱' : 'Cần chế tạo Khung Bè 🧱 để lắp ráp';
            } else if (!this.raftAssembly.floatsPlaced) {
                targetModule = 'barrel_floats';
                hasModule = this.inventory.hasItem('barrel_floats');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Phao Thùng 🛢️' : 'Cần chế tạo Phao Thùng 🛢️ để lắp ráp';
            } else if (!this.raftAssembly.paddlePlaced) {
                targetModule = 'paddle';
                hasModule = this.inventory.hasItem('paddle');
                raftPromptText = hasModule ? '<span class="hint-key">E</span> Lắp Mái Chèo 🛶' : 'Cần chế tạo Mái Chèo 🛶 để lắp ráp';
            }
            showRaftPrompt = true;
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
            }

            // Sound + particle effects for raft building
            this.engine.audio.playRaftBuild();
            this.particleSystem.emit(
                [this.raftAssembly.position[0], this.raftAssembly.position[1] + 0.5, this.raftAssembly.position[2]],
                ParticleSystem.PRESET.BUILD
            );
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

        // Override pickup hint text if player is at raft build site
        if (showRaftPrompt) {
            const hintEl = document.getElementById('pickup-hint');
            if (hintEl) {
                hintEl.innerHTML = raftPromptText;
                hintEl.classList.remove('hidden');
            }
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

        // Update particle system
        this.particleSystem.update(deltaTime);

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

        // 2. Draw Player Body (using scaled modelMatrix)
        // Set scale for body: [width, height, depth] -> [0.8, 1.2, 0.8]
        // Offset Y so bottom of body sits at player.position.y
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.3, 0.0]); // Body offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.8, 1.2, 0.8]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.bodyMesh.draw(drawMode);

        // 3. Draw Player Head
        // Placed on top of body (height offsets Y)
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.15, 0.0]); // Head offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.55, 0.55, 0.55]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.headMesh.draw(drawMode);

        // 4. Draw Player Visor (helps distinguish forward orientation)
        // Local translation along Z axis forward [0, 1.2, 0.28] relative to player coordinate center
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.2, 0.28]); // Visor offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.4, 0.16, 0.1]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.visorMesh.draw(drawMode);

        // 5. Draw World Resources
        this.resourceManager.drawAll(this.basicShader, drawMode);

        // 6. Draw Drifting Debris (on water surface, before water pass)
        this.debrisManager.drawAll(this.basicShader, drawMode);

        // 7. Draw solid components of the Raft Assembly
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, false);
        }

        // --- DRAW WATER (Translucent Geometry, WaterShader) ---
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Draw ghost/hologram parts of Raft Assembly (translucent pass)
        this.basicShader.use();
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, true);
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

        // 8. Draw Particles (additive blending, on top)
        this.particleSystem.draw(this.camera);
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
     * Update the Resource HUD UI when inventory changes
     * @param {string} resourceId
     * @param {number} newCount
     */
    _updateResourceHUD(resourceId, newCount) {
        const countEl = document.getElementById(`count-${resourceId}`);
        if (countEl) {
            countEl.textContent = newCount;

            // Trigger pulse animation
            countEl.classList.remove('pulse');
            void countEl.offsetWidth; // Force reflow
            countEl.classList.add('pulse');
        }
    }

    /**
     * Toggle the visibility of the resource HUD (inventory)
     */
    _toggleInventoryHUD() {
        const hud = document.getElementById('resource-hud');
        if (hud) {
            hud.classList.toggle('hidden');
            this.engine.audio.playClick();
        }
    }

    /**
     * Toggle the visibility of the crafting panel overlay
     */
    _toggleCraftingPanel() {
        if (!this.craftingPanel) return;
        const isHidden = this.craftingPanel.classList.contains('hidden');
        if (isHidden) {
            this.craftingPanel.classList.remove('hidden');
            // Exit pointer lock to enable clicking buttons
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            this._renderCraftingPanel();
            this.tutorial.notifyCraftingOpened();
            this.engine.audio.playClick();
        } else {
            this._closeCraftingPanel();
        }
    }

    /**
     * Close the crafting panel overlay
     */
    _closeCraftingPanel() {
        if (this.craftingPanel) {
            this.craftingPanel.classList.add('hidden');
        }
    }

    /**
     * Render dynamic recipes inside the crafting container
     */
    _renderCraftingPanel() {
        if (!this.craftingRecipesContainer) return;

        const recipes = getAllRecipes();
        let html = '';

        for (const recipe of recipes) {
            const canCraft = CraftingSystem.canCraft(recipe.id, this.inventory);
            
            // Build ingredients HTML
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

            html += `
                <div class="recipe-card" id="recipe-${recipe.id}">
                    <div class="recipe-icon-wrapper">${recipe.icon}</div>
                    <div class="recipe-info">
                        <div class="recipe-name-text">${recipe.name}</div>
                        <div class="recipe-desc-text">${recipe.description}</div>
                        <div class="recipe-ingredients">
                            ${ingredientsHtml}
                        </div>
                    </div>
                    <button class="craft-btn" data-recipe-id="${recipe.id}" ${canCraft ? '' : 'disabled'}>
                        Chế tạo
                    </button>
                </div>
            `;
        }

        this.craftingRecipesContainer.innerHTML = html;

        // Bind click events
        const buttons = this.craftingRecipesContainer.querySelectorAll('.craft-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const recipeId = e.currentTarget.getAttribute('data-recipe-id');
                this._craftItem(recipeId);
            });
        });
    }

    /**
     * Handle item crafting
     * @param {string} recipeId
     */
    _craftItem(recipeId) {
        const recipe = getRecipeDef(recipeId);
        if (!recipe) return;

        const success = CraftingSystem.craft(recipeId, this.inventory);
        if (success) {
            this._showNotification(`🔨 Đã chế tạo: ${recipe.icon} ${recipe.name}!`);
            
            // Sound + particle effects
            this.engine.audio.playCraft();
            this.particleSystem.emit(
                [this.player.position[0], this.player.position[1] + 0.5, this.player.position[2]],
                ParticleSystem.PRESET.CRAFT
            );
            this.tutorial.notifyCrafted();
        } else {
            console.warn(`GameScene: Crafting failed for ${recipeId}`);
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
        this._closeCraftingPanel();
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

        if (this.bodyMesh) this.bodyMesh.delete();
        if (this.headMesh) this.headMesh.delete();
        if (this.visorMesh) this.visorMesh.delete();

        // Cleanup resource system
        if (this.raftAssembly) this.raftAssembly.delete();
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

        // Remove pause button listeners
        if (this._pauseResumeBtn) this._pauseResumeBtn.removeEventListener('click', this._onPauseResume);
        if (this._pauseSoundBtn) this._pauseSoundBtn.removeEventListener('click', this._onPauseSound);
        if (this._pauseMenuBtn) this._pauseMenuBtn.removeEventListener('click', this._onPauseMenu);

        // Hide overlays
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');

        // Stop ambient sounds
        this.engine.audio.stopAmbientWaves();
    }

    /**
     * Helper to output standard 24-vertex cuboid arrays for flat surface normals
     * BUG FIX: Corrected left face normal vector (was [-1, -1, 0] → [-1, 0, 0])
     */
    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            // Back face
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            // Bottom face
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
            // Right face
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            // Left face
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
            // Front
             0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,
            // Back
             0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,
            // Top
             0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,
            // Bottom
             0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,
            // Right
             1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,
            // Left (BUG FIX: was [-1, -1, 0] for second vertex)
            -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0,
        ]);

        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i * 4] = r;
            colors[i * 4 + 1] = g;
            colors[i * 4 + 2] = b;
            colors[i * 4 + 3] = 1.0;
        }

        const texCoords = new Float32Array([
            // Front
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
            // Back
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Top
            0.0, 1.0,  0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
            // Bottom
            1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
            // Right
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Left
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        ]);

        const indices = new Uint16Array([
            0, 1, 2,      0, 2, 3,    // Front
            4, 5, 6,      4, 6, 7,    // Back
            8, 9, 10,     8, 10, 11,  // Top
            12, 13, 14,   12, 14, 15, // Bottom
            16, 17, 18,   16, 18, 19, // Right
            20, 21, 22,   20, 22, 23  // Left
        ]);

        return { positions, normals, colors, texCoords, indices };
    }
}
