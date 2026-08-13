import { Scene } from '../core/Scene.js';
import { Camera } from '../renderer/Camera.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { Mesh } from '../renderer/Mesh.js';
import { BasicShader } from '../shaders/BasicShader.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { WaveField } from '../shaders/WaterWaves.js';
import { UnlitShader } from '../shaders/UnlitShader.js';
import { Player } from '../entities/Player.js';
import { CharacterRenderer } from '../characters/CharacterRenderer.js';
import { CharacterRegistry } from '../characters/CharacterRegistry.js';
import { FirstPersonViewModel } from '../characters/FirstPersonViewModel.js';
import { Terrain } from '../entities/Terrain.js';
import { Water } from '../entities/Water.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { ResourceManager } from '../systems/ResourceManager.js';
import { DebrisManager } from '../systems/DebrisManager.js';
import { Inventory } from '../systems/InventoryV2.js';
import { getAllRecipes, getRecipeDef } from '../systems/RecipeDatabase.js';
import { getResourceDef } from '../systems/ResourceDatabase.js';
import { CraftingSystem } from '../systems/CraftingSystem.js';
import { RaftAssembly } from '../entities/RaftAssembly.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { VitalsSystem } from '../systems/VitalsSystem.js';
import { Campfire } from '../entities/Campfire.js';
import { WaterCollector } from '../entities/WaterCollector.js';
import { Waterfall } from '../entities/Waterfall.js';
import { WorldGenerator } from '../gameplay/world/WorldGenerator.js';
import { EnvironmentObject } from '../entities/EnvironmentObject.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { CollisionDebug } from '../systems/CollisionDebug.js';
import { BillboardSprite } from '../renderer/BillboardSprite.js';
import { DayNightCycle } from '../systems/DayNightCycle.js';
import { WeatherSystem } from '../systems/WeatherSystem.js';
import { RainSystem } from '../systems/RainSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { Crab } from '../entities/Crab.js';
import { Seagull } from '../entities/Seagull.js';
import { Boar } from '../entities/Boar.js';
import { Shark } from '../entities/Shark.js';
import { CreatureState } from '../entities/Creature.js';
import { SkyShader } from '../shaders/SkyShader.js';
import { BiomeType } from '../gameplay/world/BiomeGenerator.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { MenuUI } from '../systems/MenuUI.js';
import { createStats } from '../systems/AchievementSystem.js';
import { PostProcessing } from '../renderer/PostProcessing.js';
import { Frustum } from '../renderer/Frustum.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

/** How long between background autosaves, in seconds. */
const AUTOSAVE_INTERVAL = 60.0;

/** How often achievement predicates are re-evaluated, in seconds. */
const ACHIEVEMENT_CHECK_INTERVAL = 1.0;

/** Axe targeting and the number of pickup logs produced by one tree. */
const TREE_CHOP_HALF_ARC = Math.PI * 0.28;
const TREE_WOOD_DROP_FRACTIONS = [0.28, 0.52, 0.76];

/**
 * Compass strip scale. Shared by the ticks, the direction labels and the POI
 * markers so an icon lands exactly over the bearing it points at. At 2.9px per
 * degree the default 260px bar shows ~90° of arc.
 */
const COMPASS_PX_PER_DEG = 2.9;

/** Map a biome type onto the footstep surface key used by AudioManager. */
function biomeToSurface(biome) {
    switch (biome) {
        case BiomeType.BEACH: return 'sand';
        case BiomeType.FOREST: return 'grass';
        case BiomeType.ROCK_AREA: return 'rock';
        case BiomeType.GRASSLAND: return 'grass';
        case BiomeType.OCEAN: return 'water';
        default: return 'grass';
    }
}

/**
 * Maps a resource's `vitalEffect.type` onto the VitalsSystem call and the
 * Vietnamese copy used in the pickup toast. Adding a consumable is then a
 * ResourceDatabase entry only — no new branch in the consume handlers.
 */
const VITAL_ACTIONS = {
    hunger: { method: 'eat',   verb: 'Đã ăn',  label: 'Đói' },
    thirst: { method: 'drink', verb: 'Đã uống', label: 'Khát' },
    health: { method: 'heal',  verb: 'Đã dùng', label: 'HP' },
};


/**
 * Main active gameplay scene — v1.0 (wildlife & combat, save/load,
 * achievements, post-processing and culling).
 */
export class GameScene extends Scene {
    init() {
        console.log('GameScene: Initializing gameplay state...');
        const gl = this.gl;

        // 1. Shaders Initialisation
        this.basicShader = new ShaderProgram(gl, BasicShader.vertex, BasicShader.fragment);
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);
        this.unlitShader = new ShaderProgram(gl, UnlitShader.vertex, UnlitShader.fragment);

        // 2. Camera Setup
        this.camera = new Camera(70 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.05, 1000.0);

        // 3. Lighting Setup
        this.dirLight = new DirectionalLight([0, 1.0, 0], [1.0, 0.95, 0.85], 1.0);
        this.ambientLight = new AmbientLight([0.22, 0.28, 0.38], 0.4);
        this.lightTime = 0.0;

        // 3.5 v0.4 - Day/Night Cycle & Weather System
        this.dayNight = new DayNightCycle();
        this.weather = new WeatherSystem();
        this._rainParticleTimer = 0;

        // 3.6 v0.4 - Sun & Moon billboard sprites (kept for gameplay cues)
        this.sunSprite = new BillboardSprite(gl, [1.0, 0.9, 0.5], 4.0, [1.0, 0.7, 0.15]);
        this.moonSprite = new BillboardSprite(gl, [0.85, 0.85, 0.95], 3.5, [0.5, 0.5, 0.7]);

        // 3.7 v1.1 - Procedural Sky Shader (shared with MainMenuScene)
        // Renders a fullscreen sky dome with gradient, stars, sun, cirrus, dithering.
        this.skyShader = null;
        this.skyVao = null;
        try {
            this.skyShader = new ShaderProgram(gl, SkyShader.vertex, SkyShader.fragment);
            this.skyVao = gl.createVertexArray();
        } catch (e) {
            console.error('GameScene: sky shader failed to compile, using flat sky.', e);
        }

        // Reused matrices for sky pass
        this._viewProj = Mat4.create();
        this._invViewProj = Mat4.create();

        // 4. Entities Setup
        this.player = new Player();

        // v1.0 — a save staged by the menu is consumed here so a reload of the
        // scene (e.g. returning from the main menu) starts fresh.
        /** @type {object|null} */
        this._pendingSave = this.engine.pendingLoad || null;
        this.engine.pendingLoad = null;

        // Procedural World Generation Setup
        this.worldSeed = this.engine.worldSeed || Math.floor(Math.random() * 1000000).toString();
        this.debugBiomeColors = false;
        this.worldGenerator = new WorldGenerator(120, 100.0);

        if (this._pendingSave) {
            // Generation is deterministic in the seed, so re-running it here
            // reproduces exactly the island the save was made on — far cheaper
            // than serializing terrain and prop placement.
            this.worldSeed = this._pendingSave.worldSeed;
            console.log(`GameScene: Restoring world from save seed: ${this.worldSeed}`);
            this.world = this.worldGenerator.generate(this.worldSeed, this.engine.assets.environmentMetadata, this.debugBiomeColors);
        } else if (this.engine.generatedWorld) {
            this.world = this.engine.generatedWorld;
            this.worldSeed = this.world.seed;
        } else {
            console.log(`GameScene: Generating fallback world with seed: ${this.worldSeed}`);
            this.world = this.worldGenerator.generate(this.worldSeed, this.engine.assets.environmentMetadata, this.debugBiomeColors);
        }

        // Initialize terrain with generated data
        this.terrain = new Terrain(gl, 120, 100.0, this.world.terrain, this.world.terrainGenerator);
        // 100x100 divisions, size 200. The terrain is handed over so the mesh
        // can bake seabed depth per vertex — that drives the shallow-water
        // colour and the shoreline foam band.
        this.water = new Water(gl, 100, 200.0, this.terrain);

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
        this.firstPersonViewModel = new FirstPersonViewModel(gl);
        this.firstPersonViewModel.load(this.engine.assets);

        // 6. Resource System Initialization
        this.inventory = new Inventory(20);
        this.resourceManager = new ResourceManager(this.engine.assets);
        this.debrisManager = new DebrisManager(this.engine.assets);

        // Spawn resources from procedural generator nodes list
        this.resourceManager.worldResources = [];
        for (const node of this.world.resourceNodes) {
            const def = getResourceDef(node.id);
            if (def) {
                const terrainY = this.terrain.getHeight(node.position[0], node.position[2]);
                const y = terrainY + def.meshScale[1] * 0.5 + 0.3;

                const resource = this.resourceManager.createResourceEntity(
                    gl,
                    def,
                    [node.position[0], y, node.position[2]]
                );
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
        this.rainSystem = new RainSystem(gl);

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
        this.campfire = new Campfire(
            gl,
            [5.0, 0.0, 5.0],
            this.engine.assets.getModel('survival:bonfire_fire')
        );
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
            const chest = this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
            // Tag the chest with its reward type up-front, based on the quadrant
            // it was placed in. This is robust even when a chest lands close to
            // an axis (where the old cx/cz sign classification broke).
            if (chest) chest.rewardType = this._quadrantRewardType(spot.quadrant);
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
        this._pauseSaveBtn = document.getElementById('pause-save-btn');
        this._pauseSettingsBtn = document.getElementById('pause-settings-btn');
        this._pauseAchievementsBtn = document.getElementById('pause-achievements-btn');
        this._pauseGuideBtn = document.getElementById('pause-guide-btn');

        this._onPauseResume = () => {
            this.engine.audio.playClick();
            this._resumeGame();
        };
        this._onPauseSound = () => {
            this.engine.audio._ensureContext();
            const muted = this.engine.audio.toggleMute();
            this.engine.settings.set('muted', muted);
            this._updatePauseSoundButton(muted);
            if (!muted) this.engine.audio.playClick();
        };
        this._onPauseMenu = () => {
            this.engine.audio.playClick();
            // Leaving to the menu would otherwise throw away progress since the
            // last autosave, so commit one on the way out.
            this._saveGame(true);
            this._resumeGame();
            // Small delay for transition
            setTimeout(() => {
                this.engine.scenes.switchScene('MainMenu');
            }, 100);
        };
        this._onPauseSave = () => {
            this.engine.audio.playClick();
            this._saveGame(false);
        };
        this._onPauseSettings = () => {
            this.engine.audio.playClick();
            this.menuUI.openSettings();
        };
        this._onPauseAchievements = () => {
            this.engine.audio.playClick();
            this.menuUI.openAchievements();
        };
        this._onPauseGuide = () => {
            this.engine.audio.playClick();
            this.menuUI.openGuide();
        };

        if (this._pauseResumeBtn) this._pauseResumeBtn.addEventListener('click', this._onPauseResume);
        if (this._pauseSoundBtn) this._pauseSoundBtn.addEventListener('click', this._onPauseSound);
        if (this._pauseMenuBtn) this._pauseMenuBtn.addEventListener('click', this._onPauseMenu);
        if (this._pauseSaveBtn) this._pauseSaveBtn.addEventListener('click', this._onPauseSave);
        if (this._pauseSettingsBtn) this._pauseSettingsBtn.addEventListener('click', this._onPauseSettings);
        if (this._pauseAchievementsBtn) this._pauseAchievementsBtn.addEventListener('click', this._onPauseAchievements);
        if (this._pauseGuideBtn) this._pauseGuideBtn.addEventListener('click', this._onPauseGuide);

        // 15. Running properties
        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        // Footstep timer
        this._footstepTimer = 0;
        this._footstepInterval = 0.4; // Seconds between footstep sounds

        // 16. Collision System
        this.collisionSystem = new CollisionSystem();
        this.collisionDebug = new CollisionDebug(gl);

        this.collisionSystem.register(this.player);
        for (const entity of this.environmentEntities) {
            this.collisionSystem.register(entity);
        }

        // Camera dependency injection — providers are adapter wrappers
        this.camera.setCollisionProvider({
            sphereCast: (origin, direction, radius, maxDist) => {
                const result = this.collisionSystem.raycast(origin, direction, maxDist + radius, null);
                if (result) {
                    const coll = result.entity.collider;
                    const collY = result.entity.position[1];
                    const halfH = (coll.height || 2.0) * 0.5 + radius;
                    if (result.point[1] >= collY - halfH && result.point[1] <= collY + halfH) {
                        const toCenterX = result.entity.position[0] - result.point[0];
                        const toCenterZ = result.entity.position[2] - result.point[2];
                        const nLen = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ);
                        return {
                            hit: true,
                            distance: Math.max(0, result.distance - radius),
                            normal: nLen > 0.001 ? [toCenterX / nLen, 0, toCenterZ / nLen] : [0, 0, 0],
                            collider: coll,
                        };
                    }
                }
                return { hit: false, distance: maxDist, normal: null, collider: null };
            },
        });
        this.camera.setTerrainProvider({
            getHeight: (x, z) => this.terrain.getHeight(x, z),
        });

        // 17. Debug Collision toggle
        const debugCollisionEl = document.getElementById('toggle-collision-debug');
        if (debugCollisionEl) {
            debugCollisionEl.addEventListener('change', (e) => {
                this.collisionSystem.setDebugMode(e.target.checked);
                this.collisionDebug.setEnabled(e.target.checked);
            });
        }

        // ── v0.5: Combat System & Wildlife ──
        this.combatSystem = new CombatSystem();
        this._attackHoldBlocked = false;
        this.creatures = [];

        // Spawn creatures
        this._spawnCrabs();
        this._spawnSeagulls();
        this._spawnBoars();
        this._spawnSharks();

        // Register creatures with collision system
        for (const creature of this.creatures) {
            this.collisionSystem.register(creature);
        }

        // v0.4: sky color set dynamically each frame — initial placeholder
        gl.clearColor(0.53, 0.74, 0.90, 1.0);

        // Show HUD
        const hud = document.getElementById('resource-hud');
        if (hud) hud.style.display = '';

        // ── v1.0: Release polish systems ──
        this._initReleaseSystems();

        // Start ambient audio (v1.1: positional emitters + procedural music)
        this.engine.audio._ensureContext();
        this.engine.audio.resume();
        this.engine.audio.startAmbientWaves();
        this.engine.audio.startWind();
        this.engine.audio.startRain();
        this.engine.audio.startMusic();
        this.engine.audio.setHealthFraction(this.vitals.health / 100);

        // Register positional emitters for the waterfall and campfire (if
        // already built from a save). These are one-shot registrations;
        // the campfire emitter is created dynamically on placement.
        this.engine.audio.addEmitter('waterfall', 'waterfall', this.waterfall.position, true);
        if (this.campfire.isBuilt) {
            this.engine.audio.addEmitter('campfire', 'campfire', this.campfire.position, true);
        }

        // Restoring last means every subsystem already exists and can simply be
        // overwritten with the stored values.
        if (this._pendingSave) {
            this._applySave(this._pendingSave);
            this._pendingSave = null;
        }

        // Lock pointer automatically on start
        try {
            this.engine.input.canvas.requestPointerLock();
        } catch (e) {
            console.warn('GameScene: requestPointerLock failed', e);
        }

        // Auto-lock pointer on canvas click during active gameplay
        this._onCanvasClick = () => {
            if (!this.isPaused && (!this.inventoryMenu || this.inventoryMenu.classList.contains('hidden')) && !this._isGameOver && !this.isEscaping) {
                if (!document.pointerLockElement) {
                    try {
                        this.gl.canvas.requestPointerLock();
                    } catch (e) {
                        console.warn('GameScene: requestPointerLock on click failed', e);
                    }
                }
            }
        };
        this.gl.canvas.addEventListener('click', this._onCanvasClick);
    }

