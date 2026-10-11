import { Shelter } from '../entities/Shelter.js';
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
import { getResourceDef } from '../systems/ResourceDatabase.js';
import { RaftAssembly } from '../entities/RaftAssembly.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { VitalsSystem } from '../systems/VitalsSystem.js';
import { ExposureSystem } from '../systems/ExposureSystem.js';
import { Campfire } from '../entities/Campfire.js';
import { WaterCollector } from '../entities/WaterCollector.js';
import { Waterfall } from '../entities/Waterfall.js';
import { WorldGenerator } from '../gameplay/world/WorldGenerator.js';
import { CampaignWorldGenerator } from '../gameplay/world/CampaignWorldGenerator.js';
import { CampaignController } from '../systems/CampaignController.js';
import { CampaignWildlife } from '../systems/CampaignWildlife.js';
import { EnvironmentObject } from '../entities/EnvironmentObject.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { CollisionDebug } from '../systems/CollisionDebug.js';
import { BillboardSprite } from '../renderer/BillboardSprite.js';
import { DayNightCycle } from '../systems/DayNightCycle.js';
import { WeatherSystem } from '../systems/WeatherSystem.js';
import { RainSystem } from '../systems/RainSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { Crab } from '../entities/Crab.js';
import { Seagull } from '../entities/Seagull.js';
import { Boar } from '../entities/Boar.js';
import { Shark } from '../entities/Shark.js';
import { CreatureState } from '../entities/Creature.js';
import { SkyShader } from '../shaders/SkyShader.js';
import { BiomeType } from '../gameplay/world/BiomeGenerator.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';
import { GameSaveController } from '../systems/GameSaveController.js';
import { InteractionController } from '../systems/InteractionController.js';
import { InventoryController } from '../systems/InventoryController.js';
import { ObjectiveTracker } from '../systems/ObjectiveTracker.js';
import { MovementFeedback } from '../systems/MovementFeedback.js';
import { MenuUI } from '../systems/MenuUI.js';
import { createStats } from '../systems/AchievementSystem.js';
import { PostProcessing } from '../renderer/PostProcessing.js';
import { Frustum } from '../renderer/Frustum.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

export const DEV_CHEATS_ENABLED = import.meta.env?.DEV === true;

const ACHIEVEMENT_CHECK_INTERVAL = 1.0;

const TREE_CHOP_HALF_ARC = Math.PI * 0.28;
const TREE_WOOD_DROP_FRACTIONS = [0.28, 0.52, 0.76];

const COMPASS_PX_PER_DEG = 2.9;

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

export class GameScene extends Scene {
    init() {
        console.log('GameScene: Initializing gameplay state...');
        const gl = this.gl;

        this._hasPointerLocked = false;
        this._pointerUnlockPauseGuard = 0;
        this._pointerLockHint = document.getElementById('pointer-lock-hint');
        this.engine.input.setPointerLockEnabled(true);
        this._onPointerLockChange = (locked, wasLocked) => {
            if (locked) this._hasPointerLocked = true;
            const inventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
            const auxiliaryMenuOpen = this.menuUI && this.menuUI.isAnyOpen();
            const escapePromptOpen = this.escapeHud && !this.escapeHud.classList.contains('hidden');
            if (!locked && wasLocked && this._hasPointerLocked && !this.isPaused
                && !inventoryOpen && !auxiliaryMenuOpen && !escapePromptOpen && !this.campaign?.ui.isOpen
                && !this._isGameOver && !this.isEscaping && !this.campaign?.ending?.state) {
                if (this.campaign?.placement) {
                    this.campaign.cancelPlacement();
                    this.engine.input.consumeKey('Escape');
                    this._pointerUnlockPauseGuard = 0.25;
                } else if (this._pointerUnlockPauseGuard <= 0) {
                    this._pointerUnlockPauseGuard = 0.25;
                    this._pauseGame();
                }
            }
            this._syncPointerLockHint();
        };
        this.engine.input.onPointerLockChange = this._onPointerLockChange;

        this.basicShader = new ShaderProgram(gl, BasicShader.vertex, BasicShader.fragment);
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);
        this.unlitShader = new ShaderProgram(gl, UnlitShader.vertex, UnlitShader.fragment);

        this.camera = new Camera(70 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.05, 1000.0);

        this.dirLight = new DirectionalLight([0, 1.0, 0], [1.0, 0.95, 0.85], 1.0);
        this.ambientLight = new AmbientLight([0.22, 0.28, 0.38], 0.4);
        this.lightTime = 0.0;

        this.dayNight = new DayNightCycle();
        this.weather = new WeatherSystem();
        this._rainParticleTimer = 0;

        this.sunSprite = new BillboardSprite(gl, [1.0, 0.9, 0.5], 4.0, [1.0, 0.7, 0.15]);
        this.moonSprite = new BillboardSprite(gl, [0.85, 0.85, 0.95], 3.5, [0.5, 0.5, 0.7]);

        this.skyShader = null;
        this.skyVao = null;
        try {
            this.skyShader = new ShaderProgram(gl, SkyShader.vertex, SkyShader.fragment);
            this.skyVao = gl.createVertexArray();
        } catch (e) {
            console.error('GameScene: sky shader failed to compile, using flat sky.', e);
        }

        this._viewProj = Mat4.create();
        this._invViewProj = Mat4.create();

        this.player = new Player();

        this._pendingSave = this.engine.pendingLoad || null;
        this.engine.pendingLoad = null;
        this.activeWorldId = this.engine.activeWorldId;

        this.worldSeed = this.engine.worldSeed || Math.floor(Math.random() * 1000000).toString();
        this.debugBiomeColors = false;
        this.worldGenerator = this.engine.activeWorld?.mode === 'campaign' ? new CampaignWorldGenerator() : new WorldGenerator(120, 100.0);

        if (this._pendingSave) {
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

        this.terrain = new Terrain(gl, 120, 100.0, this.world.terrain, this.world.terrainGenerator);
        this.water = new Water(gl, 100, this.world.width ? this.world.width * 2 : 200.0, this.terrain);

        this.environmentEntities = [];
        this.removedEnvironmentObjectIds = new Set();
        for (const [worldObjectIndex, obj] of this.world.placedObjects.entries()) {
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
                entity.worldObjectId = String(worldObjectIndex);
                this.environmentEntities.push(entity);
            }
        }

        const characterDef = CharacterRegistry.get('casual_male');
        this.characterRenderer = new CharacterRenderer(characterDef);
        this.characterRenderer.load(gl, this.engine.assets);
        this.firstPersonViewModel = new FirstPersonViewModel(gl);
        this.firstPersonViewModel.load(this.engine.assets);

        this.inventory = new Inventory(20);
        this.resourceManager = new ResourceManager(this.engine.assets);
        this.debrisManager = new DebrisManager(this.engine.assets);

        this.resourceManager.worldResources = [];
        for (const node of this.world.resourceNodes) {
            const resource = this.resourceManager.spawnResource(
                gl,
                node.id,
                node.position[0],
                node.position[2],
                this.terrain
            );
            if (resource && this.world.mode === 'campaign') {
                resource.worldNodeId = node.worldNodeId;
                resource.amount = node.amount || 1;
                resource.position[1] = node.position[1] + 0.1;
                resource.updateModelMatrix();
            }
        }

        this.particleSystem = new ParticleSystem(gl);
        this.rainSystem = new RainSystem(gl);

        this.tutorial = new TutorialSystem({ mode: this.world.mode, input: this.engine.input });
        this.tutorial.init();
        this.tutorial.start();

        this.inventoryMenu = null;
        this._notificationTimeoutId = null;

        this.vitals = new VitalsSystem();
        this.exposure = new ExposureSystem();
        this._exposureModifiers = this.exposure.getModifiers();
        this._lastExposureState = 'normal';
        this.vitals.onChange = (vitalId, value, max) => {
            this._updateVitalBar(vitalId, value, max);
        };
        this.vitals.onGameOver = () => {
            this._showGameOver();
        };

        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.remove('hidden');
        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.remove('hidden');

        this.campfire = new Campfire(
            gl,
            [5.0, 0.0, 5.0],
            this.engine.assets.getModel('survival:bonfire_fire')
        );
        const campfireY = this.terrain.getHeight(5.0, 5.0);
        this.campfire.position[1] = campfireY;
        this.campfire.updateModelMatrix();

        this.shelter = new Shelter(gl);

        this.waterCollector = new WaterCollector(gl, [-5.0, 0.0, 15.0]);
        const wcY = this.terrain.getHeight(-5.0, 15.0);
        this.waterCollector.position[1] = wcY;
        this.waterCollector.updateModelMatrix();

        this.raftAssembly = new RaftAssembly(gl, this.world.buildArea);

        this.toggleBiomeColorsEl = document.getElementById('toggle-biome-colors');
        if (this.toggleBiomeColorsEl) {
            this.toggleBiomeColorsEl.checked = this.debugBiomeColors;
            
            this._onToggleBiomeColors = (e) => {
                this.debugBiomeColors = e.target.checked;
                this._regenerateWorld();
            };
            this.toggleBiomeColorsEl.addEventListener('change', this._onToggleBiomeColors);
        }
        
        this._updateWorldDebugInfo();
        
        const wfPos = this.world.landmarks && this.world.landmarks.waterfall
            ? this.world.landmarks.waterfall
            : [25.0, this.terrain.getHeight(25.0, -20.5), -20.5];
        this.waterfall = new Waterfall(gl, [wfPos[0], 0.0, wfPos[2]]);
        this.waterfall.position[1] = wfPos[1];
        this.waterfall.updateModelMatrix();

        this.unlockedBlueprints = new Set();
        this.isFishing = false;
        this.fishingTimer = 0.0;

        const chestSpots = this.world.landmarks && this.world.landmarks.treasureChests
            ? this.world.landmarks.treasureChests
            : [];
        for (const spot of chestSpots) {
            const chest = this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
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
        this.victoryScreen?.classList.add('hidden');
        this.gameoverScreen?.classList.add('hidden');

        this._onRestart = () => this._restartWorld();

        if (this.escapeBtn) {
            this._onEscape = () => this._startEscapeCutscene();
            this.escapeBtn.addEventListener('click', this._onEscape);
        }
        if (this.restartBtn) {
            this.restartBtn.addEventListener('click', this._onRestart);
        }
        if (this.gameoverRestartBtn) {
            this.gameoverRestartBtn.addEventListener('click', this._onRestart);
        }

        this.isEscaping = false;
        this.escapeTime = 0.0;
        this.survivalSeconds = 0.0;
        this._isGameOver = false;

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
        this._onPauseMenu = async () => {
            this.engine.audio.playClick();
            if (!await this.saveController.save(false)) return;
            this._resumeGame();
            setTimeout(() => {
                this.engine.scenes.switchScene('MainMenu');
            }, 100);
        };
        this._onPauseSave = () => {
            this.engine.audio.playClick();
            this.saveController.save(false);
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

        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        this.movementFeedback = new MovementFeedback({
            reducedMotion: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        });

        this.collisionSystem = new CollisionSystem({ indexed: this.world.mode === 'campaign' });
        this.collisionDebug = new CollisionDebug(gl);

        this.collisionSystem.register(this.player, true);
        for (const entity of this.environmentEntities) {
            this.collisionSystem.register(entity);
        }

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

        this.debugCollisionEl = document.getElementById('toggle-collision-debug');
        if (this.debugCollisionEl) {
            this._onToggleCollisionDebug = (e) => {
                this.collisionSystem.setDebugMode(e.target.checked);
                this.collisionDebug.setEnabled(e.target.checked);
            };
            this.debugCollisionEl.addEventListener('change', this._onToggleCollisionDebug);
        }

        this.combatSystem = new CombatSystem();
        this.projectileSystem = new ProjectileSystem(gl, this.collisionSystem, this.terrain);
        this.projectileSystem.onImpact = impact => this._handleProjectileImpact(impact);
        this._attackHoldBlocked = false;
        this._pendingMeleeImpact = null;
        this._pendingBowCharge = null;
        this.creatures = [];

        if (this.world.mode === 'campaign') this.wildlife = new CampaignWildlife(this);
        else {
            this._spawnCrabs();
            this._spawnSeagulls();
            this._spawnBoars();
            this._spawnSharks();
        }

        for (const creature of this.creatures) {
            this.collisionSystem.register(creature, true);
        }

        gl.clearColor(0.53, 0.74, 0.90, 1.0);

        const hud = document.getElementById('resource-hud');
        if (hud) hud.style.display = '';

        this._initReleaseSystems();

        this.engine.audio._ensureContext();
        this.engine.audio.resume();
        this.engine.audio.startAmbientWaves();
        this.engine.audio.startWind();
        this.engine.audio.startRain();
        this.engine.audio.startMusic();
        this.engine.audio.setHealthFraction(this.vitals.health / 100);

        this.engine.audio.addEmitter('waterfall', 'waterfall', this.waterfall.position, true);
        if (this.campfire.isBuilt) {
            this.engine.audio.addEmitter('campfire', 'campfire', this.campfire.position, true);
        }

        if (this.engine.activeWorld?.mode === 'campaign') this.campaign = new CampaignController(this);
        if (this._pendingSave) {
            this.saveController.apply(this._pendingSave);
            this.campaign?.restore(this._pendingSave.campaign);
            this._pendingSave = null;
        }
        if (this.engine.pendingRecoveryWarning) {
            this._showNotification(this.engine.pendingRecoveryWarning);
            this.engine.pendingRecoveryWarning = null;
        }

        this._syncPointerLockHint();
    }


    _initReleaseSystems() {
        const gl = this.gl;
        const settings = this.engine.settings;

        this.stats = createStats();
        this.achievements = this.engine.achievements;
        this._achievementTimer = 0;

        this._wasNight = this.dayNight.timeOfDay > 0.85 || this.dayNight.timeOfDay < 0.1;
        this._wasStorm = false;

        this.frustum = new Frustum();
        this.postFx = new PostProcessing(gl);
        this._drawCalls = 0;

        this.menuUI = new MenuUI(this.engine);
        this.inventoryController = new InventoryController(this);
        this.inventoryController.init();
        this.objectiveTracker = new ObjectiveTracker(this);
        this.objectiveTracker.init();

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
            timeWeatherWidget: document.getElementById('time-weather-widget'),
            twClock: document.getElementById('tw-clock'),
            twWeather: document.getElementById('tw-weather'),
            twDay: document.getElementById('tw-day'),
            compassBar: document.getElementById('compass-bar'),
            compassStrip: document.getElementById('compass-strip'),
            compassMarkers: document.getElementById('compass-markers'),
            crosshair: document.getElementById('crosshair'),
            hitMarker: document.getElementById('hit-marker'),
            wetnessIcon: document.getElementById('wetness-icon'),
            coldVignette: document.getElementById('cold-vignette'),
        };

        this._survivalDay = 1;
        this._lastDayIndex = 0;

        this._applySettings();
        this._unsubscribeSettings = settings.onChange(() => this._applySettings());
        this._motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
        this._onMotionPreference = () => this._applySettings();
        this._motionPreference?.addEventListener('change', this._onMotionPreference);
        this.saveController = new GameSaveController(this);
        this.saveController.attach();
        this.interactionController = new InteractionController(this);
    }

    _applySettings() {
        const s = this.engine.settings;
        const reducedMotion = !!s.get('reducedMotion') || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (this.movementFeedback) this.movementFeedback.reducedMotion = reducedMotion;
        if (this.firstPersonViewModel) this.firstPersonViewModel.reducedMotion = reducedMotion;
        document.documentElement.classList.toggle('reduced-motion', !!s.get('reducedMotion'));

        this.camera.setFov(s.get('fov') * Math.PI / 180);
        this.camera.setLookSettings(s.get('mouseSensitivity'), s.get('invertY'));

        if (this.particleSystem) this.particleSystem.density = s.get('particleDensity');
        if (this.frustum) this.frustum.enabled = s.get('frustumCulling');
        if (this.postFx) this.postFx.enabled = s.get('postProcessing') && this.postFx.available;

        this._viewDistance = s.get('viewDistance');

        const fpsEl = this._domCache && this._domCache.fpsCounter;
        if (fpsEl) fpsEl.classList.toggle('hidden', !s.get('showFps'));
    }