    // ============================================
    //  v1.0 — RELEASE SYSTEMS
    // ============================================

    /**
     * Wire up the systems introduced in v1.0: run statistics, achievements,
     * autosave, culling, post-processing, and the settings overlays.
     */
    _initReleaseSystems() {
        const gl = this.gl;
        const settings = this.engine.settings;

        /** Per-run counters that feed achievement predicates. */
        this.stats = createStats();
        this.achievements = this.engine.achievements;
        this._achievementTimer = 0;

        // Night/storm milestones are edge-triggered, so remember the previous
        // sample rather than counting every frame spent in that state.
        this._wasNight = this.dayNight.timeOfDay > 0.85 || this.dayNight.timeOfDay < 0.1;
        this._wasStorm = false;

        this._autosaveTimer = 0;
        this._saveStatusTimer = 0;

        // Culling + post-processing
        this.frustum = new Frustum();
        this.postFx = new PostProcessing(gl);
        this._drawCalls = 0;

        // Shared settings/achievements/credits overlays. Closing one of them
        // returns to whatever was behind it (usually the pause menu), so no
        // close hook is needed here.
        this.menuUI = new MenuUI(this.engine);

        // Per-frame DOM lookups for the debug toggles were showing up in
        // profiles, so resolve them once and reuse the references.
        this._domCache = {
            wireframe: document.getElementById('toggle-wireframe'),
            water: document.getElementById('toggle-water'),
            lightRot: document.getElementById('toggle-light-rot'),
            pickupHint: document.getElementById('pickup-hint'),
            debugPanel: document.getElementById('debug-panel'),
            fpsCounter: document.getElementById('fps-counter'),
            lightDir: document.getElementById('debug-light-dir'),
            timeLabel: document.getElementById('debug-time-label'),
            timeOfDay: document.getElementById('debug-time-of-day'),
            weatherLabel: document.getElementById('debug-weather-label'),
            drawCalls: document.getElementById('debug-draw-calls'),
            culled: document.getElementById('debug-culled'),
            resolution: document.getElementById('debug-resolution'),
            postFx: document.getElementById('debug-postfx'),
            saveStatus: document.getElementById('pause-save-status'),
            // v1.1 HUD widgets
            timeWeatherWidget: document.getElementById('time-weather-widget'),
            twClock: document.getElementById('tw-clock'),
            twWeather: document.getElementById('tw-weather'),
            twDay: document.getElementById('tw-day'),
            compassBar: document.getElementById('compass-bar'),
            compassStrip: document.getElementById('compass-strip'),
            compassMarkers: document.getElementById('compass-markers'),
            crosshair: document.getElementById('crosshair'),
            hitMarker: document.getElementById('hit-marker'),
        };

        // Track the survival day counter
        this._survivalDay = 1;
        this._lastDayIndex = 0;

        this._applySettings();
        this._unsubscribeSettings = settings.onChange(() => this._applySettings());
    }

    /**
     * Push the current settings into the renderer, camera and particle system.
     * Cheap enough to re-run wholesale on any change.
     */
    _applySettings() {
        const s = this.engine.settings;

        this.camera.setFov(s.get('fov') * Math.PI / 180);
        this.camera.setLookSettings(s.get('mouseSensitivity'), s.get('invertY'));

        if (this.particleSystem) this.particleSystem.density = s.get('particleDensity');
        if (this.frustum) this.frustum.enabled = s.get('frustumCulling');
        if (this.postFx) this.postFx.enabled = s.get('postProcessing') && this.postFx.available;

        this._viewDistance = s.get('viewDistance');

        const fpsEl = this._domCache && this._domCache.fpsCounter;
        if (fpsEl) fpsEl.classList.toggle('hidden', !s.get('showFps'));
    }

    /**
     * Write a save snapshot.
     * @param {boolean} silent Autosaves and exit-saves stay quiet; the pause
     *        menu button reports success or failure to the player.
     */
    _saveGame(silent) {
        // A finished run has nothing meaningful to resume, and restoring into a
        // death/victory screen would leave the player stuck there.
        if (this._isGameOver || this.isEscaping) {
            if (!silent) this._setSaveStatus('Không thể lưu khi ván chơi đã kết thúc.', true);
            return false;
        }

        this.stats.survivalSeconds = this.survivalSeconds;
        const ok = SaveSystem.save(SaveSystem.captureScene(this));

        this._autosaveTimer = 0;
        if (!silent) {
            this._setSaveStatus(
                ok ? '💾 Đã lưu tiến trình!' : '❌ Lưu thất bại — bộ nhớ trình duyệt đã đầy.',
                !ok
            );
        }
        return ok;
    }

    _setSaveStatus(message, isError) {
        const el = this._domCache.saveStatus;
        if (!el) return;
        el.textContent = message;
        el.classList.toggle('error', !!isError);
        this._saveStatusTimer = 3.0;
    }

    /**
     * Overwrite live state with a stored snapshot. Called at the tail of
     * `init`, once every subsystem exists.
     * @param {object} save
     */
    _applySave(save) {
        console.log('GameScene: Restoring saved run...');

        // ── Player ──
        this.player.position[0] = save.player.position[0];
        this.player.position[1] = save.player.position[1];
        this.player.position[2] = save.player.position[2];
        this.player.rotation[1] = save.player.yaw;
        this.player.updateModelMatrix();

        this.survivalSeconds = save.survivalSeconds || 0;

        // ── Vitals ── (assign directly, then push the values to the HUD)
        this.vitals.health = save.vitals.health;
        this.vitals.hunger = save.vitals.hunger;
        this.vitals.thirst = save.vitals.thirst;
        this.vitals.stamina = save.vitals.stamina;
        for (const id of ['health', 'hunger', 'thirst', 'stamina']) {
            this._updateVitalBar(id, this.vitals[id], 100);
        }

        // ── Inventory ──
        for (let i = 0; i < this.inventory.slots.length; i++) {
            const stored = save.inventory.slots[i];
            this.inventory.slots[i] = stored ? { id: stored.id, count: stored.count } : null;
        }
        this.inventory.selectedHotbarIndex = save.inventory.selectedHotbarIndex || 0;

        // ── Raft assembly ──
        Object.assign(this.raftAssembly, {
            framePlaced: !!save.raft.framePlaced,
            floatsPlaced: !!save.raft.floatsPlaced,
            paddlePlaced: !!save.raft.paddlePlaced,
            sailPlaced: !!save.raft.sailPlaced,
            motorPlaced: !!save.raft.motorPlaced,
        });

        // ── Placed structures ──
        const cf = save.structures.campfire;
        this.campfire.isBuilt = !!cf.isBuilt;
        this.campfire.position[0] = cf.position[0];
        this.campfire.position[1] = cf.position[1];
        this.campfire.position[2] = cf.position[2];
        this.campfire.updateModelMatrix();

        const wc = save.structures.waterCollector;
        this.waterCollector.isBuilt = !!wc.isBuilt;
        this.waterCollector.position[0] = wc.position[0];
        this.waterCollector.position[1] = wc.position[1];
        this.waterCollector.position[2] = wc.position[2];
        this.waterCollector.waterStored = wc.waterStored || 0;
        this.waterCollector.updateModelMatrix();

        // ── Blueprints ──
        this.unlockedBlueprints = new Set(save.blueprints || []);

        // ── Environment ──
        if (save.environment) {
            this.dayNight.timeOfDay = save.environment.timeOfDay;
            this.weather.currentWeather = save.environment.weather;
            this.weather.nextWeather = save.environment.weather;
            this.weather.cloudCover = save.environment.cloudCover;
            this.weather.windSpeed = save.environment.windSpeed;
            this.weather.rainIntensity = save.environment.rainIntensity;
        }

        // ── World resources ──
        // Wipe the freshly generated pickups and rebuild only the ones the save
        // still lists, so harvested nodes stay harvested.
        this.resourceManager.delete();
        for (const entry of save.resources || []) {
            const def = getResourceDef(entry.id);
            if (!def) continue;
            const resource = this.resourceManager.createResourceEntity(
                this.gl,
                def,
                [entry.position[0], entry.position[1], entry.position[2]]
            );
            if (entry.rewardType) resource.rewardType = entry.rewardType;
            this.resourceManager.worldResources.push(resource);
        }

        // ── Statistics ──
        if (save.stats) Object.assign(this.stats, save.stats);
        this._wasNight = this.dayNight.timeOfDay > 0.85 || this.dayNight.timeOfDay < 0.1;
        this._wasStorm = this.weather.currentWeather === 'storm';

        this._updateGridInventory();
        this._renderCraftingPanel();
        this._showNotification('💾 Đã tải lại tiến trình đã lưu!');
    }