    _updateAchievements(deltaTime) {
        this.stats.survivalSeconds = this.survivalSeconds;

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
        this.achievements.update(deltaTime);
        this._updateFpsCounter();
        this.saveController.updateStatus(deltaTime);
        this.campaign?.updatePendingSave(deltaTime);
        if (this.campaign?.handleInput(deltaTime)) return;

        if (this._pointerUnlockPauseGuard > 0) {
            this._pointerUnlockPauseGuard = Math.max(0, this._pointerUnlockPauseGuard - deltaTime);
        }

        if (this.engine.input.isKeyPressed('Escape')) {
            if (this._pointerUnlockPauseGuard > 0) {
                this.engine.input.consumeKey('Escape');
                return;
            }
            const isInventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
            if (isInventoryOpen) {
                this.inventoryController.closeMenu();
            } else if (this.menuUI && this.menuUI.isAnyOpen()) {
                this.menuUI.closeAll();
            } else if (this.isPaused) {
                this._resumeGame();
            } else {
                this._pauseGame();
            }
            return;
        }

        if (this.isPaused || this._isGameOver) return;

        if (this.campaign?.ending.update(deltaTime)) return;

        this.time += deltaTime;

        this._syncWaveField();

        if (this.isEscaping) {
            this.escapeTime += deltaTime;

            let sailSpeed = 1.0 + this.escapeTime * 0.8;
            if (this.raftAssembly.motorPlaced) {
                sailSpeed = 8.0 + this.escapeTime * 3.0;
            } else if (this.raftAssembly.sailPlaced) {
                sailSpeed = 3.5 + this.escapeTime * 1.5;
            }

            this.raftAssembly.position[2] += sailSpeed * deltaTime;
            this.raftAssembly.position[1] = WaveField.heightAt(
                this.raftAssembly.position[0], this.raftAssembly.position[2]);
            this.raftAssembly.updateModelMatrix();

            this.player.position[0] = this.raftAssembly.position[0];
            this.player.position[1] = this.raftAssembly.position[1] + (0.20 * 0.45) + 0.9 * this.player.scaleFactor;
            this.player.position[2] = this.raftAssembly.position[2];
            this.player.rotation[1] = 0.0;
            this.player.updateModelMatrix();

            this.camera.target[0] = this.player.position[0];
            this.camera.target[1] = this.player.position[1];
            this.camera.target[2] = this.player.position[2];

            this.camera.position[0] = -7.0 - this.escapeTime * 0.3;
            this.camera.position[1] = 4.0 + this.escapeTime * 0.15;
            this.camera.position[2] = this.raftAssembly.position[2] - 8.0 - this.escapeTime * 0.2;

            const up = [0, 1.0, 0];
            Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

            this._updateInvViewProj();

            if (Math.random() < 0.3) {
                const splashPos = [
                    this.raftAssembly.position[0] + (Math.random() - 0.5) * 1.5,
                    0.2,
                    this.raftAssembly.position[2] - 1.0
                ];
                this.particleSystem.emit(splashPos, ParticleSystem.PRESET.SPLASH);
            }

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
                    gravity: 0.8,
                    spread: 0.3,
                    yBias: 1.0,
                });
            }

            this.particleSystem.update(deltaTime);

            if (this.escapeTime >= 6.0) {
                if (this.victoryScreen && this.victoryScreen.classList.contains('hidden')) {
                    this.victoryScreen.classList.remove('hidden');
                    
                    const mins = Math.floor(this.survivalSeconds / 60).toString().padStart(2, '0');
                    const secs = Math.floor(this.survivalSeconds % 60).toString().padStart(2, '0');
                    if (this.statTimeEl) {
                        this.statTimeEl.textContent = `${mins}:${secs}`;
                    }

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

                    this.engine.input.releasePointerLock();

                    this.stats.escaped = 1;
                    this.stats.survivalSeconds = this.survivalSeconds;
                    this.achievements.evaluate(this.stats);
                    this.saveController.finish('escaped');

                    this.engine.audio.playVictory();
                }
            }
            return;
        }

        this.survivalSeconds += deltaTime;

        this._updateAchievements(deltaTime);
        this.saveController.updateAutosave(deltaTime);

        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);

        if (this.isFishing && !this.campaign) {
            this.fishingTimer -= deltaTime;
            
            const hintEl = this._domCache.pickupHint;
            if (hintEl) {
                hintEl.innerHTML = `🎣 Đang câu cá... (còn ${Math.max(1, Math.ceil(this.fishingTimer))} giây)`;
                hintEl.classList.remove('hidden');
                hintEl.dataset.hintOwner = 'fishing';
            }

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

        const input = this.engine.input;
        const inventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        const rotateLight = this._domCache.lightRot ? this._domCache.lightRot.checked : true;
        if (rotateLight) this.dayNight.update(deltaTime);
        this.weather.update(deltaTime);
        const weatherEffects = this.weather.getGameplayEffects();
        this.campaign?.beforeUpdate(deltaTime, weatherEffects);
        const isNight = this.dayNight.timeOfDay >= this.dayNight.duskTime
            || this.dayNight.timeOfDay < this.dayNight.dawnTime;
        const inWater = this._isPlayerInExposureWater();
        const nearCampfire = this.campfire.isPlayerInWarmthRange(this.player.position);
        this._exposureModifiers = this.exposure.update(deltaTime, {
            sheltered: this.shelter.covers(this.player.position),
            rainFactor: weatherEffects.rainFactor,
            inWater,
            isNight,
            nearCampfire,
            fireIntensityMultiplier: this.shelter.covers(this.campfire.position)
                ? 1 : weatherEffects.campfireIntensityMultiplier,
        });
        if (this._exposureModifiers.damage > 0) {
            this.vitals.applyDamage(this._exposureModifiers.damage, 'cold');
        }
        this._updateExposureStatus();
        const hasMovementInput = !inventoryOpen && (input.isActionDown('moveForward')
            || input.isActionDown('moveBackward')
            || input.isActionDown('moveLeft')
            || input.isActionDown('moveRight'));
        const sprintHeld = input.isActionDown('sprint') || input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        const isSprinting = !this.isFishing && hasMovementInput && sprintHeld
            && this.vitals.canSprint();
        this.vitals.update(
            deltaTime,
            isSprinting,
            this._exposureModifiers.staminaRegenMultiplier
        );

        const exposureSpeed = this._exposureModifiers.speedMultiplier;
        this.player.speed = this.isFishing ? 0.0
            : (isSprinting ? PLAYER_BALANCE.sprintSpeed : PLAYER_BALANCE.walkSpeed) * exposureSpeed;

        const prevPlayerPos = [this.player.position[0], this.player.position[1], this.player.position[2]];
        this.collisionSystem.refreshDynamic();

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
            this._firstPersonHeadCutFromBase = modelMin + modelHeight * 0.72;
        }
        if (this.campaign) { eyeOffset = 0.75; faceOffset = 0.08; }
        this.camera.update(this.engine.input, this.player.position, eyeOffset, deltaTime, faceOffset);

        const movementInput = (this.isFishing || inventoryOpen)
            ? { isKeyDown: () => false, isKeyPressed: () => false, isActionDown: () => false, isActionPressed: () => false, keys: {} } 
            : this.engine.input;
        this.player.update(deltaTime, movementInput, this.camera, this.terrain);

        if (this.collisionSystem) {
            this.collisionSystem.resolvePlayerCollisions(this.player, this.terrain, CollisionLayers.Creature);
        }
        const movementRespawned = this.campaign?.afterMovement(deltaTime, prevPlayerPos);

        const distanceMoved = movementRespawned ? 0 : Math.hypot(
            this.player.position[0] - prevPlayerPos[0],
            this.player.position[2] - prevPlayerPos[2]
        );
        const movementFeel = this.movementFeedback.update(
            deltaTime,
            distanceMoved,
            this.player.currentSpeed,
            isSprinting
        );
        this.camera.setMotionOffset(movementFeel.horizontalOffset, movementFeel.verticalOffset);
        this.camera.setGameplayFov(this.engine.settings.get('fov'), movementFeel.fovBoostDegrees);

        if (movementFeel.stepCount > 0) {
            const px = this.player.position[0];
            const pz = this.player.position[2];
            const h = this.terrain ? this.terrain.getHeight(px, pz) : 0;
            const biomeGen = this.world ? this.world.biomeGenerator : null;
            const biome = biomeGen ? biomeGen.getBiome(px, pz, h) : null;
            const surface = biomeToSurface(biome);
            this.engine.audio.playFootstep(surface, movementFeel.running);

            if (surface !== 'water') {
                const dustPos = [
                    this.player.position[0],
                    this.player.position[1] - this.player.collider.height * 0.5 + 0.1,
                    this.player.position[2]
                ];
                this.particleSystem.emit(dustPos, ParticleSystem.PRESET.DUST);
            }
        }

        const playerTerrainHeight = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const creature = this.creatures[i];
            if (this.wildlife && !this.wildlife.active(creature)) continue;
            const previous = this.wildlife ? Array.from(creature.position) : null;

            creature.update(
                deltaTime,
                this.player.position,
                this.terrain,
                playerTerrainHeight,
                weatherEffects
            );

            if (this.collisionSystem) {
                this.collisionSystem.resolvePlayerCollisions(creature, this.terrain);
                creature.constrainToNavigationSurface(this.terrain);
            }
            this.wildlife?.resolve(creature, previous, deltaTime);

            if (creature.attackDamage > 0 &&
                (creature.state === CreatureState.CHASE || creature.state === CreatureState.ATTACK)) {
                const dx = creature.position[0] - this.player.position[0];
                const dz = creature.position[2] - this.player.position[2];
                const dist = Math.sqrt(dx * dx + dz * dz);
                const dy = Math.abs(creature.position[1] - this.player.position[1]);
                if (dist <= creature.attackRange && dy <= 2.0 && (!this.wildlife || this.wildlife.canReachPlayer(creature))) {
                    if (creature.canDamagePlayer()) {
                        this.vitals.applyDamage(creature.attackDamage, creature instanceof Shark ? 'shark' : 'boar');
                        this._showNotification(`💥 Trúng đòn! Mất ${creature.attackDamage} máu!`);
                        this.engine.audio.playPlayerHurt();
                        this.engine.audio.setHealthFraction(this.vitals.health / 100);
                        this._showDamageFlash();

                        this.particleSystem.emit(
                            this.player.position,
                            { count: 6, color: [0.8, 0.1, 0.1], colorVariance: 0.1, size: 4, sizeVariance: 2, speed: 2.0, speedVariance: 1.0, lifetime: 0.5, lifetimeVariance: 0.2, gravity: -3.0, spread: 0.8, yBias: 1.5 }
                        );
                    }
                }
            }

            if (creature.isReadyForCleanup()) {
                this.collisionSystem.unregister(creature);
                creature.delete();
                this.creatures.splice(i, 1);
            }
        }

        this.combatSystem.update(deltaTime);
        const activeViewItem = this.inventory.getEquippedItem();
        const activeViewDef = activeViewItem ? getResourceDef(activeViewItem.id) : null;
        this.firstPersonViewModel.setWeapon(
            activeViewDef?.weaponType ? activeViewItem.id : 'fist'
        );
        const weaponEvent = this.firstPersonViewModel.update(
            deltaTime,
            this.player.currentSpeed > 0.1
        );
        if (weaponEvent?.type === 'impact') this._resolvePendingMeleeImpact(weaponEvent);
        this._updateFallingTrees(deltaTime);

        const attackHeld = !!this.engine.input.mouse.buttons[0];
        const attackPressed = this.engine.input.isMousePressed(0);
        const attackReleased = this.engine.input.isMouseReleased(0);
        const combatMenuOpen = !!(this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden'));
        const combatUnavailable = !!this.campaign?.placement || !!this.campaign?.hook.state || this.isFishing || this.isEscaping || combatMenuOpen
            || this.isPaused || this._isGameOver;
        const equippedCombatItem = this.inventory.getEquippedItem();
        const bowEquipped = equippedCombatItem?.id === 'bow';

        if (!attackHeld) {
            this._attackHoldBlocked = false;
        } else if (combatUnavailable) {
            this._attackHoldBlocked = true;
        }

        if (combatUnavailable) {
            this._cancelPendingCombat();
        } else if (bowEquipped && !this._attackHoldBlocked) {
            if (attackPressed) this._beginBowCharge(equippedCombatItem);
            if (attackReleased) this._releaseBow();
        } else if (attackPressed && !this._attackHoldBlocked && this.combatSystem.canAttack()) {
            this._handleCombatInput();
        }
        this.projectileSystem.update(deltaTime);

        if (this.engine.input.isKeyPressed('inventory')) {
            this.inventoryController.toggleMenu();
            if (this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden')) {
                this._cancelPendingCombat();
            }
        }

        if (!inventoryOpen && this.engine.input.isKeyPressed('useItem')) {
            this.inventoryController.useActiveItem();
        }

        for (let i = 0; !inventoryOpen && i < 8; i++) {
            const action = 'hotbar' + (i + 1);
            if (this.engine.input.isKeyPressed(action) ||
                this.engine.input.isKeyPressed('Digit' + (i + 1)) ||
                this.engine.input.isKeyPressed('Numpad' + (i + 1))) {
                if (this.inventory.selectedHotbarIndex !== i) {
                    this._cancelPendingCombat();
                    this.inventory.selectedHotbarIndex = i;
                    this.engine.audio.playClick();
                    this.inventoryController.renderInventory();
                }
            }
        }

        const isMenuOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        if (!isMenuOpen) {
            const scroll = this.engine.input.mouse.wheelDelta;
            if (scroll !== 0) {
                this._cancelPendingCombat();
                let nextIndex = this.inventory.selectedHotbarIndex + scroll;
                if (nextIndex < 0) nextIndex = 7;
                else if (nextIndex > 7) nextIndex = 0;
                
                this.inventory.selectedHotbarIndex = nextIndex;
                this.inventoryController.renderInventory();
                this.engine.input.mouse.wheelDelta = 0;
            }
        }

        if (DEV_CHEATS_ENABLED && this.engine.input.isKeyPressed('KeyK')) {
            this.player.position[0] = 0.0;
            this.player.position[1] = this.player.collider.height * 0.5;
            this.player.position[2] = 38.5;
            this.player.updateModelMatrix();

            this.inventory.addItem('raft_frame', 1);
            this.inventory.addItem('barrel_floats', 1);
            this.inventory.addItem('paddle', 1);
            this.inventory.addItem('raft_sail', 1);
            this.inventory.addItem('raft_motor', 1);
            this.inventory.addItem('fishing_rod', 1);

            this.unlockedBlueprints.add('fishing_rod_blueprint');
            this.unlockedBlueprints.add('sail_raft_blueprint');
            this.unlockedBlueprints.add('motor_raft_blueprint');

            this._showNotification('🛠️ CHEAT: Teleported to beach, items added & blueprints unlocked!');
        }


        this.camera.update(null, this.player.position, eyeOffset, deltaTime, faceOffset);

        this.player.rotation[1] = this._getAimYaw();
        this.player.updateModelMatrix();

        this._updateInvViewProj();

        const gameplayMenuOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        if (!gameplayMenuOpen) {
            if (this.campaign) this.campaign.interact();
            else this.interactionController.update(deltaTime);
        }
        if (this.raftAssembly) {
            this.raftAssembly.update(deltaTime);
        }

        this.campfire.update(deltaTime, this.shelter.covers(this.campfire.position)
            ? { ...weatherEffects, campfireIntensityMultiplier: 1 } : weatherEffects);
        this.waterCollector.update(deltaTime, weatherEffects.rainFactor);

        this.particleSystem.update(deltaTime);

        if (this.waterfall) {
            this.waterfall.update(deltaTime, this.particleSystem);
        }

        this.tutorial.update(deltaTime, this.engine.input, this.player);

        this._updateEnvironmentPresentation(deltaTime);

        const closestThreat = this._nearestThreatDistance();
        if (closestThreat < 12) {
            this.engine.audio.setMusicMood('danger');
        } else if (this.dayNight.timeOfDay > 0.82 || this.dayNight.timeOfDay < 0.12) {
            this.engine.audio.setMusicMood('night');
        } else {
            this.engine.audio.setMusicMood('calm');
        }

        if (this.waterfall) {
            this.engine.audio.setEmitterPosition('waterfall', this.waterfall.position);
        }

        this.engine.audio.setHealthFraction(this.vitals.health / 100);

        this.engine.audio.update(deltaTime);

        this._updateHUDWidgets(deltaTime);

        this._updateDebugPanel();
    }

    _updateHUDWidgets(deltaTime) {
        const dom = this._domCache;
        if (!dom) return;

        if (dom.timeWeatherWidget && dom.twClock && dom.twWeather && dom.twDay) {
            dom.timeWeatherWidget.classList.remove('hidden');

            const hours24 = this.dayNight.timeOfDay * 24;
            const hh = Math.floor(hours24);
            const mm = Math.floor((hours24 - hh) * 60);
            dom.twClock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

            const weather = this.weather.currentWeather;
            const icons = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️' };
            dom.twWeather.textContent = icons[weather] || '☀️';

            const dayIndex = Math.floor(this.survivalSeconds * this.dayNight.daySpeed);
            const displayDay = dayIndex + 1;
            dom.twDay.textContent = `Ngày ${displayDay}`;
        }

        this._updateCompass(deltaTime);
        this.objectiveTracker?.update();

        if (dom.crosshair) {
            const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
            const equipped = this.inventory.slots[hotbarIdx];
            const isWeapon = equipped && (
                equipped.id === 'spear' || equipped.id === 'bow' ||
                (getResourceDef(equipped.id) || {}).weaponType
            );
            dom.crosshair.classList.toggle('hidden', !isWeapon || this.isPaused || this.isEscaping);
            const bowCharge = this._pendingBowCharge
                ? this.firstPersonViewModel.getBowCharge()
                : 0;
            dom.crosshair.classList.toggle('bow-charging', !!this._pendingBowCharge);
            dom.crosshair.style.setProperty('--bow-charge-angle', `${bowCharge * 360}deg`);
        }
    }

    _updateEnvironmentPresentation(deltaTime) {
        const sunDir = this.dayNight.getSunDirection();
        const sunColor = this.dayNight.getSunColor();
        const sunIntensity = this.dayNight.getSunIntensity();

        const celestialDist = 80.0;
        const sunLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
        const sunDirNorm = sunLen > 0.001
            ? [sunDir[0] / sunLen, sunDir[1] / sunLen, sunDir[2] / sunLen]
            : [0, 1, 0];
        const moonDir = this.dayNight.getMoonDirection();
        const moonLen = Math.hypot(moonDir[0], moonDir[1], moonDir[2]);
        const moonDirNorm = moonLen > 0.001
            ? [moonDir[0] / moonLen, moonDir[1] / moonLen, moonDir[2] / moonLen]
            : [0, -1, 0];

        this.sunSprite.position[0] = this.camera.position[0] + sunDirNorm[0] * celestialDist;
        this.sunSprite.position[1] = this.camera.position[1] + sunDirNorm[1] * celestialDist;
        this.sunSprite.position[2] = this.camera.position[2] + sunDirNorm[2] * celestialDist;
        this.sunSprite.visible = sunDirNorm[1] > -0.1 && sunIntensity > 0.15;

        this.moonSprite.position[0] = this.camera.position[0] + moonDirNorm[0] * celestialDist;
        this.moonSprite.position[1] = this.camera.position[1] + moonDirNorm[1] * celestialDist;
        this.moonSprite.position[2] = this.camera.position[2] + moonDirNorm[2] * celestialDist;
        const moonColor = this.dayNight.getMoonColor();
        const moonBrightness = Math.max(moonColor[0], moonColor[1], moonColor[2]);
        this.moonSprite.visible = moonDirNorm[1] > -0.1 && moonBrightness > 0.02;

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
        const cloudCover = this.weather.cloudCover;
        const moonlit = sunDir[1] < 0;
        const lightDirection = moonlit ? this.dayNight.getMoonDirection() : sunDir;
        const lightColor = moonlit ? [0.60, 0.73, 1.0] : sunColor;
        const lightIntensity = moonlit
            ? 0.18 * Math.min(1, Math.max(0, -sunDir[1] / 0.35))
            : sunIntensity;
        this.dirLight.setDirection(...lightDirection);
        this.dirLight.color.set(lightColor);
        this.dirLight.intensity = lightIntensity * (1 - cloudCover * 0.65);

        const ambColor = this.dayNight.getAmbientColor();
        this.ambientLight.color.set(ambColor);
        this.ambientLight.intensity = this.dayNight.getAmbientIntensity()
            * (1 - cloudCover * 0.20) + lightningMod * 0.45;
        if (this.campaign?.ending.state?.route === 'raft') {
            // Open-water sky fill keeps the steering subject readable when backlit or moonlit.
            const fill = Math.max(0, 1 - this.dirLight.intensity / 0.5) * 0.8;
            const skyFill = [0.62, 0.68, 0.8];
            for (let axis = 0; axis < 3; axis++) this.ambientLight.color[axis] += (skyFill[axis] - this.ambientLight.color[axis]) * fill;
            this.ambientLight.intensity += (Math.max(0.78, this.ambientLight.intensity) - this.ambientLight.intensity) * fill;
        }

        this.rainSystem.intensity = this.weather.rainIntensity;
        if (this.weather.rainIntensity > 0.01) {
            const windX = this.weather.windDirection[0] * this.weather.windSpeed;
            const windZ = this.weather.windDirection[2] * this.weather.windSpeed;
            this.rainSystem.update(deltaTime, this.player.position, [windX, 0, windZ]);
        }

        if (this.weather.thunderPending) {
            const flashPos = [
                this.player.position[0] + (Math.random() - 0.5) * 20,
                10 + Math.random() * 10,
                this.player.position[2] + (Math.random() - 0.5) * 20
            ];
            this.particleSystem.emit(flashPos, ParticleSystem.PRESET.LIGHTNING);
            this.engine.audio.playThunder();
        }

        this.engine.audio.setWindIntensity(this.weather.windSpeed / 5.0);
        this.engine.audio.setRainIntensity(this.weather.rainIntensity);
        this.engine.audio.setTimeOfDay(this.dayNight.timeOfDay);
        this.engine.audio.setListener(this.camera.position, this.camera.target);
    }

    _updateExposureStatus() {
        this._updateVitalBar('warmth', this.exposure.warmth, 100);
        const presentation = this.exposure.getPresentation();
        const wetnessIcon = this._domCache?.wetnessIcon;
        if (wetnessIcon) {
            wetnessIcon.textContent = presentation.wetnessIcon;
            wetnessIcon.classList.toggle('hidden', !presentation.wetnessIcon);
            wetnessIcon.setAttribute('aria-label', `Độ ướt ${Math.round(this.exposure.wetness)}`);
        }
        const coldVignette = this._domCache?.coldVignette;
        if (coldVignette) {
            coldVignette.style.opacity = String(presentation.coldVignetteOpacity);
        }

        if (presentation.state === this._lastExposureState) return;
        this._lastExposureState = presentation.state;
        if (presentation.state === 'cold') {
            this._showNotification('🥶 Bạn đang lạnh: thể lực hồi chậm hơn.');
        } else if (presentation.state === 'freezing') {
            this._showNotification('❄️ Bạn đang đóng băng: tốc độ giảm và bắt đầu mất máu.');
        } else {
            this._showNotification('🔥 Cơ thể đã ấm lại.');
        }
    }

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

    _updateCompass(deltaTime) {
        const dom = this._domCache;
        const bar = dom && dom.compassBar;
        if (!bar || !dom.compassStrip) return;

        bar.classList.remove('hidden');
        this._buildCompassStrip();

        if (this._compassHalfWidth === undefined || this._compassWinW !== window.innerWidth) {
            this._compassWinW = window.innerWidth;
            this._compassHalfWidth = bar.clientWidth / 2;
        }
        const half = this._compassHalfWidth;

        const dx = this.camera.target[0] - this.camera.position[0];
        const dz = this.camera.target[2] - this.camera.position[2];
        const target = (((Math.atan2(dx, dz) * 180 / Math.PI) % 360) + 360) % 360;

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
        if (this.shelter?.isBuilt) markers.push({ id: 'shelter', pos: this.shelter.position, icon: '⛺' });
        if (this.campfire && this.campfire.isBuilt) {
            markers.push({ id: 'campfire', pos: this.campfire.position, icon: '🔥' });
        }
        if (this.raftAssembly) {
            markers.push({ id: 'raft', pos: this.raftAssembly.position, icon: '⛵' });
        }

        if (!this._compassMarkerEls) this._compassMarkerEls = new Map();
        const pool = this._compassMarkerEls;
        const live = new Set();
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
            el.style.transform = `translateX(calc(${px.toFixed(2)}px - 50%))`;
        }

        for (const [id, el] of pool) {
            if (!live.has(id)) el.style.visibility = 'hidden';
        }
    }

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

    _updateFpsCounter() {
        const el = this._domCache.fpsCounter;
        if (!el || el.classList.contains('hidden')) return;

        const fps = this.engine.loop.fps;
        el.textContent = `${fps} FPS`;
        el.classList.toggle('warn', fps < 45 && fps >= 25);
        el.classList.toggle('bad', fps < 25);
    }

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

        const drawWireframe = this._domCache.wireframe ? this._domCache.wireframe.checked : false;
        const drawMode = drawWireframe ? gl.LINES : gl.TRIANGLES;
        const animateWater = this._domCache.water ? this._domCache.water.checked : true;

        this.frustum.update(this.camera.projectionMatrix, this.camera.viewMatrix);
        this._drawCalls = 0;

        this.postFx.resize(gl.canvas.width, gl.canvas.height);
        this.postFx.beginScene();

        const skyColors = this.dayNight.getSkyColors();
        const cloudCover = this.weather.cloudCover;
        const weatherDim = 1.0 - cloudCover * 0.3;

        gl.clear(gl.DEPTH_BUFFER_BIT);

        this._renderSky();

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

        this.basicShader.use();
        
        this.basicShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.basicShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.basicShader.setUniform3fv('uViewPosition', this.camera.position);

        this.basicShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.basicShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.basicShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.basicShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.basicShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);
        const campaignLight = this.campaign?.lighting();
        this.basicShader.setUniform3fv('uPointLightPosition', campaignLight?.position || this.campfire.getLightPosition());
        this.basicShader.setUniform3fv('uPointLightColor', campaignLight?.color || this.campfire.lightColor);
        this.basicShader.setUniform1f(
            'uPointLightIntensity',
            campaignLight?.intensity ?? (this.campfire.isBuilt ? this.campfire.lightIntensity : 0.0)
        );
        this.basicShader.setUniform1f('uPointLightRange', campaignLight?.range || this.campfire.lightRange);
        this.basicShader.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);

        this.terrain.draw(this.basicShader);
        this.campaign?.draw(this.basicShader, drawMode);

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

        for (const resource of this.resourceManager.worldResources) {
            if (!this._isVisible(resource.position, 1.5)) continue;
            resource.draw(this.basicShader, drawMode);
            this._drawCalls++;
        }

        this.debrisManager.drawAll(this.basicShader, drawMode);

        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, false);
        }

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

        for (const creature of this.creatures) {
            if (!this._isVisible(creature.position, 2.0)) continue;
            creature.draw(this.basicShader, drawMode);
            this._drawCalls++;
        }

        this.projectileSystem.draw(this.basicShader, drawMode);

        this.shelter.draw(this.basicShader, drawMode);
        this.campfire.draw(this.basicShader, drawMode);

        this.waterCollector.draw(this.basicShader, drawMode);

        if (this.waterfall) {
            this.waterfall.drawSolid(this.basicShader, drawMode);
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.basicShader.use();
        if (this.raftAssembly) {
            this.raftAssembly.draw(this.basicShader, drawMode, true);
        }

        if (this.waterfall) {
            this.waterfall.draw(this.basicShader, drawMode);
        }
        
        gl.disable(gl.CULL_FACE);

        this.waterShader.use();

        this.waterShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.waterShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.waterShader.setUniform3fv('uViewPosition', this.camera.position);

        this.waterShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.waterShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.waterShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.waterShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.waterShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);

        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', animateWater ? 1.0 : 0.0);
        this.waterShader.setUniform1f('uWaveAmplitude', this.weather.getWaveAmplitudeMultiplier());
        this.waterShader.setUniform1f('uWaveSpeed', this.weather.getWaveSpeedMultiplier());
        this.waterShader.setUniform1f('uWaveAttenStart', WaveField.attenStart);
        this.waterShader.setUniform1f('uWaveAttenEnd', WaveField.attenEnd);
        this.waterShader.setUniform2f('uWaveHeading', WaveField.heading[0], WaveField.heading[1]);

        const horizonColor = skyColors.horizon;
        this.waterShader.setUniform3fv('uHorizonColor', [
            horizonColor[0] * weatherDim,
            horizonColor[1] * weatherDim,
            horizonColor[2] * weatherDim
        ]);
        this.waterShader.setUniform3fv('uShallowColor', [0.24, 0.66, 0.62]);

        this.waterShader.setUniform1f('uDetailStrength', animateWater ? 0.6 : 0.0);
        this.waterShader.setUniform1f('uFoamStrength', 1.0);

        const whitecaps = Math.min(1.0, Math.max(0.0, (this.weather.windSpeed - 1.0) / 2.0));
        this.waterShader.setUniform1f('uWhitecaps', animateWater ? whitecaps : 0.0);

        this.waterShader.setUniform1f('uLightningFlash', this.weather.getLightningModulation());

        const sunDir = this.dayNight.getSunDirection();
        const sunCol = this.dayNight.getSunColor();
        this.waterShader.setUniform3fv('uSunDirection', sunDir);
        this.waterShader.setUniform3fv('uSunColor', sunCol);
        this.waterShader.setUniform1f('uSunGlitter', 0.6);

        this.water.draw(this.waterShader);

        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);

        this.particleSystem.draw(this.camera);

        this.rainSystem.draw(this.camera, this.shelter);

        if (!this.skyShader) {
            this.unlitShader.use();
            this.sunSprite.draw(this.unlitShader, this.camera.viewMatrix, this.camera.projectionMatrix, this.camera.position, this.tempMatrix);
            this.moonSprite.draw(this.unlitShader, this.camera.viewMatrix, this.camera.projectionMatrix, this.camera.position, this.tempMatrix);
        }

        if (this.collisionDebug && this.collisionDebug.isEnabled()) {
            const colliders = this.collisionSystem.getColliders();
            this.collisionDebug.draw(
                this.basicShader,
                this.camera.viewMatrix,
                this.camera.projectionMatrix,
                colliders
            );
        }

        if (!this.isEscaping && !this.isFishing && !this.campaign?.ending.state) {
            this.firstPersonViewModel.draw(this.basicShader, this.camera.projectionMatrix, drawMode);
        }

        this._compositeFrame();
    }

    _compositeFrame() {
        if (!this.postFx.enabled) return;

        const settings = this.engine.settings;
        const sunColor = this.dayNight.getSunColor();
        const sunIntensity = this.dayNight.getSunIntensity();

        const tintStrength = 0.04 * sunIntensity;
        const tint = [
            1.0 + (sunColor[0] - 1.0) * tintStrength,
            1.0 + (sunColor[1] - 1.0) * tintStrength,
            1.0 + (sunColor[2] - 1.0) * tintStrength,
        ];

        const lightning = this.weather.getLightningModulation();
        const exposure = 1.0 + lightning * 0.35;

        const bloomBoost = 0.75 + (1.0 - sunIntensity) * 0.35;

        this.postFx.composite({
            bloom: settings.get('bloom'),
            bloomIntensity: settings.get('bloomIntensity') * bloomBoost,
            bloomThreshold: 0.9,
            vignette: settings.get('vignette') ? 0.20 : 0.0,
            exposure,
            tint,
            iterations: 2,
        });
    }

    _isVisible(position, radius) {
        return this.frustum.isVisible(position, radius, this.camera.position, this._viewDistance);
    }


    _pauseGame() {
        if (this.isPaused || this.isEscaping) return;
        this._cancelPendingCombat();
        this.isPaused = true;

        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.remove('hidden');

        this._updatePauseSoundButton(this.engine.audio.isMuted);

        this.engine.input.releasePointerLock();
        this._syncPointerLockHint();

        this.engine.audio.playClick();
        this.engine.audio.setDucked(true);
    }

    _resumeGame() {
        if (!this.isPaused) return;
        this.isPaused = false;

        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');
        this.engine.audio.setDucked(false);

        this.engine.input.requestPointerLock();
        this._syncPointerLockHint();
    }

    _syncPointerLockHint() {
        if (!this._pointerLockHint) return;
        const inventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        const auxiliaryMenuOpen = this.menuUI && this.menuUI.isAnyOpen();
        const escapePromptOpen = this.escapeHud && !this.escapeHud.classList.contains('hidden');
        const show = !this.engine.input.mouse.isLocked && !this.isPaused && !inventoryOpen
            && !auxiliaryMenuOpen && !escapePromptOpen && !this._isGameOver && !this.isEscaping && !this.campaign?.ending.state;
        this._pointerLockHint.classList.toggle('hidden', !show);
    }

    _updatePauseSoundButton(isMuted) {
        if (!this._pauseSoundBtn) return;

        this._pauseSoundBtn.innerHTML =
            `<svg class="ui-icon" aria-hidden="true"><use href="#i-volume${isMuted ? '-off' : ''}"/></svg>` +
            `<span class="btn-text">ÂM THANH: ${isMuted ? 'TẮT' : 'BẬT'}</span>`;
        this._pauseSoundBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    }


    _getTotalInventoryCount() {
        let total = 0;
        const all = this.inventory.getAll();
        for (const key in all) {
            total += all[key];
        }
        return total;
    }

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

    _openTreasureChest(chest) {
        chest.collect();
        this.stats.chestsOpened++;
        this.engine.audio.playPickup();

        this.particleSystem.emit(
            [chest.position[0], chest.position[1] + 0.5, chest.position[2]],
            ParticleSystem.PRESET.CRAFT
        );

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
        this.inventoryController.renderCraftingPanel();
    }

    _quadrantRewardType(quadrant) {
        if (!quadrant) return 'materials';
        const { sx, sz } = quadrant;
        if (sx < 0 && sz > 0) return 'fishing';
        if (sx > 0 && sz < 0) return 'sail';
        if (sx > 0 && sz > 0) return 'motor';
        return 'materials';
    }

    async _restartWorld() {
        if (!this.activeWorldId) return;
        await this.saveController.reset();
        this.engine.pendingLoad = null;
        this.victoryScreen?.classList.add('hidden');
        this.gameoverScreen?.classList.add('hidden');
        this.engine.scenes.switchScene('Game');
    }

    _showGameOver() {
        if (this.campaign) { this._cancelPendingCombat(); this.campaign.onDeath(); return; }
        this._cancelPendingCombat();
        this._isGameOver = true;

        this.saveController.finish('dead');
        this.stats.survivalSeconds = this.survivalSeconds;
        this.achievements.evaluate(this.stats);

        this.engine.audio.playDeath();
        this.engine.audio.setDucked(true);
        this.engine.audio.setHealthFraction(0);
        this.engine.audio.setMusicMood('calm');

        if (this.gameoverScreen) {
            this.gameoverScreen.classList.remove('hidden');
        }

        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');

        const mins = Math.floor(this.survivalSeconds / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.survivalSeconds % 60).toString().padStart(2, '0');
        if (this.gameoverTimeEl) {
            this.gameoverTimeEl.textContent = `${mins}:${secs}`;
        }

        this.engine.input.releasePointerLock();
    }

    _showNotification(message) {
        const container = document.getElementById('pickup-notification');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerHTML = message;
        container.appendChild(toast);

        while (container.children.length > 4) {
            container.removeChild(container.firstChild);
        }

        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3100);
    }

    _startEscapeCutscene() {
        this._cancelPendingCombat();
        this.isEscaping = true;
        if (this.escapeHud) {
            this.escapeHud.classList.add('hidden');
        }
        this.inventoryController.closeMenu();

        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');
        this.engine.input.releasePointerLock();

        this.tutorial.skip();

        this.engine.audio.playClick();
    }


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

            const biomeGen = this.world.biomeGenerator;
            if (biomeGen && biomeGen.getBiome(x, z, y) !== BiomeType.FOREST) continue;

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

    _spawnSharks() {
        const gl = this.gl;
        const count = 3;
        const island = this.world.terrainGenerator.island;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = island.radius + 5 + Math.random() * 8;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const waterY = 0.1;

            const shark = new Shark(gl, [x, waterY, z], this.engine.assets.getModel('creature:shark'));
            shark.onDeath = (lootTable, pos) => this._creatureDropLoot(lootTable, pos);
            this.creatures.push(shark);
        }
        console.log(`GameScene: Spawned ${count} sharks`);
    }

    _creatureDropLoot(lootTable, position) {
        for (const entry of lootTable) {
            if (Math.random() > entry.chance) continue;

            const count = entry.count || 1;
            for (let i = 0; i < count; i++) {
                const offsetX = count > 1 ? (Math.random() - 0.5) * 1.2 : 0;
                const offsetZ = count > 1 ? (Math.random() - 0.5) * 1.2 : 0;
                this.resourceManager.spawnResource(
                    this.gl, entry.resourceId,
                    position[0] + offsetX, position[2] + offsetZ,
                    this.terrain,
                    { allowWater: true }
                );
            }
        }
    }

    _handleCombatInput() {
        if (this._isGameOver || this.isPaused) return;

        const hotbarIdx = 20 + this.inventory.selectedHotbarIndex;
        const equippedItem = this.inventory.slots[hotbarIdx];

        const aimYaw = this._getAimYaw();
        this.player.rotation[1] = aimYaw;
        this.player.updateModelMatrix();

        const equippedDef = equippedItem ? getResourceDef(equippedItem.id) : null;
        if (!equippedDef?.weaponType || equippedDef.weaponType === 'melee') {
            const pendingAttack = this.combatSystem.beginAttack({
                origin: this.camera.position,
                direction: this._getAimDirection(),
                yaw: aimYaw,
                equippedItem,
                creatures: this.creatures,
            });
            if (!pendingAttack) return;

            this._pendingMeleeImpact = { pendingAttack, equippedItem };
            const weaponId = equippedItem?.id || 'fist';
            this.firstPersonViewModel.beginAttack(weaponId);
            this._playWeaponStartFeedback(weaponId);
            return;
        }

        const result = this.combatSystem.attack(
            this.player.position,
            aimYaw,
            equippedItem,
            this.creatures,
            this.inventory
        );

        if (result.reason === 'no_ammo') {
            this._attackHoldBlocked = true;
            this._showNotification('➵ Hết tên! Chế tạo thêm tên để bắn cung.');
            return;
        }

        if (!result.swung) return;

        this._applyCombatImpactFeedback(result, null, equippedItem, true);
    }

    _beginBowCharge(equippedItem) {
        const chargeState = this.combatSystem.beginBowCharge({
            equippedItem,
            inventory: this.inventory,
        });
        if (chargeState?.reason === 'no_ammo') {
            this._attackHoldBlocked = true;
            this._showNotification('➵ Hết tên! Chế tạo thêm tên để bắn cung.');
            return;
        }
        if (!chargeState) return;
        this._pendingBowCharge = chargeState;
        this.firstPersonViewModel.beginBowCharge();
    }

    _releaseBow() {
        if (!this._pendingBowCharge) return;
        const charge = this.firstPersonViewModel.releaseBow();
        const spec = this.combatSystem.releaseBow(this._pendingBowCharge, {
            origin: this.camera.position,
            direction: this._getAimDirection(),
            charge,
            inventory: this.inventory,
        });
        this._pendingBowCharge = null;
        if (!spec || spec.reason) return;
        this.projectileSystem.spawnArrow(spec);
        this.engine.audio.playBowRelease(null);
        this.movementFeedback.triggerCombatKick(0.014);
    }

    _handleProjectileImpact(impact) {
        this.engine.audio.playArrowImpact(impact.point);
        this.particleSystem.emit(impact.point, {
            count: 5,
            color: impact.creature ? [0.95, 0.45, 0.12] : [0.58, 0.48, 0.34],
            colorVariance: 0.12,
            size: 3,
            sizeVariance: 2,
            speed: 1.6,
            speedVariance: 0.7,
            lifetime: 0.28,
            lifetimeVariance: 0.1,
            gravity: -2.5,
            spread: 0.4,
            yBias: 0.8,
        });
        if (!impact.creature) return;
        this._applyCombatImpactFeedback({
            hit: true,
            creature: impact.creature,
            damage: impact.damage,
            swung: true,
        }, null, { id: 'bow' }, false);
    }

    _playWeaponStartFeedback(weaponId) {
        if (weaponId === 'fist') {
            this.engine.audio.playPunch(null);
            this.movementFeedback.triggerCombatKick(0.008);
        } else if (weaponId === 'spear') {
            this.engine.audio.playThrust(null);
            this.movementFeedback.triggerCombatKick(0.012);
        } else {
            this.engine.audio.playSwing(null);
            this.movementFeedback.triggerCombatKick(0.018);
        }
    }

    _resolvePendingMeleeImpact(weaponEvent) {
        const pending = this._pendingMeleeImpact;
        this._pendingMeleeImpact = null;
        if (!pending || this.isPaused || this._isGameOver || this.isEscaping) return;
        if (weaponEvent.weaponId !== pending.pendingAttack.weaponData.id) return;
        const inventoryOpen = this.inventoryMenu && !this.inventoryMenu.classList.contains('hidden');
        if (inventoryOpen) return;

        if (this.campaign && pending.pendingAttack.target && this.campaign.collision.segmentBlocked(
            pending.pendingAttack.origin, Array.from(pending.pendingAttack.target.position))) pending.pendingAttack.target = null;
        const result = this.combatSystem.resolveImpact(pending.pendingAttack);
        const treeResult = result.hit || !['stone_axe', 'iron_axe'].includes(pending.pendingAttack.weaponData.id)
            ? null
            : this._tryChopTree(
                pending.pendingAttack.origin,
                pending.pendingAttack.yaw,
                pending.equippedItem
            );
        this._applyCombatImpactFeedback(result, treeResult, pending.equippedItem, false);
    }

    _cancelPendingCombat() {
        this._pendingMeleeImpact = null;
        this._pendingBowCharge = null;
        this.firstPersonViewModel?.cancel();
    }

    _applyCombatImpactFeedback(result, treeResult, equippedItem, playSwingAudio) {
        if (!result.swung) return;

        const weaponType = equippedItem
            ? (getResourceDef(equippedItem.id) || {}).weaponType
            : 'melee';
        const swingPos = result.creature
            ? result.creature.position
            : (treeResult && treeResult.tree ? treeResult.tree.position : null);
        if (weaponType === 'ranged' && playSwingAudio) {
            this.engine.audio.playBowRelease(swingPos);
        } else if (treeResult && treeResult.hit) {
            this.engine.audio.playChop(swingPos);
        } else if (playSwingAudio) {
            this.engine.audio.playSwing(swingPos);
        }

        if (result.hit) {
            const killed = result.creature.state === CreatureState.DEAD;
            if (killed) this.stats.creaturesKilled++;
            this._showNotification(killed
                ? `💀 Hạ gục! -${result.damage} máu`
                : `⚔️ Trúng! -${result.damage} máu`);

            const creatureKind = result.creature.constructor.name.toLowerCase();

            if (killed) {
                this.engine.audio.playCreatureDie(creatureKind, result.creature.position);
                this._showHitMarker(true);
            } else {
                if (weaponType !== 'ranged') {
                    this.engine.audio.playHit(result.creature.position);
                }
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
            this._showNotification('💨 Đánh trượt!');
        }
    }

    _tryChopTree(playerPosition, playerYaw, equippedItem) {
        if (!equippedItem || !['stone_axe', 'iron_axe'].includes(equippedItem.id)) return { hit: false, tree: null };
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
            if (this.campaign?.collision.segmentBlocked(playerPosition, tree.getTreePoint(0.14))) continue;

            if (distance > 0.0001) {
                const dot = (dx / distance) * facingX + (dz / distance) * facingZ;
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle > TREE_CHOP_HALF_ARC) continue;
            }

            closestTree = tree;
            closestDistance = distance;
        }

        if (!closestTree) return { hit: false, tree: null };

        const chopResult = closestTree.chop(playerPosition, equippedItem.id === 'iron_axe' ? 2 : 1);
        if (chopResult.felled && this.collisionSystem) {
            this.collisionSystem.unregister(closestTree);
        }
        if (chopResult.felled && closestTree.worldObjectId != null) {
            this.removedEnvironmentObjectIds.add(closestTree.worldObjectId);
        }
        return { ...chopResult, tree: closestTree };
    }

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

    _getAimYaw() {
        const dx = this.camera.target[0] - this.camera.position[0];
        const dz = this.camera.target[2] - this.camera.position[2];
        if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
            return this.player.rotation[1];
        }
        return Math.atan2(dx, dz);
    }

    _getAimDirection() {
        const dx = this.camera.target[0] - this.camera.position[0];
        const dy = this.camera.target[1] - this.camera.position[1];
        const dz = this.camera.target[2] - this.camera.position[2];
        const length = Math.hypot(dx, dy, dz);
        if (length <= 0.0001) return [Math.sin(this.player.rotation[1]), 0, Math.cos(this.player.rotation[1])];
        return [dx / length, dy / length, dz / length];
    }

    _isPlayerInExposureWater() {
        const x = this.player.position[0];
        const z = this.player.position[2];
        const height = this.terrain.getHeight(x, z);
        const biome = this.world?.biomeGenerator?.getBiome(x, z, height);
        return biome === BiomeType.OCEAN || !!this.waterfall?.isPlayerInPond(this.player.position);
    }

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

    _showDamageFlash() {
        if (!this._damageFlash) {
            this._damageFlash = document.createElement('div');
            this._damageFlash.id = 'damage-vignette';
            this._damageFlash.className = 'damage-vignette hidden';
            document.body.appendChild(this._damageFlash);
        }
        this._damageFlash.classList.remove('hidden');
        this._damageFlash.classList.remove('damage-vignette-fade');
        void this._damageFlash.offsetWidth;
        this._damageFlash.classList.add('damage-vignette-fade');
        if (this._damageFlashTimer) clearTimeout(this._damageFlashTimer);
        this._damageFlashTimer = setTimeout(() => {
            this._damageFlash.classList.add('hidden');
            this._damageFlash.classList.remove('damage-vignette-fade');
        }, 600);
    }


    destroy() {
        this.campaign?.dispose();
        this.campaign = null;
        console.log('GameScene: Destroying meshes and shader programs...');
        this._cancelPendingCombat();
        if (this.engine.input.onPointerLockChange === this._onPointerLockChange) {
            this.engine.input.onPointerLockChange = null;
        }
        this.engine.input.releasePointerLock();
        this.engine.input.setPointerLockEnabled(false);
        if (this._pointerLockHint) this._pointerLockHint.classList.add('hidden');
        if (this.saveController) {
            this.saveController.dispose();
            this.saveController = null;
        }
        if (this.inventoryController) {
            this.inventoryController.dispose();
            this.inventoryController = null;
        }
        if (this.objectiveTracker) {
            this.objectiveTracker.dispose();
            this.objectiveTracker = null;
        }
        this.interactionController = null;

        const dom = this._domCache || {};
        for (const el of [dom.compassBar, dom.timeWeatherWidget, dom.crosshair, dom.hitMarker]) {
            if (el) el.classList.add('hidden');
        }
        if (dom.compassMarkers) dom.compassMarkers.replaceChildren();
        this._compassMarkerEls = null;


        if (this.basicShader) this.basicShader.delete();
        if (this.waterShader) this.waterShader.delete();
        if (this.unlitShader) this.unlitShader.delete();

        if (this.terrain) this.terrain.delete();
        if (this.water) this.water.delete();

        if (this.characterRenderer) this.characterRenderer.delete();
        if (this.firstPersonViewModel) this.firstPersonViewModel.delete();
        if (this.projectileSystem) this.projectileSystem.delete();

        if (this.raftAssembly) this.raftAssembly.delete();
        if (this.waterfall) this.waterfall.delete();
        if (this.resourceManager) this.resourceManager.delete();
        if (this.debrisManager) this.debrisManager.delete();
        if (this.inventory) this.inventory.clear();
        if (this._notificationTimeoutId) {
            clearTimeout(this._notificationTimeoutId);
        }

        if (this.creatures) {
            for (const creature of this.creatures) {
                creature.delete();
            }
            this.creatures = [];
        }
        this.wildlife = null;

        if (this.particleSystem) this.particleSystem.delete();
        if (this.rainSystem) this.rainSystem.delete();

        if (this.sunSprite) this.sunSprite.delete();
        if (this.moonSprite) this.moonSprite.delete();

        if (this.skyShader) {
            this.skyShader.delete();
            this.skyShader = null;
        }
        if (this.skyVao) {
            this.gl.deleteVertexArray(this.skyVao);
            this.skyVao = null;
        }

        if (this.tutorial) this.tutorial.destroy();

        if (this.shelter) this.shelter.delete();
        if (this.campfire) this.campfire.delete();
        if (this.waterCollector) this.waterCollector.delete();

        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                entity.delete();
            }
            this.environmentEntities = [];
        }

        if (this.collisionSystem) {
            this.collisionSystem.clear();
            this.collisionSystem = null;
        }
        if (this.collisionDebug) {
            this.collisionDebug.delete();
            this.collisionDebug = null;
        }

        if (this._pauseResumeBtn) this._pauseResumeBtn.removeEventListener('click', this._onPauseResume);
        if (this._pauseSoundBtn) this._pauseSoundBtn.removeEventListener('click', this._onPauseSound);
        if (this._pauseMenuBtn) this._pauseMenuBtn.removeEventListener('click', this._onPauseMenu);
        if (this._pauseSaveBtn) this._pauseSaveBtn.removeEventListener('click', this._onPauseSave);
        if (this._pauseSettingsBtn) this._pauseSettingsBtn.removeEventListener('click', this._onPauseSettings);
        if (this._pauseAchievementsBtn) this._pauseAchievementsBtn.removeEventListener('click', this._onPauseAchievements);
        if (this._pauseGuideBtn) this._pauseGuideBtn.removeEventListener('click', this._onPauseGuide);
        if (this.restartBtn) this.restartBtn.removeEventListener('click', this._onRestart);
        if (this.gameoverRestartBtn) this.gameoverRestartBtn.removeEventListener('click', this._onRestart);
        this.escapeBtn?.removeEventListener('click', this._onEscape);
        this.toggleBiomeColorsEl?.removeEventListener('change', this._onToggleBiomeColors);
        this.debugCollisionEl?.removeEventListener('change', this._onToggleCollisionDebug);

        if (this._unsubscribeSettings) {
            this._unsubscribeSettings();
            this._unsubscribeSettings = null;
        }
        this._motionPreference?.removeEventListener('change', this._onMotionPreference);
        this._motionPreference = null;
        this._onMotionPreference = null;
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

        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');

        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.add('hidden');
        if (this._domCache?.coldVignette) this._domCache.coldVignette.style.opacity = '0';

        const hotbarHud = document.getElementById('hotbar-hud');
        if (hotbarHud) hotbarHud.classList.add('hidden');

        this.engine.audio.stopAmbientWaves();
        this.engine.audio.stopWind();
        this.engine.audio.stopRain();
        this.engine.audio.stopMusic();
        this.engine.audio.removeEmitter('waterfall');
        this.engine.audio.removeEmitter('campfire');

        if (this._damageFlash && this._damageFlash.parentNode) {
            this._damageFlash.parentNode.removeChild(this._damageFlash);
        }
        if (this._damageFlashTimer) clearTimeout(this._damageFlashTimer);
        if (this._hitMarkerTimeout) clearTimeout(this._hitMarkerTimeout);

        const toastContainer = document.getElementById('pickup-notification');
        if (toastContainer) toastContainer.innerHTML = '';

    }

    _regenerateWorld() {
        console.log(`GameScene: Regenerating world with debugBiomeColors = ${this.debugBiomeColors}`);
        const gl = this.gl;

        this.world = this.worldGenerator.generate(
            this.worldSeed, 
            this.engine.assets.environmentMetadata, 
            this.debugBiomeColors
        );
        
        this.terrain.rebuild(this.world.terrain, this.world.terrainGenerator);
        
        if (this.environmentEntities) {
            for (const entity of this.environmentEntities) {
                entity.delete();
            }
        }
        this.environmentEntities = [];
        this.removedEnvironmentObjectIds = new Set();
        
        for (const [worldObjectIndex, obj] of this.world.placedObjects.entries()) {
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
                entity.worldObjectId = String(worldObjectIndex);
                this.environmentEntities.push(entity);
            }
        }
        
        if (this.resourceManager) {
            this.resourceManager.delete();
            this.resourceManager.worldResources = [];
            for (const node of this.world.resourceNodes) {
                this.resourceManager.spawnResource(
                    gl,
                    node.id,
                    node.position[0],
                    node.position[2],
                    this.terrain
                );
            }
        }

        if (this.shelter?.isBuilt) {
            this.shelter.position[1] = this.terrain.getHeight(this.shelter.position[0], this.shelter.position[2]);
            this.shelter.updateModelMatrix();
        }
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

        if (this.resourceManager && this.world.landmarks && this.world.landmarks.treasureChests) {
            for (const spot of this.world.landmarks.treasureChests) {
                const chest = this.resourceManager.spawnResource(gl, 'treasure_chest', spot.position[0], spot.position[2], this.terrain);
                if (chest) chest.rewardType = this._quadrantRewardType(spot.quadrant);
            }
        }

        if (this.raftAssembly) {
            this.raftAssembly.position[0] = this.world.buildArea[0];
            this.raftAssembly.position[1] = this.world.buildArea[1];
            this.raftAssembly.position[2] = this.world.buildArea[2];
            this.raftAssembly.updateModelMatrix();
        }

        const py = this.terrain.getHeight(this.player.position[0], this.player.position[2]);
        this.player.position[1] = py + this.player.collider.height * 0.5;
        this.player.updateModelMatrix();

        this._updateWorldDebugInfo();
    }

    _updateWorldDebugInfo() {
        const seedEl = document.getElementById('debug-world-seed');
        if (seedEl) seedEl.textContent = this.worldSeed;

        const gentimeEl = document.getElementById('debug-world-gentime');
        if (gentimeEl) gentimeEl.textContent = `${this.world.generationTimeMs.toFixed(1)} ms`;

        const objcountEl = document.getElementById('debug-world-objcount');
        if (objcountEl) objcountEl.textContent = this.world.objectCount.toString();

        const timeLabel = document.getElementById('debug-time-label');
        if (timeLabel) timeLabel.textContent = this.dayNight.getTimeLabel();

        const timeOfDay = document.getElementById('debug-time-of-day');
        if (timeOfDay) timeOfDay.textContent = (this.dayNight.timeOfDay * 24).toFixed(1) + 'h';

        const weatherLabel = document.getElementById('debug-weather-label');
        if (weatherLabel) weatherLabel.textContent = this.weather.getWeatherLabel();
    }

    _updateInvViewProj() {
        Mat4.multiply(this._viewProj, this.camera.projectionMatrix, this.camera.viewMatrix);
        Mat4.invert(this._invViewProj, this._viewProj);
    }

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