    /**
     * Advance achievement bookkeeping: edge-triggered world milestones, plus a
     * throttled sweep of the predicates.
     * @param {number} deltaTime
     */
    _updateAchievements(deltaTime) {
        this.stats.survivalSeconds = this.survivalSeconds;

        // Surviving a night = being present when the clock rolls out of the
        // night window back into dawn.
        const isNight = this.dayNight.timeOfDay > 0.85 || this.dayNight.timeOfDay < 0.1;
        if (this._wasNight && !isNight) this.stats.nightsSurvived++;
        this._wasNight = isNight;

        const isStorm = this.weather.currentWeather === 'storm';
        if (this._wasStorm && !isStorm) this.stats.stormsSurvived++;
        this._wasStorm = isStorm;

        if (this.raftAssembly.isComplete() && this.stats.raftCompleted === 0) {
            this.stats.raftCompleted = 1;
        }
        if (this.raftAssembly.motorPlaced && this.stats.motorInstalled === 0) {
            this.stats.motorInstalled = 1;
        }

        this._achievementTimer += deltaTime;
        if (this._achievementTimer >= ACHIEVEMENT_CHECK_INTERVAL) {
            this._achievementTimer = 0;
            this.achievements.evaluate(this.stats);
        }
    }

    update(deltaTime) {
        // v1.0 — achievement toasts and the FPS readout keep running while
        // paused; they are presentation, not simulation.
        this.achievements.update(deltaTime);
        this._updateFpsCounter();
        this._tickSaveStatus(deltaTime);

        // Handle ESC — closes an open settings/achievements panel first, so it
        // never skips a step and drops the player straight back into play.
        if (this.engine.input.isKeyPressed('Escape')) {
            const isInventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
            if (isInventoryOpen) {
                this._closeInventoryMenu();
            } else if (this.menuUI && this.menuUI.isAnyOpen()) {
                this.menuUI.closeAll();
            } else if (this.isPaused) {
                this._resumeGame();
            } else {
                this._pauseGame();
            }
            return;
        }

        // If paused or game over, don't update game logic
        if (this.isPaused || this._isGameOver) return;

        this.time += deltaTime;

        // Refresh the shared wave field before anything that floats updates.
        // render() feeds these very same values to the shader, so what the
        // player sees and what debris rides are one surface, not two.
        this._syncWaveField();

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
            // Ride the actual ocean rather than an unrelated sine — the raft
            // is the one thing the player is staring at during the escape.
            this.raftAssembly.position[1] = WaveField.heightAt(
                this.raftAssembly.position[0], this.raftAssembly.position[2]);
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

            // Update inverse view-projection for sky shader
            this._updateInvViewProj();

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

                    // v1.0 — the run is over: bank the escape achievement and
                    // clear the save so "Chơi tiếp" can't resurrect a finished
                    // game into a victory screen.
                    this.stats.escaped = 1;
                    this.stats.survivalSeconds = this.survivalSeconds;
                    this.achievements.evaluate(this.stats);
                    SaveSystem.deleteSave();

                    // Play victory fanfare
                    this.engine.audio.playVictory();
                }
            }
            return;
        }

        // Increment survived time
        this.survivalSeconds += deltaTime;

        // v1.0 — milestones and background autosave
        this._updateAchievements(deltaTime);
        this._autosaveTimer += deltaTime;
        if (this._autosaveTimer >= AUTOSAVE_INTERVAL) {
            this._saveGame(true);
        }

        // Rescale aspect ratio if canvas resized
        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);

        // ---- Fishing Channel Update (v0.3) ----
        if (this.isFishing) {
            this.fishingTimer -= deltaTime;
            
            // Show prompt with countdown
            const hintEl = this._domCache.pickupHint;
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
                this.stats.fishCaught++;
                this._showNotification('🐟 Bạn đã câu được: Cá Sống!');
                this.engine.audio.playPickup();
                
                const angle = this.player.rotation[1];
                this.particleSystem.emit(
                    [this.player.position[0] + Math.sin(angle) * 3.0, 0.3, this.player.position[2] + Math.cos(angle) * 3.0],
                    ParticleSystem.PRESET.PICKUP
                );
            }
        }

        // Walking is free; holding Shift spends stamina for a short sprint.
        // Read current input rather than last frame's currentSpeed so stamina
        // and movement begin/end together.
        const input = this.engine.input;
        const hasMovementInput = input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')
            || input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')
            || input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')
            || input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight');
        const sprintHeld = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        const isSprinting = !this.isFishing && hasMovementInput && sprintHeld
            && this.vitals.canSprint();
        this.vitals.update(deltaTime, isSprinting);

        this.player.speed = this.isFishing ? 0.0
            : (isSprinting ? PLAYER_BALANCE.sprintSpeed : PLAYER_BALANCE.walkSpeed);

        const prevPlayerPos = [this.player.position[0], this.player.position[1], this.player.position[2]];

        // Apply mouse-look before movement so WASD reacts to the camera heading
        // in the same frame instead of lagging one frame behind a fast turn.
        // Eye/neck heights come from the actual visual mesh because it is much
        // taller than the gameplay collider. The camera is also shifted a small
        // distance toward the face, matching a real pair of eyes instead of the
        // centre of the skull.
        let eyeOffset = this.player.collider.height * 0.42;
        let faceOffset = 0.08;
        this._firstPersonHeadCutFromBase = Infinity;
        const characterMesh = this.characterRenderer && this.characterRenderer.mesh;
        const characterDef = this.characterRenderer && this.characterRenderer.characterDef;
        if (characterMesh && characterMesh.bounds && characterMesh.bounds.min
            && characterMesh.bounds.max && characterDef) {
            const modelMin = (characterDef.offset[1] || 0)
                + characterMesh.bounds.min[1] * characterDef.scale;
            const modelMax = (characterDef.offset[1] || 0)
                + characterMesh.bounds.max[1] * characterDef.scale;
            const modelHeight = modelMax - modelMin;
            const eyeFromBase = modelMin + modelHeight * 0.91;
            eyeOffset = -this.player.collider.height * 0.5 + eyeFromBase;
            faceOffset = modelHeight * 0.09;
            // This low-poly character has an oversized head that extends well
            // below a human-like neck ratio. Cut at the shoulder line so no
            // cheeks/chin can enter the first-person view when looking down.
            this._firstPersonHeadCutFromBase = modelMin + modelHeight * 0.72;
        }
        this.camera.update(this.engine.input, this.player.position, eyeOffset, deltaTime, faceOffset);

        // Update player movements using keyboards and camera reference
        const movementInput = this.isFishing 
            ? { isKeyDown: () => false, isKeyPressed: () => false, keys: {} } 
            : this.engine.input;
        this.player.update(deltaTime, movementInput, this.camera, this.terrain);

        // Collision resolution via CollisionSystem (data-driven, layer-filtered).
        // Creatures are excluded: they already get pushed out of the player in
        // the wildlife loop below, and resolving both directions made the
        // player slide around on its own whenever an animal was nearby.
        if (this.collisionSystem) {
            this.collisionSystem.resolvePlayerCollisions(this.player, this.terrain, CollisionLayers.Creature);
        }

        // Footstep sounds while moving — surface type comes from the biome
        // underfoot, running makes the steps louder and brighter.
        if (this.player.currentSpeed > 0.1) {
            this._footstepTimer += deltaTime;
            const running = this.player.currentSpeed > PLAYER_BALANCE.walkSpeed + 0.1;
            if (this._footstepTimer >= (running ? this._footstepInterval * 0.7 : this._footstepInterval)) {
                this._footstepTimer = 0;
                const px = this.player.position[0];
                const pz = this.player.position[2];
                const h = this.terrain.getHeight(px, pz);
                const biome = this.world.biomeGenerator ? this.world.biomeGenerator.getBiome(px, pz, h) : null;
                this.engine.audio.playFootstep(
                    biomeToSurface(biome),
                    running
                );

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

        // ── v0.5: Creature AI Update ──
        const playerTerrainHeight = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const creature = this.creatures[i];

            // Update AI
            creature.update(deltaTime, this.player.position, this.terrain, playerTerrainHeight);

            // Resolve creature vs environment collision
            if (this.collisionSystem) {
                this.collisionSystem.resolvePlayerCollisions(creature, this.terrain);
            }

            // Creature attack damage to player on contact
            if (creature.attackDamage > 0 &&
                (creature.state === CreatureState.CHASE || creature.state === CreatureState.ATTACK)) {
                const dx = creature.position[0] - this.player.position[0];
                const dz = creature.position[2] - this.player.position[2];
                const dist = Math.sqrt(dx * dx + dz * dz);
                // Vertical gate so a shark at sea level can't bite someone
                // standing on the cliff directly above it.
                const dy = Math.abs(creature.position[1] - this.player.position[1]);
                if (dist <= creature.attackRange && dy <= 2.0) {
                    if (creature.canDamagePlayer()) {
                        this.vitals.heal(-creature.attackDamage);
                        this._showNotification(`💥 Trúng đòn! Mất ${creature.attackDamage} máu!`);
                        this.engine.audio.playPlayerHurt();
                        this.engine.audio.setHealthFraction(this.vitals.health / 100);
                        this._showDamageFlash();

                        // Blood particle effect
                        this.particleSystem.emit(
                            this.player.position,
                            { count: 6, color: [0.8, 0.1, 0.1], colorVariance: 0.1, size: 4, sizeVariance: 2, speed: 2.0, speedVariance: 1.0, lifetime: 0.5, lifetimeVariance: 0.2, gravity: -3.0, spread: 0.8, yBias: 1.5 }
                        );
                    }
                }
            }

            // Remove dead creatures that have faded out
            if (creature.isReadyForCleanup()) {
                this.collisionSystem.unregister(creature);
                creature.delete();
                this.creatures.splice(i, 1);
            }
        }

        // ── v0.5: Combat System Update ──
        this.combatSystem.update(deltaTime);
        this.firstPersonViewModel.update(deltaTime, this.player.currentSpeed > 0.1);
        this._updateFallingTrees(deltaTime);

        // Hold left mouse to keep attacking. CombatSystem owns the cooldown,
        // so each new hit begins only after the previous weapon cycle ends.
        const attackHeld = !!this.engine.input.mouse.buttons[0];
        const combatMenuOpen = !!(this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden'));
        const combatUnavailable = this.isFishing || this.isEscaping || combatMenuOpen
            || this.isPaused || this._isGameOver;

        if (!attackHeld) {
            this._attackHoldBlocked = false;
        } else if (combatUnavailable) {
            // Require a release after closing a menu instead of attacking by surprise.
            this._attackHoldBlocked = true;
        }

        if (attackHeld && !this._attackHoldBlocked && !combatUnavailable
            && this.combatSystem.canAttack()) {
            this._handleCombatInput();
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
            if (scroll !== 0) {
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


        // Re-snap the fixed eye camera after movement/collision updates.
        this.camera.update(null, this.player.position, eyeOffset, deltaTime, faceOffset);

        // Body yaw follows the view even while stationary. This keeps attacks,
        // placement and the escape cinematic aligned with what the player saw.
        this.player.rotation[1] = this._getAimYaw();
        this.player.updateModelMatrix();

        // Update inverse view-projection for sky shader
        this._updateInvViewProj();

        // ---- Campfire proximity (v0.2) ----
        let showCampfirePrompt = false;
        let campfirePromptText = '';
        if (this.campfire.isPlayerNear(this.player.position)) {
            const hasRawFood = this.inventory.hasItem('coconut') || this.inventory.hasItem('raw_fish')
                || this.inventory.hasItem('raw_crab_meat') || this.inventory.hasItem('raw_seagull_meat')
                || this.inventory.hasItem('raw_boar_meat');
            if (hasRawFood) {
                campfirePromptText = '<span class="hint-key">E</span> Nấu thức ăn 🔥';
                showCampfirePrompt = true;
            }
        }

        // Handle campfire cooking via 'E' key (v0.5: also cook new meat types)
        if (showCampfirePrompt && this.engine.input.isKeyPressed('KeyE')) {
            this.engine.input.keys['KeyE'] = false;
            const rawMeats = ['raw_fish', 'raw_crab_meat', 'raw_seagull_meat', 'raw_boar_meat', 'coconut'];
            let cooked = false;
            for (const meat of rawMeats) {
                if (this.inventory.hasItem(meat)) {
                    this.inventory.removeItem(meat, 1);
                    this.inventory.addItem('cooked_meal', 1);
                    this.stats.mealsCooked++;
                    this._showNotification('🔥 Đã nấu: 🍖 Thức Ăn Chín!');
                    this.engine.audio.playCraft();
                    this.particleSystem.emit(
                        [this.campfire.position[0], this.campfire.position[1] + 0.5, this.campfire.position[2]],
                        ParticleSystem.PRESET.CRAFT
                    );
                    cooked = true;
                    break;
                }
            }
            if (!cooked) {
                this._showNotification('❌ Không có nguyên liệu nấu!');
                this.engine.audio.playError();
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
                this.engine.audio.playDrink();
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
            this.engine.audio.playRaftBuild(this.raftAssembly.position);
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
                this.engine.audio.playDrink();
                this.engine.audio.playSplash(this.player.position);
                
                this.particleSystem.emit(
                    [this.player.position[0], this.player.position[1] - 0.5 * this.player.scaleFactor, this.player.position[2]],
                    ParticleSystem.PRESET.SPLASH
                );
            }
        }

        // ---- v0.3: Coastline Fishing Check ----
        let showFishingPrompt = false;
        const fishingTerrainHeight = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
        const hotbarItem = this.inventory.slots[hotbarIdx];
        const hasFishingRod = hotbarItem && hotbarItem.id === 'fishing_rod';

        if (fishingTerrainHeight <= 0.15 && hasFishingRod && !this.isFishing) {
            showFishingPrompt = true;
            if (this.engine.input.isKeyPressed('KeyE')) {
                this.engine.input.keys['KeyE'] = false; // Consume key
                this.isFishing = true;
                this.fishingTimer = 4.0; // 4 seconds channel
                this.engine.audio.playSplash(this.player.position);
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
            this.stats.resourcesPicked++;
            this.engine.audio.playPickup();
            this.particleSystem.emit(this.player.position, ParticleSystem.PRESET.PICKUP);
            this.tutorial.notifyPickup();
        }

        // Update drifting debris system (skip pickup if resource pickup is available)
        const prevDebrisCount = this._getTotalInventoryCount();
        this.debrisManager.update(deltaTime, this.player.position, this.inventory, this.engine.input, this.terrain, this.gl, this.resourceManager.nearestPickable);

        // Check if debris pickup happened
        if (this._getTotalInventoryCount() > prevDebrisCount) {
            this.stats.resourcesPicked++;
            this.engine.audio.playPickup();
            this.particleSystem.emit(this.player.position, ParticleSystem.PRESET.PICKUP);
            this.tutorial.notifyPickup();
        }

        // Override pickup hint text — priority: waterfall > fishing > chest > campfire > water collector > raft > default
        const hintEl = this._domCache.pickupHint;
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

        // ── v0.4: Day/Night Cycle & Weather System ──
        this.weather.update(deltaTime);

        const rotateLight = this._domCache.lightRot ? this._domCache.lightRot.checked : true;
        if (rotateLight) {
            this.dayNight.update(deltaTime);
        }

        const sunDir = this.dayNight.getSunDirection();
        const sunColor = this.dayNight.getSunColor();
        const sunIntensity = this.dayNight.getSunIntensity();

        // ── Sun/Moon position update (relative to camera to keep them in the sky) ──
        const sunAngle = this.dayNight.timeOfDay * Math.PI * 2;
        const celestialDist = 80.0;
        
        // Calculate raw direction of the sun without horizon clamping
        const sunDirRaw = [
            Math.cos(sunAngle) * 0.6,
            Math.sin(sunAngle),
            Math.sin(sunAngle) * 0.6
        ];
        const len = Math.sqrt(sunDirRaw[0]*sunDirRaw[0] + sunDirRaw[1]*sunDirRaw[1] + sunDirRaw[2]*sunDirRaw[2]);
        const sunDirNorm = len > 0.001 ? [sunDirRaw[0]/len, sunDirRaw[1]/len, sunDirRaw[2]/len] : [0, 1, 0];

        // Sun position relative to camera
        this.sunSprite.position[0] = this.camera.position[0] + sunDirNorm[0] * celestialDist;
        this.sunSprite.position[1] = this.camera.position[1] + sunDirNorm[1] * celestialDist;
        this.sunSprite.position[2] = this.camera.position[2] + sunDirNorm[2] * celestialDist;
        this.sunSprite.visible = sunDirNorm[1] > -0.1 && sunIntensity > 0.15;

        // Moon is opposite to the sun
        this.moonSprite.position[0] = this.camera.position[0] - sunDirNorm[0] * celestialDist;
        this.moonSprite.position[1] = this.camera.position[1] - sunDirNorm[1] * celestialDist;
        this.moonSprite.position[2] = this.camera.position[2] - sunDirNorm[2] * celestialDist;
        // Moon is only visible once the sun has dropped below the horizon
        // (sun direction points downward). The previous check simplified to
        // sunDirNorm[1] < 0.1, which left the moon showing during the day.
        this.moonSprite.visible = sunDirNorm[1] < -0.1 && sunIntensity < 0.5;

        // Tint sun color based on time of day
        const sunCol = this.dayNight.getSunColor();
        this.sunSprite.setColor(
            sunCol[0] * 0.9 + 0.1,
            sunCol[1] * 0.8 + 0.2,
            sunCol[2] * 0.6 + 0.1,
            sunCol[0] * 0.6,
            sunCol[1] * 0.4,
            sunCol[2] * 0.15
        );

        const lightningMod = this.weather.getLightningModulation();
        const lightningBoost = 1.0 + lightningMod * 3.0;

        this.dirLight.setDirection(sunDir[0], sunDir[1], sunDir[2]);
        this.dirLight.color[0] = sunColor[0];
        this.dirLight.color[1] = sunColor[1] * (0.8 + lightningMod * 0.2);
        this.dirLight.color[2] = sunColor[2] * (0.7 + lightningMod * 0.3);
        this.dirLight.intensity = sunIntensity * lightningBoost;

        const ambColor = this.dayNight.getAmbientColor();
        this.ambientLight.color[0] = ambColor[0] * (1.0 + lightningMod * 0.5);
        this.ambientLight.color[1] = ambColor[1] * (1.0 + lightningMod * 0.5);
        this.ambientLight.color[2] = ambColor[2] * (1.0 + lightningMod * 0.5);
        this.ambientLight.intensity = this.dayNight.getAmbientIntensity() * (1.0 + lightningMod * 0.3);

        // ── Rain ──
        // Rain is drawn by the dedicated RainSystem as thin falling streaks
        // (GL_LINES) rather than round particle sprites, so it reads like the
        // rain in most survival/open-world games instead of floating dots.
        this.rainSystem.intensity = this.weather.rainIntensity;
        if (this.weather.rainIntensity > 0.01) {
            const windX = this.weather.windDirection[0] * this.weather.windSpeed;
            const windZ = this.weather.windDirection[2] * this.weather.windSpeed;
            this.rainSystem.update(deltaTime, this.player.position, [windX, 0, windZ]);
        }

        // ── Lightning Flash Particles ──
        // Fire exactly once per strike (rising edge) — otherwise the flash
        // stays above threshold for several frames and stacks thunder claps.
        if (this.weather.thunderPending) {
            const flashPos = [
                this.player.position[0] + (Math.random() - 0.5) * 20,
                10 + Math.random() * 10,
                this.player.position[2] + (Math.random() - 0.5) * 20
            ];
            this.particleSystem.emit(flashPos, ParticleSystem.PRESET.LIGHTNING);
            this.engine.audio.playThunder();
        }

        // ── Audio Update (v1.1) ──
        this.engine.audio.setWindIntensity(this.weather.windSpeed / 5.0);
        this.engine.audio.setRainIntensity(this.weather.rainIntensity);
        this.engine.audio.setTimeOfDay(this.dayNight.timeOfDay);
        this.engine.audio.setListener(this.camera.position, this.camera.target);

        // Music mood: danger when a predator is chasing, night when the sun is
        // down, calm for everything else.
        const closestThreat = this._nearestThreatDistance();
        if (closestThreat < 12) {
            this.engine.audio.setMusicMood('danger');
        } else if (this.dayNight.timeOfDay > 0.82 || this.dayNight.timeOfDay < 0.12) {
            this.engine.audio.setMusicMood('night');
        } else {
            this.engine.audio.setMusicMood('calm');
        }

        // Move waterfall emitter if present
        if (this.waterfall) {
            this.engine.audio.setEmitterPosition('waterfall', this.waterfall.position);
        }

        // Keep heartbeat in sync even when not injured
        this.engine.audio.setHealthFraction(this.vitals.health / 100);

        this.engine.audio.update(deltaTime);

        // ── v1.1 HUD Widgets ──
        this._updateHUDWidgets(deltaTime);

        // Push debug info — skipped entirely while the panel is hidden, since
        // these writes forced layout work every frame for nothing.
        this._updateDebugPanel();
    }

    /**
     * Update the v1.1 HUD widgets: time/weather, compass, crosshair and hit
     * marker. Runs every frame but skips DOM writes when the panel is hidden.
     */
    _updateHUDWidgets(deltaTime) {
        const dom = this._domCache;
        if (!dom) return;

        // ── Time/Weather Widget ──
        if (dom.timeWeatherWidget && dom.twClock && dom.twWeather && dom.twDay) {
            dom.timeWeatherWidget.classList.remove('hidden');

            // Convert normalised time (0..1) to HH:MM
            const hours24 = this.dayNight.timeOfDay * 24;
            const hh = Math.floor(hours24);
            const mm = Math.floor((hours24 - hh) * 60);
            dom.twClock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

            // Weather icon
            const weather = this.weather.currentWeather;
            const icons = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️' };
            dom.twWeather.textContent = icons[weather] || '☀️';

            // Day counter: each full cycle of timeOfDay (0→1) is one day.
            const dayIndex = Math.floor(this.survivalSeconds * this.dayNight.daySpeed);
            const displayDay = dayIndex + 1;
            dom.twDay.textContent = `Ngày ${displayDay}`;
        }

        // ── Compass Bar ──
        this._updateCompass(deltaTime);

        // ── Crosshair: show when a weapon is equipped ──
        if (dom.crosshair) {
            const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
            const equipped = this.inventory.slots[hotbarIdx];
            const isWeapon = equipped && (
                equipped.id === 'spear' || equipped.id === 'bow' ||
                (getResourceDef(equipped.id) || {}).weaponType
            );
            dom.crosshair.classList.toggle('hidden', !isWeapon || this.isPaused || this.isEscaping);
        }
    }

    /**
     * Build the compass tick strip. Runs once — the strip is then moved purely
     * by `transform`, which is what makes turning smooth. The old version
     * re-sliced a string of characters every frame, so the compass could only
     * step in whole-character jumps (~2.7° each) and multi-letter labels like
     * "NE" got cut in half at the window edge, showing a bare "E".
     *
     * Positions are in strip-space pixels at a fixed COMPASS_PX_PER_DEG, so a
     * narrow viewport shows less arc at the same scale rather than squashing
     * it. Coverage runs -90°..450° because the visible window straddles 0/360.
     */
    _buildCompassStrip() {
        const strip = this._domCache && this._domCache.compassStrip;
        if (!strip || strip.childElementCount > 0) return;

        const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        let html = '';

        for (let deg = -90; deg <= 450; deg += 15) {
            const x = (deg * COMPASS_PX_PER_DEG).toFixed(2);
            if (deg % 45 !== 0) {
                html += `<span class="compass-tick" style="left:${x}px"></span>`;
                continue;
            }
            const label = labels[(((deg / 45) % 8) + 8) % 8];
            const north = label === 'N' ? ' north' : '';
            html += `<span class="compass-tick major${north}" style="left:${x}px"></span>`;
            html += `<span class="compass-label${north}" style="left:${x}px">${label}</span>`;
        }

        strip.innerHTML = html;
    }

    /**
     * Scroll the compass to the camera's bearing.
     *
     * Heading comes from the camera, not `player.rotation[1]`: the player's yaw
     * is only assigned while WASD is held, and it snaps straight to the movement
     * angle. Driving the compass from it meant looking around moved nothing at
     * all, and a strafe flicked the needle 90° in one frame.
     */
    _updateCompass(deltaTime) {
        const dom = this._domCache;
        const bar = dom && dom.compassBar;
        if (!bar || !dom.compassStrip) return;

        bar.classList.remove('hidden');
        this._buildCompassStrip();

        // clientWidth forces a layout flush, so only re-measure when the window
        // actually changed size.
        if (this._compassHalfWidth === undefined || this._compassWinW !== window.innerWidth) {
            this._compassWinW = window.innerWidth;
            this._compassHalfWidth = bar.clientWidth / 2;
        }
        const half = this._compassHalfWidth;

        const dx = this.camera.target[0] - this.camera.position[0];
        const dz = this.camera.target[2] - this.camera.position[2];
        const target = (((Math.atan2(dx, dz) * 180 / Math.PI) % 360) + 360) % 360;

        // Ease along the shortest arc so mouse-look micro-jitter doesn't shake
        // the strip. Exponential decay keeps it frame-rate independent.
        if (this._compassHeading === undefined) {
            this._compassHeading = target;
        } else {
            let delta = target - this._compassHeading;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            const k = 1 - Math.exp(-deltaTime * 16);
            this._compassHeading = (((this._compassHeading + delta * k) % 360) + 360) % 360;
        }
        const heading = this._compassHeading;

        const shift = half - heading * COMPASS_PX_PER_DEG;
        dom.compassStrip.style.transform = `translate3d(${shift.toFixed(2)}px, 0, 0)`;

        if (!dom.compassMarkers) return;

        const markers = [];
        if (this.campfire && this.campfire.isBuilt) {
            markers.push({ id: 'campfire', pos: this.campfire.position, icon: '🔥' });
        }
        if (this.raftAssembly) {
            markers.push({ id: 'raft', pos: this.raftAssembly.position, icon: '⛵' });
        }

        // Reuse marker nodes. Rebuilding innerHTML every frame re-parsed and
        // re-laid out the whole bar, which is exactly the kind of per-frame
        // work that makes a HUD element stutter.
        if (!this._compassMarkerEls) this._compassMarkerEls = new Map();
        const pool = this._compassMarkerEls;
        const live = new Set();
        // Same scale as the ticks, so an icon now sits over the bearing it means.
        const maxVisible = half / COMPASS_PX_PER_DEG + 4;

        for (const m of markers) {
            let el = pool.get(m.id);
            if (!el) {
                el = document.createElement('div');
                el.className = 'compass-marker';
                el.textContent = m.icon;
                dom.compassMarkers.appendChild(el);
                pool.set(m.id, el);
            }
            live.add(m.id);

            const mdx = m.pos[0] - this.player.position[0];
            const mdz = m.pos[2] - this.player.position[2];
            const bearing = (((Math.atan2(mdx, mdz) * 180 / Math.PI) % 360) + 360) % 360;
            let diff = bearing - heading;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            if (Math.abs(diff) > maxVisible) {
                el.style.visibility = 'hidden';
                continue;
            }
            el.style.visibility = 'visible';
            const px = half + diff * COMPASS_PX_PER_DEG;
            // calc() resolves the -50% against the icon's own width, keeping it
            // centred on its bearing while transform does the positioning.
            el.style.transform = `translateX(calc(${px.toFixed(2)}px - 50%))`;
        }

        for (const [id, el] of pool) {
            if (!live.has(id)) el.style.visibility = 'hidden';
        }
    }

    /** Show the crosshair hit marker (brief flash). */
    _showHitMarker(killed) {
        const el = this._domCache && this._domCache.hitMarker;
        if (!el) return;
        el.classList.remove('hidden', 'hit-marker-show', 'hit-marker-kill');
        void el.offsetWidth;
        el.classList.add('hit-marker-show');
        if (killed) el.classList.add('hit-marker-kill');
        if (this._hitMarkerTimeout) clearTimeout(this._hitMarkerTimeout);
        this._hitMarkerTimeout = setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('hit-marker-show', 'hit-marker-kill');
        }, 300);
    }

    /**
     * Refresh the debug panel readouts. No-op when the panel is collapsed.
     */
    _updateDebugPanel() {
        const dom = this._domCache;
        if (dom.debugPanel && dom.debugPanel.classList.contains('hidden')) return;

        if (dom.lightDir) {
            const dir = this.dirLight.direction;
            dom.lightDir.textContent = `X: ${dir[0].toFixed(2)}, Y: ${dir[1].toFixed(2)}, Z: ${dir[2].toFixed(2)}`;
        }
        if (dom.timeLabel) dom.timeLabel.textContent = this.dayNight.getTimeLabel();
        if (dom.timeOfDay) dom.timeOfDay.textContent = (this.dayNight.timeOfDay * 24).toFixed(1) + 'h';
        if (dom.weatherLabel) dom.weatherLabel.textContent = this.weather.getWeatherLabel();

        // v1.0 performance rows
        if (dom.drawCalls) dom.drawCalls.textContent = this._drawCalls.toString();
        if (dom.culled) {
            dom.culled.textContent = this.frustum.enabled
                ? `${this.frustum.culledCount}/${this.frustum.testedCount}`
                : 'Tắt';
        }
        if (dom.resolution) {
            dom.resolution.textContent = `${this.gl.canvas.width}×${this.gl.canvas.height}`;
        }
        if (dom.postFx) {
            if (!this.postFx.available) dom.postFx.textContent = 'Không khả dụng';
            else if (!this.postFx.enabled) dom.postFx.textContent = 'Tắt';
            else dom.postFx.textContent = this.engine.settings.get('bloom') ? 'Bloom + Vignette' : 'Vignette';
        }
    }

    /**
     * Update the standalone FPS readout, colour-coded by frame rate. Reads the
     * value the GameLoop already computes rather than measuring again.
     */
    _updateFpsCounter() {
        const el = this._domCache.fpsCounter;
        if (!el || el.classList.contains('hidden')) return;

        const fps = this.engine.loop.fps;
        el.textContent = `${fps} FPS`;
        el.classList.toggle('warn', fps < 45 && fps >= 25);
        el.classList.toggle('bad', fps < 25);
    }

    /** Clear the pause-menu save message after a few seconds. */
    _tickSaveStatus(deltaTime) {
        if (this._saveStatusTimer <= 0) return;
        this._saveStatusTimer -= deltaTime;
        if (this._saveStatusTimer <= 0 && this._domCache.saveStatus) {
            this._domCache.saveStatus.textContent = '';
            this._domCache.saveStatus.classList.remove('error');
        }
    }

    /**
     * Push this frame's weather into the shared wave field.
     *
     * Wind now steers the waves: WeatherSystem has always carried a direction,
     * but the ocean used to ignore it and run a fixed diagonal regardless of
     * the storm. Attenuation keeps swell off the beach so it cannot punch up
     * through the sand.
     */
    _syncWaveField() {
        const island = this.world.terrainGenerator.island;
        const animate = this._domCache.water ? this._domCache.water.checked : true;

        WaveField.sync(
            this.time,
            this.weather.getWaveAmplitudeMultiplier(),
            this.weather.getWaveSpeedMultiplier(),
            this.weather.windDirection,
            island.innerRadius - 2,
            island.radius + 5,
            animate
        );
    }

    render() {
        const gl = this.gl;

        // Display controls come from cached checkbox references (v1.0) — the
        // old per-frame getElementById calls were pure overhead.
        const drawWireframe = this._domCache.wireframe ? this._domCache.wireframe.checked : false;
        const drawMode = drawWireframe ? gl.LINES : gl.TRIANGLES;
        const animateWater = this._domCache.water ? this._domCache.water.checked : true;

        // v1.0 — refresh culling planes for this frame, then route the scene
        // through the offscreen target when post-processing is on.
        this.frustum.update(this.camera.projectionMatrix, this.camera.viewMatrix);
        this._drawCalls = 0;

        this.postFx.resize(gl.canvas.width, gl.canvas.height);
        this.postFx.beginScene();

        // Sky colors from day/night cycle (used by water shader for reflections)
        const skyColors = this.dayNight.getSkyColors();
        const cloudCover = this.weather.cloudCover;
        const weatherDim = 1.0 - cloudCover * 0.3;

        // Always clear the depth buffer so geometry drawn after the sky pass
        // is not discarded by stale depth values from the previous frame.
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // v1.1 — Procedural sky dome pass (shared SkyShader with MainMenuScene).
        // Runs first with depth writes OFF so it never occludes the world.
        this._renderSky();

        // v0.4: Dynamic sky color based on day/night and weather — FALLBACK
        // Only used if the sky shader failed to compile.
        if (!this.skyShader) {
            const skyTop = skyColors.top;
            gl.clearColor(
                skyTop[0] * weatherDim,
                skyTop[1] * weatherDim,
                skyTop[2] * weatherDim,
                1.0
            );
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

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
        this.basicShader.setUniform3fv('uPointLightPosition', this.campfire.getLightPosition());
        this.basicShader.setUniform3fv('uPointLightColor', this.campfire.lightColor);
        this.basicShader.setUniform1f(
            'uPointLightIntensity',
            this.campfire.isBuilt ? this.campfire.lightIntensity : 0.0
        );
        this.basicShader.setUniform1f('uPointLightRange', this.campfire.lightRange);
        this.basicShader.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);

        // 1. Draw Terrain
        this.terrain.draw(this.basicShader);

        // Draw the body below the eyes. Only the head is clipped during normal
        // FPS play; the escape cinematic still draws the complete character.
        const playerRenderPos = [this.player.position[0], this.player.position[1] - this.player.collider.height * 0.5, this.player.position[2]];
        const headCutoff = this.isEscaping || !Number.isFinite(this._firstPersonHeadCutFromBase)
            ? 1000000.0
            : playerRenderPos[1] + this._firstPersonHeadCutFromBase;
        this.basicShader.setUniform1f('uFirstPersonHeadCutoff', headCutoff);
        Mat4.identity(this.tempMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, playerRenderPos);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, this.player.rotation[1]);
        this.characterRenderer.draw(this.basicShader, this.tempMatrix, drawMode);
        this.basicShader.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);

        // 5. Draw World Resources — pickups are small, so a 1.5m bound is
        //    generous enough to avoid popping at the screen edge.
        for (const resource of this.resourceManager.worldResources) {
            if (!this._isVisible(resource.position, 1.5)) continue;
            resource.draw(this.basicShader, drawMode);
            this._drawCalls++;
        }

        // 6. Draw Drifting Debris (on water surface, before water pass)
        this.debrisManager.drawAll(this.basicShader, drawMode);

        // 7. Draw solid components of the Raft Assembly
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, false);
        }

        // Draw environment objects (trees, bushes, rocks). This is by far the
        // largest batch, so it's where frustum + distance culling pays off.
        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                const cullPosition = entity.cullingCenter || entity.position;
                const radius = entity.cullingRadius
                    || ((entity.collisionRadius || 1.0) * 2.0 + 1.0);
                if (!this._isVisible(cullPosition, radius)) continue;
                entity.draw(this.basicShader, drawMode);
                this._drawCalls++;
            }
        }

        // 7.5 Draw Creatures (v0.5)
        for (const creature of this.creatures) {
            if (!this._isVisible(creature.position, 2.0)) continue;
            creature.draw(this.basicShader, drawMode);
            this._drawCalls++;
        }

        // 8. Draw Campfire (v0.2)
        this.campfire.draw(this.basicShader, drawMode);

        // 9. Draw Water Collector (v0.2)
        this.waterCollector.draw(this.basicShader, drawMode);

        // 9.5 Draw Waterfall rock cliff (opaque, solid pass)
        if (this.waterfall) {
            this.waterfall.drawSolid(this.basicShader, drawMode);
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

        // Wave uniforms come from the shared field, not from weather directly,
        // so the drawn surface is bit-for-bit the one gameplay floats things on.
        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', animateWater ? 1.0 : 0.0);
        this.waterShader.setUniform1f('uWaveAmplitude', this.weather.getWaveAmplitudeMultiplier());
        this.waterShader.setUniform1f('uWaveSpeed', this.weather.getWaveSpeedMultiplier());
        this.waterShader.setUniform1f('uWaveAttenStart', WaveField.attenStart);
        this.waterShader.setUniform1f('uWaveAttenEnd', WaveField.attenEnd);
        this.waterShader.setUniform2f('uWaveHeading', WaveField.heading[0], WaveField.heading[1]);

        // Fresnel needs the sky it is reflecting; use the same horizon tint the
        // day/night cycle is painting behind the island.
        const horizonColor = skyColors.horizon;
        this.waterShader.setUniform3fv('uHorizonColor', [
            horizonColor[0] * weatherDim,
            horizonColor[1] * weatherDim,
            horizonColor[2] * weatherDim
        ]);
        this.waterShader.setUniform3fv('uShallowColor', [0.24, 0.66, 0.62]);

        // Ripples are subtler than the menu's: the gameplay camera sits close
        // to the surface, where the menu's strength reads as boiling.
        this.waterShader.setUniform1f('uDetailStrength', animateWater ? 0.6 : 0.0);
        this.waterShader.setUniform1f('uFoamStrength', 1.0);

        // Whitecaps are wind-driven: a clear day (windSpeed ~0.5) breaks
        // nothing, a storm (~3.5+) breaks everywhere.
        const whitecaps = Math.min(1.0, Math.max(0.0, (this.weather.windSpeed - 1.0) / 2.0));
        this.waterShader.setUniform1f('uWhitecaps', animateWater ? whitecaps : 0.0);

        // v0.4: Lightning flash for water reflections
        this.waterShader.setUniform1f('uLightningFlash', this.weather.getLightningModulation());

        // Sun uniforms for water glitter (dynamic, matching sky shader)
        const sunDir = this.dayNight.getSunDirection();
        const sunCol = this.dayNight.getSunColor();
        this.waterShader.setUniform3fv('uSunDirection', sunDir);
        this.waterShader.setUniform3fv('uSunColor', sunCol);
        this.waterShader.setUniform1f('uSunGlitter', 0.6);

        // Draw Water Grid
        this.water.draw(this.waterShader);

        // Restore default WebGL drawing state
        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);

        // 10. Draw Particles (additive blending, on top)
        this.particleSystem.draw(this.camera);

        // 10.1 Draw Rain streaks (GL_LINES, alpha-blended)
        this.rainSystem.draw(this.camera);

        // 10.5 v0.4→v2.0: Sun & Moon are now rendered procedurally by the sky
        // shader. Billboard sprites are only drawn as a fallback when the sky
        // shader failed to compile.
        if (!this.skyShader) {
            this.unlitShader.use();
            this.sunSprite.draw(this.unlitShader, this.camera.viewMatrix, this.camera.projectionMatrix, this.camera.position, this.tempMatrix);
            this.moonSprite.draw(this.unlitShader, this.camera.viewMatrix, this.camera.projectionMatrix, this.camera.position, this.tempMatrix);
        }

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

        // Camera-space arms and axe are the final 3D layer, so they remain
        // readable against the world without clipping through nearby props.
        const equippedItem = this.inventory.getEquippedItem();
        if (!this.isEscaping && equippedItem && equippedItem.id === 'stone_axe') {
            this.firstPersonViewModel.draw(this.basicShader, this.camera.projectionMatrix, drawMode);
        }

        // 12. v1.0 — resolve the offscreen target to the screen with bloom and
        // vignette. A no-op when post-processing is disabled.
        this._compositeFrame();
    }

    /**
     * Run the post-processing composite, grading the image from the current
     * time of day so nights read cooler and sunsets warmer.
     */
    _compositeFrame() {
        if (!this.postFx.enabled) return;

        const settings = this.engine.settings;
        const sunColor = this.dayNight.getSunColor();
        const sunIntensity = this.dayNight.getSunIntensity();

        // Blend the sun's hue in gently — a full tint would recolour the whole
        // frame, which reads as a broken white balance rather than a mood.
        const tintStrength = 0.12;
        const tint = [
            1.0 + (sunColor[0] - 1.0) * tintStrength,
            1.0 + (sunColor[1] - 1.0) * tintStrength,
            1.0 + (sunColor[2] - 1.0) * tintStrength,
        ];

        // Lightning briefly lifts exposure so strikes wash over the frame.
        const lightning = this.weather.getLightningModulation();
        const exposure = 1.0 + lightning * 0.35;

        // Bloom is strongest at dawn/dusk when the sun sits low and bright.
        const bloomBoost = 0.75 + (1.0 - sunIntensity) * 0.35;

        this.postFx.composite({
            bloom: settings.get('bloom'),
            bloomIntensity: settings.get('bloomIntensity') * bloomBoost,
            bloomThreshold: 0.8,
            vignette: settings.get('vignette') ? 0.35 : 0.0,
            exposure,
            tint,
            iterations: 2,
        });
    }

    /**
     * Frustum + draw-distance test used by the render loop.
     * @param {number[]|Float32Array} position
     * @param {number} radius Bounding sphere radius
     * @returns {boolean}
     */
    _isVisible(position, radius) {
        return this.frustum.isVisible(position, radius, this.camera.position, this._viewDistance);
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
        this.engine.audio.setDucked(true);
    }

    _resumeGame() {
        if (!this.isPaused) return;
        this.isPaused = false;

        // Hide pause menu
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');
        this.engine.audio.setDucked(false);

        // Re-lock mouse cursor
        try {
            this.engine.input.canvas.requestPointerLock();
        } catch (e) {
            console.warn('GameScene: requestPointerLock failed', e);
        }
    }

    _updatePauseSoundButton(isMuted) {
        if (!this._pauseSoundBtn) return;

        this._pauseSoundBtn.innerHTML =
            `<svg class="ui-icon" aria-hidden="true"><use href="#i-volume${isMuted ? '-off' : ''}"/></svg>` +
            `<span class="btn-text">ÂM THANH: ${isMuted ? 'TẮT' : 'BẬT'}</span>`;
        this._pauseSoundBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
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

            // v0.5: Ammo counter — show arrow count when bow is equipped
            const equippedSlot = this.inventory.slots[20 + this.inventory.selectedHotbarIndex];
            if (equippedSlot && equippedSlot.id === 'bow') {
                const arrowCount = this.inventory.getCount('arrow');
                // Find or create ammo indicator
                let ammoEl = document.getElementById('ammo-counter');
                if (!ammoEl) {
                    ammoEl = document.createElement('div');
                    ammoEl.id = 'ammo-counter';
                    ammoEl.className = 'ammo-counter';
                    hotbarEl.parentNode.appendChild(ammoEl);
                }
                ammoEl.innerHTML = `➵ ${arrowCount}`;
                ammoEl.style.display = '';
            } else {
                const ammoEl = document.getElementById('ammo-counter');
                if (ammoEl) ammoEl.style.display = 'none';
            }
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
                if (this._consumeItemAt(idx)) return;

                if (resDef && (item.id === 'campfire' || item.id === 'water_collector')) {
                    // Place structures
                    const hotbarOffset = idx - 20;
                    if (hotbarOffset >= 0 && hotbarOffset < 8) {
                        this.inventory.selectedHotbarIndex = hotbarOffset;
                    }
                    this._closeInventoryMenu();
                    this._showNotification(`🔧 Đã chọn ${resDef.name}. Nhấn Q để đặt!`);
                }
            });

            // Double click to consume
            slot.addEventListener('dblclick', () => {
                const indexAttr = slot.getAttribute('data-index');
                if (indexAttr === null) return;
                
                const idx = parseInt(indexAttr);
                this._consumeItemAt(idx);
            });
        });
    }

    /**
     * Consume the item in a slot, applying its `vitalEffect` from the resource
     * database.
     *
     * Every consume entry point (Q, right-click, double-click) routes through
     * here. They each used to carry their own hardcoded id list, which is why a
     * crafted Bandage could be eaten with Q but did nothing on right-click.
     *
     * @param {number} idx Inventory slot index
     * @returns {boolean} True when something was actually consumed.
     */
    _consumeItemAt(idx) {
        const item = this.inventory.slots[idx];
        if (!item) return false;

        const resDef = getResourceDef(item.id);
        const effect = resDef && resDef.consumable ? resDef.vitalEffect : null;
        if (!effect) return false;

        const action = VITAL_ACTIONS[effect.type];
        if (!action) {
            console.warn(`GameScene: '${item.id}' has an unknown vitalEffect type '${effect.type}'.`);
            return false;
        }

        this.inventory.removeItemAt(idx, 1);
        this.vitals[action.method](effect.amount);
        this._showNotification(`${resDef.icon} ${action.verb} ${resDef.name}! ${action.label} +${effect.amount}`);

        // Different consumables get their own cue so the player doesn't hear
        // the same generic chime when eating, drinking or healing.
        if (effect.type === 'hunger') this.engine.audio.playEat();
        else if (effect.type === 'thirst') this.engine.audio.playDrink();
        else if (effect.type === 'health') this.engine.audio.playHeal();

        this.engine.audio.setHealthFraction(this.vitals.health / 100);
        // Redraw so the slot count drops immediately. Previously the stack only
        // refreshed on the next hotbar change, so eating looked like a no-op.
        this._updateGridInventory();
        return true;
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
            this.engine.audio.playError();
            return;
        }

        const resDef = getResourceDef(activeItem.id);
        if (!resDef) return;

        if (resDef.consumable) {
            if (this._consumeItemAt(activeIdx)) return;

            if (activeItem.id === 'campfire') {
                this._placeStructure('campfire');
            } else if (activeItem.id === 'water_collector') {
                this._placeStructure('water_collector');
            }
        } else {
            if (activeItem.id === 'stone_axe') {
                this._showNotification('🪓 Đang trang bị Rìu Đá! Nhấn chuột trái để chặt cây hoặc tấn công.');
            } else {
                this._showNotification(`📦 Không thể sử dụng trực tiếp ${resDef.name}!`);
            }
        }
    }

    _placeStructure(type) {
        // Guard: only one instance of each structure exists. Re-placing an
        // already-built structure would silently relocate it and consume the
        // crafted item, so refuse and tell the player.
        if (type === 'campfire' && this.campfire && this.campfire.isBuilt) {
            this._showNotification('🔥 Đã có Lửa Trại rồi! Không thể đặt thêm.');
            this.engine.audio.playError();
            return;
        }
        if (type === 'water_collector' && this.waterCollector && this.waterCollector.isBuilt) {
            this._showNotification('💧 Đã có Bẫy Nước rồi! Không thể đặt thêm.');
            this.engine.audio.playError();
            return;
        }

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

        const buildPos = [clampedX, placeY + 0.5, clampedZ];

        if (type === 'campfire') {
            this.campfire.position[0] = clampedX;
            this.campfire.position[1] = placeY;
            this.campfire.position[2] = clampedZ;
            this.campfire.isBuilt = true;
            this.campfire.updateModelMatrix();
            this.inventory.removeItemAt(activeIdx, 1);
            this._showNotification('🔥 Đã đặt Lửa Trại! Đến gần để nấu ăn.');
            this.engine.audio.addEmitter('campfire', 'campfire', buildPos, true);
        } else if (type === 'water_collector') {
            this.waterCollector.position[0] = clampedX;
            this.waterCollector.position[1] = placeY;
            this.waterCollector.position[2] = clampedZ;
            this.waterCollector.isBuilt = true;
            this.waterCollector.updateModelMatrix();
            this.inventory.removeItemAt(activeIdx, 1);
            this._showNotification('💧 Đã đặt Bẫy Nước Mưa! Nước hứng tự động.');
        }

        this.engine.audio.playRaftBuild(buildPos);
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
            this.engine.audio.playOpenPanel();
            this.engine.audio.setDucked(true);
        } else {
            this._closeInventoryMenu();
        }
    }

    _closeInventoryMenu() {
        if (this.inventoryMenu) {
            this.inventoryMenu.classList.add('hidden');
            this.engine.audio.playClosePanel();
            this.engine.audio.setDucked(false);

            // Re-lock mouse cursor
            try {
                this.engine.input.canvas.requestPointerLock();
            } catch (e) {
                console.warn('GameScene: requestPointerLock failed', e);
            }
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
            this.stats.itemsCrafted++;
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
            this.engine.audio.playError();
        }
    }

    _openTreasureChest(chest) {
        chest.collect();
        this.stats.chestsOpened++;
        this.engine.audio.playPickup();

        this.particleSystem.emit(
            [chest.position[0], chest.position[1] + 0.5, chest.position[2]],
            ParticleSystem.PRESET.CRAFT
        );

        // Reward type is tagged at spawn from the chest's quadrant. Fall back to
        // classifying by position only if the tag is missing.
        const rewardType = chest.rewardType || this._quadrantRewardType({
            sx: chest.position[0] >= 0 ? 1 : -1,
            sz: chest.position[2] >= 0 ? 1 : -1,
        });

        let msg = '';
        if (rewardType === 'fishing') {
            this.unlockedBlueprints.add('fishing_rod_blueprint');
            this.inventory.addItem('rope', 4);
            msg = 'Bản Thiết Kế Cần Câu 🎣 + 4 Dây Thừng!';
        } else if (rewardType === 'sail') {
            this.unlockedBlueprints.add('sail_raft_blueprint');
            this.inventory.addItem('wood', 5);
            this.inventory.addItem('rope', 5);
            msg = 'Bản Thiết Kế Cánh Buồm ⛵ + 5 Gỗ & 5 Dây!';
        } else if (rewardType === 'motor') {
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
     * Map a placement quadrant { sx, sz } to a chest reward type. Mirrors the
     * quadrant list in EnvironmentBuilder._placeLandmarks so each quadrant
     * grants a distinct, deterministic reward.
     *   (-x, +z) → fishing   (+x, -z) → sail
     *   (+x, +z) → motor     (-x, -z) → materials (default)
     * @param {{sx:number, sz:number}|null} quadrant
     * @returns {'fishing'|'sail'|'motor'|'materials'}
     */
    _quadrantRewardType(quadrant) {
        if (!quadrant) return 'materials';
        const { sx, sz } = quadrant;
        if (sx < 0 && sz > 0) return 'fishing';
        if (sx > 0 && sz < 0) return 'sail';
        if (sx > 0 && sz > 0) return 'motor';
        return 'materials';
    }

    /**
     * Show game over screen (v0.2)
     */
    _showGameOver() {
        this._isGameOver = true;

        // v1.0 — a dead run isn't resumable, so drop the save rather than
        // letting "Chơi tiếp" drop the player back at 0 HP.
        SaveSystem.deleteSave();
        this.stats.survivalSeconds = this.survivalSeconds;
        this.achievements.evaluate(this.stats);

        // Death SFX + duck the world so the funeral figure lands
        this.engine.audio.playDeath();
        this.engine.audio.setDucked(true);
        this.engine.audio.setHealthFraction(0);
        this.engine.audio.setMusicMood('calm');

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
        const container = document.getElementById('pickup-notification');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerHTML = message;
        container.appendChild(toast);

        // Cap visible toasts at 4 — oldest are removed first so the latest
        // message is always on top and nothing overflows the viewport.
        while (container.children.length > 4) {
            container.removeChild(container.firstChild);
        }

        // Remove the DOM node after the CSS animation completes (2.5s in +
        // 0.3s fade-out = ~3s total).
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3100);
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

    // ── v0.5: Wildlife Spawning Methods ──

    /**
     * Spawn crabs along the shoreline
     */
    _spawnCrabs() {
        const gl = this.gl;
        const island = this.world.terrainGenerator.island;
        const count = 12;
        let spawned = 0;

        for (let i = 0; i < count * 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = island.innerRadius + Math.random() * (island.radius - island.innerRadius);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.terrain.getHeight(x, z);

            // Only spawn in beach zone
            if (y > 0.0 && y <= 0.35) {
                const crab = new Crab(gl, [x, y, z], this.engine.assets.getModel('creature:crab'));
                crab.onDeath = (lootTable, pos) => this._creatureDropLoot(lootTable, pos);
                this.creatures.push(crab);
                spawned++;
                if (spawned >= count) break;
            }
        }
        console.log(`GameScene: Spawned ${spawned} crabs`);
    }

    /**
     * Spawn seagulls circling above the island
     */
    _spawnSeagulls() {
        const gl = this.gl;
        const count = 4;
        const island = this.world.terrainGenerator.island;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * island.innerRadius * 0.6;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const altitude = 10 + Math.random() * 5;

            const seagull = new Seagull(
                gl,
                [x, altitude, z],
                this.engine.assets.getModel('creature:seagull')
            );
            seagull.onDeath = (lootTable, pos) => this._creatureDropLoot(lootTable, pos);
            this.creatures.push(seagull);
        }
        console.log(`GameScene: Spawned ${count} seagulls`);
    }

    /**
     * Spawn boars in forest biomes
     */
    _spawnBoars() {
        const gl = this.gl;
        const count = 5;
        let spawned = 0;
        const island = this.world.terrainGenerator.island;

        for (let i = 0; i < count * 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = island.innerRadius * 0.3 + Math.random() * island.innerRadius * 0.5;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.terrain.getHeight(x, z);

            if (y <= 0.3) continue;

            // Forest biome only. The biome generator randomizes its sector
            // orientation per seed, so the old `x > 2.0` guess put boars in
            // whatever biome happened to sit east of the origin.
            const biomeGen = this.world.biomeGenerator;
            if (biomeGen && biomeGen.getBiome(x, z, y) !== BiomeType.FOREST) continue;

            // Prevent overlap with existing boars
            let tooClose = false;
            for (const creature of this.creatures) {
                if (creature instanceof Boar) {
                    const dx = creature.position[0] - x;
                    const dz = creature.position[2] - z;
                    if (dx * dx + dz * dz < 100) { tooClose = true; break; }
                }
            }
            if (tooClose) continue;

            const boar = new Boar(gl, [x, y, z], this.engine.assets.getModel('creature:boar'));
            boar.onDeath = (lootTable, pos) => this._creatureDropLoot(lootTable, pos);
            this.creatures.push(boar);
            spawned++;
            if (spawned >= count) break;
        }
        console.log(`GameScene: Spawned ${spawned} boars`);
    }

    /**
     * Spawn sharks in deep water around the island
     */
    _spawnSharks() {
        const gl = this.gl;
        const count = 3;
        const island = this.world.terrainGenerator.island;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = island.radius + 5 + Math.random() * 8;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const waterY = 0.1; // Water surface level

            const shark = new Shark(gl, [x, waterY, z], this.engine.assets.getModel('creature:shark'));
            shark.onDeath = (lootTable, pos) => this._creatureDropLoot(lootTable, pos);
            this.creatures.push(shark);
        }
        console.log(`GameScene: Spawned ${count} sharks`);
    }

    /**
     * Called when a creature dies — spawns loot as world resources
     * @param {Array<{resourceId: string, count: number, chance: number}>} lootTable
     * @param {number[]} position
     */
    _creatureDropLoot(lootTable, position) {
        for (const entry of lootTable) {
            if (Math.random() > entry.chance) continue;

            // Drop one pickup per unit of `count`, scattered slightly so the
            // stacks don't render inside each other.
            const count = entry.count || 1;
            for (let i = 0; i < count; i++) {
                const offsetX = count > 1 ? (Math.random() - 0.5) * 1.2 : 0;
                const offsetZ = count > 1 ? (Math.random() - 0.5) * 1.2 : 0;
                this.resourceManager.spawnResource(
                    this.gl, entry.resourceId,
                    position[0] + offsetX, position[2] + offsetZ,
                    this.terrain,
                    { allowWater: true } // crabs die on the beach, sharks at sea
                );
            }
        }
    }

    /**
     * Handle left-click attack input
     * Reads equipped hotbar item and delegates to CombatSystem
     */
    _handleCombatInput() {
        if (this._isGameOver || this.isPaused) return;

        const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
        const equippedItem = this.inventory.slots[hotbarIdx];

        // Aim along the camera heading rather than player.rotation — the player
        // model only turns while walking, so standing still and clicking used to
        // swing at whatever direction was last walked in.
        const aimYaw = this._getAimYaw();
        this.player.rotation[1] = aimYaw;
        this.player.updateModelMatrix();

        // Perform attack
        const result = this.combatSystem.attack(
            this.player.position,
            aimYaw,
            equippedItem,
            this.creatures,
            this.inventory
        );

        if (result.reason === 'no_ammo') {
            // Ranged attacks without ammo do not start a cooldown. Stop the
            // held action until release to avoid retrying every rendered frame.
            this._attackHoldBlocked = true;
            this._showNotification('➵ Hết tên! Chế tạo thêm tên để bắn cung.');
            return;
        }

        // Still on cooldown — no swing happened, so stay silent
        if (!result.swung) return;

        let treeResult = null;
        if (equippedItem && equippedItem.id === 'stone_axe') {
            this.firstPersonViewModel.triggerSwing();
            // Creatures take priority when they are in the swing. A missed axe
            // swing can then connect with the closest standing tree in its arc.
            if (!result.hit) {
                treeResult = this._tryChopTree(this.player.position, aimYaw, equippedItem);
            }
        }

        // The weapon left the player's hands — always whoosh.
        // creature can be null on a miss (swing with no target in range)
        const weaponType = equippedItem
            ? (getResourceDef(equippedItem.id) || {}).weaponType
            : 'melee';
        const swingPos = result.creature
            ? result.creature.position
            : (treeResult && treeResult.tree ? treeResult.tree.position : null);
        if (weaponType === 'ranged') {
            this.engine.audio.playBowRelease(swingPos);
        } else if (treeResult && treeResult.hit) {
            this.engine.audio.playChop(swingPos);
        } else {
            this.engine.audio.playSwing(swingPos);
        }

        if (result.hit) {
            // Hit feedback
            const killed = result.creature.state === CreatureState.DEAD;
            if (killed) this.stats.creaturesKilled++;
            this._showNotification(killed
                ? `💀 Hạ gục! -${result.damage} máu`
                : `⚔️ Trúng! -${result.damage} máu`);

            // Creature kind determines the hurt voice. Default is used for
            // any creature not in the map (future additions are covered).
            const creatureKind = result.creature.constructor.name.toLowerCase();

            if (killed) {
                this.engine.audio.playCreatureDie(creatureKind, result.creature.position);
                this._showHitMarker(true);
            } else {
                this.engine.audio.playHit(result.creature.position);
                this.engine.audio.playCreatureHurt(creatureKind, result.creature.position);
                this._showHitMarker(false);
            }

            this.particleSystem.emit(
                result.creature.position,
                { count: 8, color: [1.0, 0.5, 0.1], colorVariance: 0.15, size: 5, sizeVariance: 3, speed: 3.0, speedVariance: 1.5, lifetime: 0.4, lifetimeVariance: 0.15, gravity: -2.0, spread: 0.6, yBias: 2.0 }
            );
        } else if (treeResult && treeResult.hit) {
            const hitPoint = treeResult.tree.getTreePoint(0.14);
            this.particleSystem.emit(hitPoint, {
                count: 11,
                color: [0.58, 0.34, 0.14],
                colorVariance: 0.12,
                size: 5,
                sizeVariance: 3,
                speed: 2.7,
                speedVariance: 1.2,
                lifetime: 0.55,
                lifetimeVariance: 0.2,
                gravity: -5.0,
                spread: 0.65,
                yBias: 1.5,
            });

        } else if (equippedItem && (equippedItem.id === 'spear' || equippedItem.id === 'bow')) {
            // Only nag about misses when an actual weapon is equipped —
            // otherwise every stray click spams the notification bar.
            this._showNotification('💨 Đánh trượt!');
        }
    }

    /** Find the closest tree intersecting the axe swing and apply one hit. */
    _tryChopTree(playerPosition, playerYaw, equippedItem) {
        const weaponDef = getResourceDef(equippedItem.id);
        const range = weaponDef && weaponDef.weaponRange ? weaponDef.weaponRange : 2.0;
        const facingX = Math.sin(playerYaw);
        const facingZ = Math.cos(playerYaw);
        let closestTree = null;
        let closestDistance = Infinity;

        for (const tree of this.environmentEntities) {
            if (!tree.isHarvestableTree || tree.treeState !== 'standing') continue;

            const dx = tree.position[0] - playerPosition[0];
            const dz = tree.position[2] - playerPosition[2];
            const distance = Math.sqrt(dx * dx + dz * dz);
            const hitRange = range + (tree.collisionRadius || 0);
            if (distance > hitRange || distance >= closestDistance) continue;

            if (distance > 0.0001) {
                const dot = (dx / distance) * facingX + (dz / distance) * facingZ;
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle > TREE_CHOP_HALF_ARC) continue;
            }

            closestTree = tree;
            closestDistance = distance;
        }

        if (!closestTree) return { hit: false, tree: null };

        const chopResult = closestTree.chop(playerPosition);
        if (chopResult.felled && this.collisionSystem) {
            this.collisionSystem.unregister(closestTree);
        }
        return { ...chopResult, tree: closestTree };
    }

    /** Animate every falling tree and create wood only after terrain contact. */
    _updateFallingTrees(deltaTime) {
        if (!this.environmentEntities || !this.resourceManager) return;

        for (let treeIndex = this.environmentEntities.length - 1; treeIndex >= 0; treeIndex--) {
            const tree = this.environmentEntities[treeIndex];
            if (tree.treeState !== 'falling') continue;
            const landed = tree.updateTreeFall(deltaTime, this.terrain);
            if (!landed || tree.woodDropsSpawned) continue;

            tree.woodDropsSpawned = true;
            const sideX = Math.cos(tree._fallYaw);
            const sideZ = -Math.sin(tree._fallYaw);
            const dropPositions = TREE_WOOD_DROP_FRACTIONS.map((fraction, index) => {
                const point = tree.getTreePoint(fraction);
                const sideOffset = (index - 1) * 0.32;
                return [
                    point[0] + sideX * sideOffset,
                    point[2] + sideZ * sideOffset,
                ];
            });
            const impactPoint = tree.getTreePoint(0.72);

            // Remove the fallen model first. The wood pickups are created only
            // after the tree has touched terrain and left the render list.
            this.environmentEntities.splice(treeIndex, 1);
            tree.delete();

            for (const [x, z] of dropPositions) {
                this.resourceManager.spawnResource(
                    this.gl,
                    'wood',
                    x,
                    z,
                    this.terrain,
                    { allowWater: true }
                );
            }

            this.engine.audio.playTreeFall(impactPoint);
            this.particleSystem.emit(impactPoint, {
                count: 18,
                color: [0.50, 0.42, 0.28],
                colorVariance: 0.10,
                size: 8,
                sizeVariance: 5,
                speed: 2.2,
                speedVariance: 1.0,
                lifetime: 0.8,
                lifetimeVariance: 0.3,
                gravity: -2.5,
                spread: 1.25,
                yBias: 0.8,
            });
        }
    }

    /**
     * Horizontal yaw the camera is looking along, matching the convention used
     * by Player.rotation[1] (atan2(x, z)).
     */
    _getAimYaw() {
        const dx = this.camera.target[0] - this.camera.position[0];
        const dz = this.camera.target[2] - this.camera.position[2];
        if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
            return this.player.rotation[1];
        }
        return Math.atan2(dx, dz);
    }

    /**
     * Find the closest hostile creature within detection range. Used to
     * decide when to switch the music into the danger cue.
     * @returns {number} Distance, or Infinity when nothing is threatening.
     */
    _nearestThreatDistance() {
        let closest = Infinity;
        for (const creature of this.creatures) {
            if (creature.state !== CreatureState.CHASE && creature.state !== CreatureState.ATTACK) continue;
            const dx = creature.position[0] - this.player.position[0];
            const dz = creature.position[2] - this.player.position[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closest) closest = dist;
        }
        return closest;
    }

    /**
     * Brief red flash on the screen edge to indicate the direction damage
     * came from. The overlay is created on first use and styled with CSS
     * rather than a DOM element per direction.
     */
    _showDamageFlash() {
        if (!this._damageFlash) {
            this._damageFlash = document.createElement('div');
            this._damageFlash.id = 'damage-vignette';
            this._damageFlash.className = 'damage-vignette hidden';
            document.body.appendChild(this._damageFlash);
        }
        this._damageFlash.classList.remove('hidden');
        this._damageFlash.classList.remove('damage-vignette-fade');
        void this._damageFlash.offsetWidth; // force reflow
        this._damageFlash.classList.add('damage-vignette-fade');
        if (this._damageFlashTimer) clearTimeout(this._damageFlashTimer);
        this._damageFlashTimer = setTimeout(() => {
            this._damageFlash.classList.add('hidden');
            this._damageFlash.classList.remove('damage-vignette-fade');
        }, 600);
    }


    destroy() {
        console.log('GameScene: Destroying meshes and shader programs...');

        // These HUD widgets live in the shared page markup and are only ever
        // un-hidden here, so this scene has to put them back — otherwise they
        // stay painted over the main menu (z-index 120 beats the menu's 15).
        const dom = this._domCache || {};
        for (const el of [dom.compassBar, dom.timeWeatherWidget, dom.crosshair, dom.hitMarker]) {
            if (el) el.classList.add('hidden');
        }
        // Marker nodes are appended to static markup, so a re-entered scene
        // would otherwise stack a second copy behind its fresh pool.
        if (dom.compassMarkers) dom.compassMarkers.replaceChildren();
        this._compassMarkerEls = null;


        if (this.basicShader) this.basicShader.delete();
        if (this.waterShader) this.waterShader.delete();
        if (this.unlitShader) this.unlitShader.delete();

        if (this.terrain) this.terrain.delete();
        if (this.water) this.water.delete();

        if (this.characterRenderer) this.characterRenderer.delete();
        if (this.firstPersonViewModel) this.firstPersonViewModel.delete();

        // Cleanup resource system
        if (this.raftAssembly) this.raftAssembly.delete();
        if (this.waterfall) this.waterfall.delete();
        if (this.resourceManager) this.resourceManager.delete();
        if (this.debrisManager) this.debrisManager.delete();
        if (this.inventory) this.inventory.clear();
        if (this._notificationTimeoutId) {
            clearTimeout(this._notificationTimeoutId);
        }

        // Cleanup creatures (v0.5)
        if (this.creatures) {
            for (const creature of this.creatures) {
                creature.delete();
            }
            this.creatures = [];
        }

        // Cleanup particle system
        if (this.particleSystem) this.particleSystem.delete();
        if (this.rainSystem) this.rainSystem.delete();

        // Cleanup sun/moon sprites
        if (this.sunSprite) this.sunSprite.delete();
        if (this.moonSprite) this.moonSprite.delete();

        // Cleanup sky shader
        if (this.skyShader) {
            this.skyShader.delete();
            this.skyShader = null;
        }
        if (this.skyVao) {
            this.gl.deleteVertexArray(this.skyVao);
            this.skyVao = null;
        }

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
        if (this._pauseSaveBtn) this._pauseSaveBtn.removeEventListener('click', this._onPauseSave);
        if (this._pauseSettingsBtn) this._pauseSettingsBtn.removeEventListener('click', this._onPauseSettings);
        if (this._pauseAchievementsBtn) this._pauseAchievementsBtn.removeEventListener('click', this._onPauseAchievements);
        if (this._pauseGuideBtn) this._pauseGuideBtn.removeEventListener('click', this._onPauseGuide);

        // v1.0 cleanup
        if (this._unsubscribeSettings) {
            this._unsubscribeSettings();
            this._unsubscribeSettings = null;
        }
        if (this.menuUI) {
            this.menuUI.dispose();
            this.menuUI = null;
        }
        if (this.postFx) {
            this.postFx.delete();
            this.postFx = null;
        }

        const fpsCounter = document.getElementById('fps-counter');
        if (fpsCounter) fpsCounter.classList.add('hidden');
        const achievementToast = document.getElementById('achievement-toast');
        if (achievementToast) {
            achievementToast.classList.remove('visible');
            achievementToast.classList.add('hidden');
        }

        // Hide overlays
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');

        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.add('hidden');

        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');

        // Stop ambient, weather and music
        this.engine.audio.stopAmbientWaves();
        this.engine.audio.stopWind();
        this.engine.audio.stopRain();
        this.engine.audio.stopMusic();
        this.engine.audio.removeEmitter('waterfall');
        this.engine.audio.removeEmitter('campfire');

        // Cleanup dynamically created HUD elements
        if (this._damageFlash && this._damageFlash.parentNode) {
            this._damageFlash.parentNode.removeChild(this._damageFlash);
        }
        if (this._damageFlashTimer) clearTimeout(this._damageFlashTimer);
        if (this._hitMarkerTimeout) clearTimeout(this._hitMarkerTimeout);

        // Clear any remaining stacked toasts
        const toastContainer = document.getElementById('pickup-notification');
        if (toastContainer) toastContainer.innerHTML = '';

        // Remove canvas click listener
        if (this._onCanvasClick) {
            this.gl.canvas.removeEventListener('click', this._onCanvasClick);
            this._onCanvasClick = null;
        }
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

                    const resource = this.resourceManager.createResourceEntity(
                        gl,
                        def,
                        [node.position[0], y, node.position[2]]
                    );
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
                const chest = this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
                if (chest) chest.rewardType = this._quadrantRewardType(spot.quadrant);
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

        // v0.4 debug info
        const timeLabel = document.getElementById('debug-time-label');
        if (timeLabel) timeLabel.textContent = this.dayNight.getTimeLabel();

        const timeOfDay = document.getElementById('debug-time-of-day');
        if (timeOfDay) timeOfDay.textContent = (this.dayNight.timeOfDay * 24).toFixed(1) + 'h';

        const weatherLabel = document.getElementById('debug-weather-label');
        if (weatherLabel) weatherLabel.textContent = this.weather.getWeatherLabel();
    }

    /**
     * Rebuild the inverse view-projection the sky pass unprojects with.
     * Shared with MainMenuScene logic.
     */
    _updateInvViewProj() {
        Mat4.multiply(this._viewProj, this.camera.projectionMatrix, this.camera.viewMatrix);
        Mat4.invert(this._invViewProj, this._viewProj);
    }

    /**
     * Fullscreen sky pass using SkyShader v2.0. Runs first with depth writes
     * off so it never occludes the world. Now feeds dynamic colours from the
     * DayNightCycle so the sky transitions through sunrise → day → sunset → night.
     */
    _renderSky() {
        if (!this.skyShader) return;

        const gl = this.gl;
        const sunDir = this.dayNight.getSunDirection();
        const moonDir = this.dayNight.getMoonDirection();
        const sunColor = this.dayNight.getSunColor();
        const moonColor = this.dayNight.getMoonColor();
        const skyGrad = this.dayNight.getSkyGradient();
        const sunsetAmount = this.dayNight.getSunsetAmount();

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.skyVao);

        this.skyShader.use();
        this.skyShader.setUniformMatrix4fv('uInvViewProj', this._invViewProj);
        this.skyShader.setUniform3fv('uCameraPos', this.camera.position);
        this.skyShader.setUniform3fv('uSunDirection', sunDir);
        this.skyShader.setUniform3fv('uSunColor', sunColor);
        this.skyShader.setUniform3fv('uMoonDirection', moonDir);
        this.skyShader.setUniform3fv('uMoonColor', moonColor);
        this.skyShader.setUniform3fv('uSkyHorizon', skyGrad.horizon);
        this.skyShader.setUniform3fv('uSkyMid', skyGrad.mid);
        this.skyShader.setUniform3fv('uSkyZenith', skyGrad.zenith);
        this.skyShader.setUniform1f('uSunsetAmount', sunsetAmount);
        this.skyShader.setUniform1f('uTime', this.time);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
    }
}
