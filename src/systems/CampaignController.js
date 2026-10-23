import { GameEvents } from './GameEvents.js';
import { StructureRegistry } from './StructureRegistry.js';
import { ProductionSystem } from './ProductionSystem.js';
import { CampaignProgression } from './CampaignProgression.js';
import { CampaignUI } from './CampaignUI.js';
import { ItemContainer, transactCraft } from './ItemContainer.js';
import { CAMPAIGN_BALANCE, CAMPAIGN_DIFFICULTY, STRUCTURE_DEFINITIONS } from '../gameplay/CampaignDatabase.js';
import { CAMPAIGN_JOURNALS } from '../gameplay/CampaignStory.js';
import { getResourceDef } from './ResourceDatabase.js';
import { Mat4 } from '../math/Mat4.js';
import { getSleepPlan } from './SleepSystem.js';
import { SpatialGrid } from './SpatialGrid.js';
import { FishingSystem } from './FishingSystem.js';
import { DebrisHook } from './DebrisHook.js';
import { Mesh } from '../renderer/Mesh.js';
import { createCubeData } from '../renderer/CubeGeometry.js';
import { TriangleCollision } from './TriangleCollision.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';
import { buildCampaignLandmarks } from '../gameplay/world/CampaignLandmarks.js';
import { journalSearchLayout } from '../gameplay/world/JournalSearch.js';
import { CampaignEndings, raftCoursePosition } from './CampaignEndings.js';
import { CampaignWorldEvents } from './CampaignWorldEvents.js';
import { findCampaignRespawn } from './CampaignRespawn.js';
import { RepairCircuit } from './RepairCircuit.js';
import { FieldSurvey } from './FieldSurvey.js';
import { WreckSalvage } from './WreckSalvage.js';
import { MineExtraction, MINE_WORK_SECONDS, MINE_BATCH_SIZE } from './MineExtraction.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Bridges the reusable campaign simulation to the existing first-person scene. */
export class CampaignController {
    constructor(scene) {
        this.scene = scene;
        this.events = new GameEvents();
        this.progress = new CampaignProgression(this.events, { blueprints: scene.unlockedBlueprints });
        this.environmentIndex = new SpatialGrid(8);
        for (const entity of scene.environmentEntities) {
            if (entity.collider?.type === 'none' || !entity.collision) continue;
            const radius = entity.collisionRadius || 0.5;
            const bounds = { min: [entity.position[0] - radius, entity.position[1], entity.position[2] - radius],
                max: [entity.position[0] + radius, entity.position[1] + (entity.collider.height || 2), entity.position[2] + radius] };
            this.environmentIndex.insert(entity.worldObjectId, bounds, { ...bounds, entity });
        }
        this.registry = new StructureRegistry({ terrain: scene.terrain, level: () => this.progress.tier,
            events: this.events, protectedAreas: [...scene.world.pois.filter(poi => poi.id !== 'wreck_beach'),
                ...Object.values(journalSearchLayout(scene.world)).map(site => ({ position: site.base, radius: 3 }))],
            obstacles: bounds => this.environmentIndex.query(bounds).filter(record => !scene.removedEnvironmentObjectIds.has(record.entity.worldObjectId)) });
        this.production = new ProductionSystem(this.registry, { blueprints: this.progress.blueprints });
        this.islandEvents = new CampaignWorldEvents(scene.world, this.registry, this.events);
        this.stationCircuit = new RepairCircuit(scene.world.seed);
        this.fieldSurvey = new FieldSurvey(scene.world.seed);
        this.wreckSalvage = new WreckSalvage();
        this.mineExtraction = new MineExtraction();
        this.resourceIndex = new SpatialGrid(8);
        this.resourceIndexTimer = 0;
        this.playSeconds = 0;
        this.markers = [];
        this.discovered = new Set();
        this.deathBags = [];
        this.nextBag = 1;
        this.claimedCaches = new Set();
        this.deaths = 0;
        this.respawnProtection = 0;
        this.saveTimer = 0;
        this.matrix = Mat4.create();
        this.staticModels = [];
        this.collision = new TriangleCollision();
        scene.projectileSystem.modelCollision = this.collision;
        this.pinnedRecipe = null;
        this.pinnedObjective = null;
        this.torchLit = true;
        this.difficulty = CAMPAIGN_DIFFICULTY[scene.engine.activeWorld.difficulty] || CAMPAIGN_DIFFICULTY.standard;
        scene.dayNight.daySpeed = 1 / CAMPAIGN_BALANCE.daySeconds;
        scene.player.scaleFactor = 1;
        scene.player.collider.height = 1.8;
        scene.player.collider.radius = 0.28;
        scene.player.scale.set([0.8, 1.8, 0.8]);
        const spawn = scene.world.spawnPosition;
        scene.player.position.set([spawn[0], spawn[1] + 0.9, spawn[2]]);
        scene.camera._firstUpdate = true;
        scene.characterRenderer.draw = () => {};
        scene.vitals.hungerDrainRate = CAMPAIGN_BALANCE.hungerDrainPerSecond * this.difficulty.metabolism;
        scene.vitals.thirstDrainRate = CAMPAIGN_BALANCE.thirstDrainPerSecond * this.difficulty.metabolism;
        scene.vitals.healthDrainRate *= this.difficulty.damage;
        const applyDamage = scene.vitals.applyDamage.bind(scene.vitals);
        scene.vitals.applyDamage = (amount, source) => {
            if (this.respawnProtection <= 0) applyDamage(amount * this.difficulty.damage, source);
        };
        scene.shelter.draw = scene.campfire.draw = scene.waterCollector.draw = () => {};
        scene.shelter.covers = position => this.registry.sheltered(position);
        scene.campfire.isPlayerInWarmthRange = position => [...this.registry.structures.values()]
            .some(record => this.production.isBurning(record) && distance(record.position, position) <= 4.5);
        scene.objectiveTracker.update = () => this.ui?.refreshHUD();
        this.ui = new CampaignUI(this);
        this.ropeMesh = new Mesh(scene.gl, createCubeData(0.65, 0.49, 0.28));
        this.fishing = new FishingSystem({ onCaught: (id, count, shoalId) => {
            scene.stats.fishCaught += count;
            this.events.emit('fishCaught', { id, count });
            if (shoalId) this.islandEvents.caughtAtShoal(shoalId);
            scene.engine.audio.playPickup();
            scene._showNotification('Đã câu được ' + getResourceDef(id).name);
            this.saveMilestone();
        }, onMessage: message => scene._showNotification(message) });
        this.hook = new DebrisHook({ onCollected: reward => {
            scene.stats.resourcesPicked += reward.count;
            this.events.emit('collected', reward);
            scene.engine.audio.playPickup();
            this.saveMilestone();
        } });
        // Sample nearby coastline water rather than spawning Classic debris at radius 50 m, inland.
        scene.debrisManager._getRandomOceanPosition = () => {
            const player = scene.player.position;
            const angle = Math.atan2(player[2], player[0]) + (Math.random() - 0.5) * 0.25;
            const radius = scene.world.terrainGenerator.island.radius + 3 + Math.random() * 14;
            return [Math.cos(angle) * radius, 0.15, Math.sin(angle) * radius];
        };
        this.events.on('collected', () => { scene.tutorial?.notifyPickup(); scene.firstPersonViewModel?.playAction('pickup'); });
        this.events.on('drank', () => scene.firstPersonViewModel?.playAction('drink'));
        this.events.on('deviceRepaired', () => scene.firstPersonViewModel?.playAction('repair'));
        this.events.on('crafted', event => { scene.firstPersonViewModel?.playAction('craft'); scene.stats.itemsCrafted += event.count; scene.tutorial?.notifyCrafted(); this.saveMilestone(); });
        this.events.on('cooked', () => { scene.firstPersonViewModel?.playAction('cook'); scene.stats.mealsCooked++; this.saveMilestone(); });
        this.events.on('chapterCompleted', event => {
            this.pinnedObjective = null;
            scene._showNotification(`Chương ${event.id} hoàn thành · ${event.title}`);
            this.saveMilestone();
        });
        this.events.on('worldOpportunity', opportunity => {
            scene._showNotification(opportunity.type === 'cargo' ? 'Sau bão có kiện hàng dạt vào bờ. Khám phá bờ biển và xem bản đồ.' : 'Có đàn cá ngoài bờ. Câu trong vùng này sẽ được thêm cá.');
            this.saveMilestone();
        });
        this.events.on('shortcutOpened', () => { this.refreshCollision(); this.saveMilestone(); });
        this.events.on('shortcutCut', () => this.saveMilestone());
        this.events.on('stormCargoClaimed', () => this.saveMilestone());
        for (const event of ['structurePlaced', 'structureRemoved']) this.events.on(event, () => {
            if (event === 'structurePlaced') scene.tutorial?.notifyBuilt();
            this.refreshCollision(); this.saveMilestone();
        });
        this.makeLandmarks();
        this.ending = new CampaignEndings(this);
        this.saveMilestone();
    }

    makeLandmarks() {
        this.landmarks = buildCampaignLandmarks(this.scene.world);
        this.staticModels = this.landmarks.models;
        this.journals = this.landmarks.journals;
        for (const record of this.staticModels) if (!record.gate && !record.id.startsWith('note-')) this.collision.add(record.id,
            this.scene.engine.assets.getModel(record.model)?.collisionGeometry, record.position, record.yaw, record.scale);
        this.refreshCollision();
    }

    refreshCollision() {
        const structures = [...this.registry.structures.values()];
        const gateOpen = !!this.progress.facts['deviceRepaired:station_gate'];
        const signature = `${gateOpen}|${this.islandEvents.shortcutOpen}|${Object.values(this.wreckSalvage.parts).map(state => +state.claimed).join('')}|` + structures.map(record => `${record.id}:${record.open}:${record.yaw}:${record.position.join(',')}`).join('|');
        if (signature === this.collisionSignature) return;
        this.collisionSignature = signature;
        for (const node of this.landmarks.salvageNodes) {
            if (this.wreckSalvage.parts[node.id].claimed) this.collision.remove(node.modelId);
            else if (!this.collision.instances.has(node.modelId)) {
                const record = this.staticModels.find(record => record.id === node.modelId);
                this.collision.add(record.id, this.scene.engine.assets.getModel(record.model)?.collisionGeometry, record.position, record.yaw, record.scale);
            }
        }
        for (const id of [...this.collision.instances.keys()]) if (id.startsWith('structure-')) this.collision.remove(id);
        for (const record of structures) {
            const def = STRUCTURE_DEFINITIONS[record.type];
            this.collision.add(record.id, this.scene.engine.assets.getModel(def.modelId)?.collisionGeometry, record.position,
                record.yaw + (record.type === 'door' && record.open ? Math.PI / 2 : 0));
        }
        for (const record of this.staticModels.filter(record => record.gate)) {
            this.collision.add(record.id, this.scene.engine.assets.getModel(record.model)?.collisionGeometry,
                record.position, record.yaw + (gateOpen ? Math.PI / 2 : 0), record.scale);
        }
        const shortcut = this.islandEvents.shortcut;
        if (this.islandEvents.shortcutOpen) this.collision.remove('event-shortcut');
        else {
            const data = createCubeData(0.4, 0.25, 0.12), size = [0.9, 0.8, 6];
            const triangles = new Float32Array([...data.indices].flatMap(i => [data.positions[i * 3] * size[0], data.positions[i * 3 + 1] * size[1], data.positions[i * 3 + 2] * size[2]]));
            this.collision.add('event-shortcut', triangles, [shortcut.position[0], shortcut.position[1] + 0.4, shortcut.position[2]], shortcut.yaw);
        }
    }

    handleInput(seconds = 0) {
        const input = this.scene.engine.input;
        if (this.ui.isOpen) {
            if (this.ending?.busy) return true;
            if (!['ending-result', 'ending-save-error', 'ending-abandon'].includes(this.ui.kind)) this.playSeconds += seconds;
            if (this.ui.kind === 'ending-result' && input.isKeyPressed('Escape')) { input.consumeKey('Escape'); return true; }
            if (input.isKeyPressed('Escape')) { this.ui.close(); input.consumeKey('Escape'); }
            return true;
        }
        if (this.scene.isPaused) return false;
        if (this.ending.state) return false;
        if (this.scene.inventoryMenu && !this.scene.inventoryMenu.classList.contains('hidden')) return false;
        if (input.isKeyPressed('Escape') && (this.fishing.state || this.hook.state)) {
            this.fishing.cancel(); this.hook.cancel();
            this.scene.isFishing = false;
            input.consumeKey('Escape');
            return true;
        }
        for (const [key, panel] of [['KeyB', 'build'], ['KeyJ', 'journal'], ['KeyM', 'map']]) {
            if (input.isKeyPressed(key)) { this.ui.open(panel); this.playSeconds += seconds; return true; }
        }
        if (this.placement && input.isKeyPressed('Escape')) {
            this.cancelPlacement();
            input.consumeKey('Escape');
            return true;
        }
        return false;
    }

    cancelPlacement() {
        this.placement = null;
        this.ui.hint('');
        // Escape can release pointer lock after this frame has handled the key.
        if (this.scene.engine.input.mouse.isLocked) this.scene._pointerUnlockPauseGuard = 0.25;
    }

    beforeUpdate(seconds, weather) {
        this.playSeconds += seconds;
        this.respawnProtection = Math.max(0, this.respawnProtection - seconds);
        if (!this.scene.multiplayer || this.scene.multiplayer.isLeader) {
            this.production.update(seconds, weather);
            this.islandEvents.update(seconds, { ...weather, isStorm: this.scene.weather.currentWeather === 'storm' });
        }
        this.resourceIndexTimer -= seconds;
        this.scene.debrisManager.update(seconds, this.scene.player.position, this.scene.inventory, null,
            this.scene.terrain, this.scene.gl, true, weather);
        const input = this.scene.engine.input;
        const landedBefore = this.fishing.state?.phase === 'landed';
        this.fishing.update(seconds, { strike: input.isMousePressed(0) || input.isActionPressed('interact'),
            reel: input.mouse.buttons[0] || input.isKeyDown('Space') }, this.scene.inventory);
        if (this.fishing.state?.phase === 'landed' && !landedBefore) this.saveMilestone();
        this.scene.isFishing = !!this.fishing.state && this.fishing.state.phase !== 'landed';
        const pendingBefore = this.hook.pending;
        this.hook.update(seconds, this.scene.player.position, this.scene.inventory);
        if (this.hook.pending && !pendingBefore) this.saveMilestone();
        this.ui.activity(this.fishing.state, this.oxygen, this.swimY, this.hook.pending, this.wreckSalvage.activity(), this.mineExtraction?.activity());
        this.progress.claimRewards(this.scene.inventory);
        const player = this.scene.player.position;
        const cellX = Math.floor((player[0] + 320) / 40), cellZ = Math.floor((player[2] + 320) / 40);
        for (let x = cellX - 1; x <= cellX + 1; x++) for (let z = cellZ - 1; z <= cellZ + 1; z++) this.discovered.add(`${x}:${z}`);
        for (const poi of this.scene.world.pois) {
            const inRange = distance(player, poi.position) < poi.radius + 4;
            if (inRange && (poi.id !== 'offshore_wreck' || this.scene.inventory.hasItem('dive_kit') && player[1] < poi.position[1] + 2.5)) {
                this.events.emit('poiVisited', { id: poi.id });
            }
        }
        // Distant terrain is a cheap LOD backdrop; keep mountain silhouettes beyond the prop draw distance.
        this.scene.terrain.setView(this.scene.camera.position, Math.max(400, this.scene.engine.settings.get('viewDistance') || 180));
        const fire = this.registry.nearby(player, 30).filter(record => this.production.isBurning(record))
            .sort((a, b) => distance(a.position, player) - distance(b.position, player))[0];
        this.scene.campfire.isBuilt = !!fire;
        if (fire) this.scene.campfire.position.set(fire.position);
        this.scene.shelter.isBuilt = [...this.registry.structures.values()].some(record => record.type === 'roof' || record.type === 'shelter');
        for (let index = this.scene.resourceManager.worldResources.length - 1; index >= 0; index--) {
            const resource = this.scene.resourceManager.worldResources[index];
            if (resource.isCollected) { resource.delete(); this.scene.resourceManager.worldResources.splice(index, 1); }
        }
        if (this.placement) this.updatePlacement();
    }

    afterMovement(seconds, previous = Array.from(this.scene.player.position)) {
        const player = this.scene.player;
        const position = player.position;
        const ground = this.scene.terrain.getHeight(position[0], position[2]);
        const maximum = this.scene.inventory.hasItem('dive_kit') ? 120 : 45;
        this.refreshCollision();
        if (ground < -0.4) {
            player.velocity[1] = 0;
            player.grounded = false;
            if (this.swimY === undefined) this.swimY = -0.25;
            const input = this.scene.engine.input;
            if (input.isKeyDown('Space')) this.swimY += seconds * 1.7;
            if (input.isKeyDown('ControlLeft') || input.isKeyDown('ControlRight')) this.swimY -= seconds * 1.7;
            this.swimY = Math.max(ground + 0.9, Math.min(-0.2, this.swimY));
            position[1] = this.swimY;
        } else {
            this.swimY = undefined;
            this.oxygen = Math.min(maximum, (this.oxygen ?? maximum) + seconds * 15);
        }
        const collisionStart = ground >= -0.4 && player.grounded !== false ? this.collision.stepUp(position, previous, this.scene.terrain, player.collider.radius, player.collider.height) : previous;
        const requestedY = position[1];
        this.collision.resolve(position, collisionStart, player.collider.radius, player.collider.height, { vertical: ground < -0.4 || player.grounded === false, grounded: ground >= -0.4 && player.grounded !== false,
            floorHeight: (x, z) => this.scene.terrain.getHeight(x, z) + player.collider.height / 2 });
        if (player.velocity[1] > 0 && position[1] < requestedY - 0.0001) player.velocity[1] = 0;
        const resolvedX = position[0], resolvedZ = position[2];
        player.constrainTerrainMovement?.(previous, this.scene.terrain);
        if (Math.hypot(position[0] - resolvedX, position[2] - resolvedZ) > 0.001) position.set(previous);
        if (ground >= -0.4) {
            const half = player.collider.height / 2;
            const floor = this.scene.terrain.getHeight(position[0], position[2]);
            const support = this.collision.groundHeight(position, floor, PLAYER_BALANCE.maxStepHeight, half, player.collider.radius) + half;
            // Preserve a fall from a ledge; only nearby support can ground the actor.
            if (player.velocity[1] <= 0 && support >= position[1] - PLAYER_BALANCE.groundSnapDistance &&
                support <= previous[1] + PLAYER_BALANCE.maxStepHeight + 0.001) {
                position[1] = support; player.velocity[1] = 0; player.grounded = true;
            }
            // A floor edge can support the feet while the raised head intersects a low roof.
            if (!this.collision.capsuleClear(position, player.collider.radius, player.collider.height)) position.set(previous);
        }
        else {
            this.swimY = position[1];
            this.oxygen = Math.min(maximum, this.oxygen ?? maximum);
            if (position[1] < -0.8) {
                this.oxygen = Math.max(0, this.oxygen - seconds);
                const deaths = this.deaths;
                if (!this.oxygen) this.scene.vitals.applyDamage(seconds * 8, 'drowning');
                if (this.deaths !== deaths) { player.updateModelMatrix(); return true; }
                this.ui.hint(`Lặn · Oxy ${Math.ceil(this.oxygen)}/${maximum}s · Space nổi lên · Ctrl lặn xuống`);
            } else this.oxygen = Math.min(maximum, this.oxygen + seconds * 15);
        }
        if (this.wreckSalvage?.active) this.updateSalvage(seconds);
        if (this.mineExtraction?.active) this.updateMining(seconds);
        player.updateModelMatrix();
    }

    salvageError(node) {
        const { inventory, player } = this.scene;
        if (!inventory.hasItem('dive_kit') || player.position[1] >= -0.8) return 'Cần bộ lặn và xuống dưới mặt nước để trục vớt.';
        if (distance(player.position, node.position) >= 2.5) return 'Tới gần bộ phận cần tháo.';
        if (this.collision.segmentBlocked(player.position, node.position, { ignoreInstances: new Set([node.modelId]) })) return 'Vỏ tàu chắn lối. Hãy bơi vòng tới mặt hở.';
        if (this.wreckSalvage.parts[node.id].progress < node.seconds && node.tools.length && !node.tools.some(id => inventory.hasItem(id))) return `Cần mang ${node.toolLabel} để tháo bộ phận này.`;
        return null;
    }

    finishSalvageResult(result) {
        if (!result) return;
        if (result.message || result.error) this.scene._showNotification(result.message || result.error);
        if (result.claimed) {
            this.refreshCollision();
            this.scene.engine.audio.playPickup();
            if (this.wreckSalvage.allClaimed() && !this.claimedCaches.has('wreck_salvage')) {
                this.claimedCaches.add('wreck_salvage');
                this.events.emit('deviceRepaired', { id: 'wreck_salvage' });
            }
        }
        if (result.claimed || result.waiting || result.paused) this.saveMilestone();
    }

    startSalvage(node) {
        const error = this.salvageError(node);
        if (error) { this.scene._showNotification(error); return; }
        this.finishSalvageResult(this.wreckSalvage.start(node.id, this.scene.inventory));
    }

    updateSalvage(seconds) {
        const node = this.landmarks.salvageNodes.find(node => node.id === this.wreckSalvage.active);
        this.finishSalvageResult(this.wreckSalvage.update(seconds, this.scene.inventory, {
            held: this.scene.engine.input.isActionDown('interact'), eligible: !!node && !this.salvageError(node),
        }));
    }

    miningError(node) {
        const { player, inventory } = this.scene;
        if (distance(player.position, node.position) >= 2.5) return 'Tới gần mặt vỉa quặng để khai thác.';
        if (this.collision.segmentBlocked(player.position, node.position, { ignoreInstances: new Set([node.modelId]) })) return 'Đá chắn đường. Hãy tới mặt mở của vỉa quặng.';
        if (this.mineExtraction.faces[node.id].progress < MINE_WORK_SECONDS && !this.mineExtraction.toolRate(inventory)) return 'Cần cuốc đá hoặc cuốc sắt để đào tiếp vỉa quặng.';
        return null;
    }

    finishMiningResult(result) {
        if (!result) return;
        if (result.message || result.error) this.scene._showNotification(result.message || result.error);
        if (result.claimed) {
            this.scene.stats.resourcesPicked += result.count;
            this.events.emit('collected', { id: result.resourceId, count: result.count });
            this.scene.engine.audio.playPickup();
        }
        if (result.claimed || result.waiting || result.paused) this.saveMilestone();
    }

    startMining(node) {
        const error = this.miningError(node);
        if (error) { this.scene._showNotification(error); return; }
        this.finishMiningResult(this.mineExtraction.start(node.id, this.scene.inventory));
    }

    updateMining(seconds) {
        const node = this.landmarks.mineFaces.find(face => face.id === this.mineExtraction.active);
        this.finishMiningResult(this.mineExtraction.update(seconds, this.scene.inventory, {
            held: this.scene.engine.input.isActionDown('interact'), eligible: !!node && !this.miningError(node),
        }));
    }

    beginPlacement(type, fromItem = false) { this.placement = { type, yaw: Math.round(this.scene.player.rotation[1] / (Math.PI / 2)) * Math.PI / 2, fromItem }; }
    updatePlacement() {
        const input = this.scene.engine.input;
        if (input.isKeyPressed('KeyR')) this.placement.yaw += Math.PI / 2;
        const yaw = this.scene.player.rotation[1];
        const p = this.scene.player.position;
        const point = [p[0] + Math.sin(yaw) * 3, 0, p[2] + Math.cos(yaw) * 3];
        const required = STRUCTURE_DEFINITIONS[this.placement.type].parent;
        const parent = required ? this.registry.nearby(point, 4).find(record => record.type === required) : null;
        this.placement.preview = this.registry.preview(this.placement.type, point, this.placement.yaw, parent?.id);
        const costs = Object.entries(STRUCTURE_DEFINITIONS[this.placement.type].ingredients).map(([id, count]) => `${getResourceDef(id).name} ${this.scene.inventory.getCount(id)}/${count}`).join(' · ');
        this.ui.hint(`${STRUCTURE_DEFINITIONS[this.placement.type].name} · ${this.placement.preview.valid ? costs + ' · E xây · R xoay' : this.placement.preview.reason} · Esc hủy`);
        if (input.isActionPressed('interact') && this.placement.preview.valid) {
            const result = this.registry.place(this.placement.type, point, this.placement.yaw, this.scene.inventory, { parentId: parent?.id, fromItem: this.placement.fromItem });
            this.scene._showNotification(result.ok ? 'Đã xây ' + STRUCTURE_DEFINITIONS[this.placement.type].name : result.error);
            input.consumeAction('interact');
            if (result.ok) { this.scene.firstPersonViewModel?.playAction('build'); this.saveMilestone(); if (this.placement.fromItem) this.placement = null; }
        }
    }

    craft(id) {
        const result = this.production.craft(id, this.scene.inventory, this.scene.player.position);
        if (result.ok) { this.scene.firstPersonViewModel?.playAction('craft'); this.scene.engine.audio.playCraft(); this.saveMilestone(); }
        return result;
    }

    pinObjective(index) {
        if (this.pinnedObjective?.chapter === this.progress.chapter && this.pinnedObjective.index === index) {
            this.pinnedObjective = null;
            return { ok: true, message: 'Đã bỏ ghim mục tiêu.' };
        }
        const objective = this.progress.objectives()[index];
        if (!Number.isInteger(index) || !objective || objective.progress >= objective.count) return { ok: false, error: 'Chọn một mục tiêu chưa hoàn thành trong chương hiện tại.' };
        this.pinnedObjective = { chapter: this.progress.chapter, index };
        return { ok: true, message: 'Đã ghim mục tiêu lên màn hình.' };
    }

    trackedObjective() {
        const objectives = this.progress.objectives();
        const selected = this.pinnedObjective?.chapter === this.progress.chapter ? objectives[this.pinnedObjective.index] : null;
        return selected && selected.progress < selected.count ? selected : objectives.find(objective => objective.progress < objective.count);
    }

    useActiveItem() {
        const item = this.scene.inventory.getEquippedItem();
        if (!item) return false;
        if (STRUCTURE_DEFINITIONS[item.id]) { this.beginPlacement(item.id, true); return true; }
        if (item.id === 'torch') { this.torchLit = !this.torchLit; this.scene._showNotification(this.torchLit ? 'Đã thắp đuốc.' : 'Đã tắt đuốc.'); this.saveMilestone(); return true; }
        if (item.id === 'fishing_rod') {
            if (this.fishing.state) {
                if (this.fishing.state.phase === 'landed') {
                    if (!this.fishing.claim(this.scene.inventory)) this.scene._showNotification('Cá đang giữ lại: cần chỗ trống trong túi.');
                } else this.fishing.cancel('Đã thu cần.');
                this.scene.isFishing = !!this.fishing.state && this.fishing.state.phase !== 'landed';
                return true;
            }
            const player = this.scene.player.position, yaw = this.scene.player.rotation[1];
            let cast = false;
            for (let range = 3; range <= 12; range++) {
                const point = [player[0] + Math.sin(yaw) * range, 0.15, player[2] + Math.cos(yaw) * range];
                const depth = -this.scene.terrain.getHeight(point[0], point[2]);
                if (depth >= 0.5) { cast = this.fishing.cast(point, depth, this.islandEvents.shoalAt(point)); break; }
            }
            this.scene.isFishing = cast;
            this.scene._showNotification(cast ? 'Chờ cá cắn câu · E giật cần · giữ / thả chuột trái hoặc Space để điều chỉnh dây.' : 'Hướng cần ra vùng nước đủ sâu trong tầm 12 m.');
            return true;
        }
        if (item.id === 'hook') {
            if (this.hook.pending) {
                if (!this.hook.claim(this.scene.inventory)) this.scene._showNotification('Đã kéo được đồ: cần chỗ trống trong túi.');
            } else if (this.hook.state) this.hook.cancel();
            else {
                const player = this.scene.player.position, yaw = this.scene.player.rotation[1];
                const cast = this.hook.cast([player[0], player[1] + 0.4, player[2]], [Math.sin(yaw), 0, Math.cos(yaw)], this.scene.debrisManager.debris);
                this.scene._showNotification(cast ? 'Đang kéo vật trôi dạt · Esc thu móc.' : 'Ngắm vật trôi dạt phía trước trong tầm 20 m.');
            }
            return true;
        }
        return false;
    }

    interact() {
        if (this.placement || this.wreckSalvage.active || this.mineExtraction?.active || this.fishing.state && this.fishing.state.phase !== 'landed' || this.hook.state) return;
        const player = this.scene.player.position;
        const input = this.scene.engine.input;
        const candidates = [];
        for (const face of this.landmarks.mineFaces || []) if (distance(player, face.position) < 2.5) {
            const ready = this.mineExtraction.faces[face.id].progress >= MINE_WORK_SECONDS;
            candidates.push({ position: face.position, preference: 1, keepHeld: true,
                label: `${face.name} · ${ready ? 'lấy quặng đã đào' : `giữ ${input.getBindingDisplayName('interact')} để đào tiếp (${MINE_BATCH_SIZE} quặng/lượt)`}`,
                action: () => this.startMining(face) });
        }
        for (const debris of this.scene.debrisManager.debris) {
            if (!debris.isCollected && !debris.isExpired && debris.canPickup(player)) candidates.push({ position: debris.position,
                label: `Nhặt ${debris.debrisDef.name}`, action: () => {
                    const reward = debris.debrisDef.gives;
                    if (this.scene.inventory.addItem(reward.resourceId, reward.amount)) {
                        debris.collect(); this.scene.stats.resourcesPicked += reward.amount;
                        this.events.emit('collected', { id: reward.resourceId, count: reward.amount }); this.saveMilestone();
                    } else this.scene._showNotification('Túi đồ đã đầy.');
                } });
        }
        this.refreshResourceIndex();
        for (const resource of this.resourceIndex.queryRadius(Array.from(player), 3)) {
            if (!resource.isCollected && distance(player, resource.position) < 3) candidates.push({ position: resource.position,
                label: `Nhặt ${resource.resourceDef.name}`, action: () => {
                    const ore = ['iron_ore', 'copper_ore'].includes(resource.resourceId);
                    if (ore && !this.scene.inventory.hasItem('stone_pickaxe') && !this.scene.inventory.hasItem('iron_pickaxe')) { this.scene._showNotification('Cần cuốc để khai thác quặng.'); return; }
                    const amount = resource.amount || 1;
                    if (this.scene.inventory.addItem(resource.resourceId, amount)) {
                        resource.collect(); this.scene.stats.resourcesPicked += amount;
                        this.events.emit('collected', { id: resource.resourceId, count: amount });
                        this.scene.engine.audio.playPickup(); this.saveMilestone();
                    } else this.scene._showNotification('Túi đồ đã đầy.');
                } });
        }
        const waterfall = this.scene.world.pois.find(poi => poi.id === 'waterfall');
        if (!this.progress.facts['deviceRepaired:station_gate'] && distance(player, this.landmarks.stationGate) < 3) {
            candidates.push({ position: this.landmarks.stationGate, preference: 2, label: 'Mở cửa trạm · cần cuốc sắt', action: () => {
                if (!this.scene.inventory.hasItem('iron_pickaxe')) { this.scene._showNotification('Cửa trạm bị kẹt. Cần cuốc sắt để mở.'); return; }
                this.events.emit('deviceRepaired', { id: 'station_gate' }); this.refreshCollision(); this.saveMilestone();
            } });
        }
        if (distance(player, waterfall.position) < 6) candidates.push({ position: waterfall.position, label: 'Uống nước tại thác', action: () => {
            this.scene.vitals.drink(50); this.events.emit('drank', { id: 'fresh_water' }); this.saveMilestone();
        } });
        for (const [id, journal] of Object.entries(this.journals)) {
            if (journal.position && distance(player, journal.position) < 3) candidates.push({ position: journal.position,
                label: `Đọc ${journal.title}`, action: () => this.readJournal(id) });
        }
        for (const station of Object.values(this.landmarks.surveyStations)) if (distance(player, station.position) < 3) {
            candidates.push({ position: station.position, preference: 1, label: `${station.title}${this.fieldSurvey.complete(station.id) ? ' · đã hiệu chỉnh' : ' · hiệu chỉnh'}`,
                action: () => this.ui.open('field-survey', station.id) });
        }
        for (const record of this.registry.nearby(player, 3)) {
            if (record.type === 'doorway' && [...this.registry.structures.values()].some(child => child.type === 'door' && child.parentId === record.id)) continue;
            candidates.push({ position: record.position, preference: record.type === 'door' ? 1 : 0,
            label: record.type === 'door' ? 'Mở / đóng cửa' : `Dùng ${STRUCTURE_DEFINITIONS[record.type].name}`, action: () => {
                if (record.type === 'door') { record.open = !record.open; this.saveMilestone(); }
                else this.ui.open('structure', record.id);
            } });
        }
        for (const bag of this.deathBags) if (distance(player, bag.position) < 3) candidates.push({ position: bag.position, label: 'Lấy lại đồ đã rơi', action: () => this.ui.open('bag', bag.id) });
        for (const cargo of this.islandEvents.cargo) if (distance(player, cargo.position) < 3) candidates.push({ position: cargo.position, label: 'Mở kiện hàng sau bão', action: () => {
            const result = this.islandEvents.claimCargo(cargo.id, this.scene.inventory);
            this.scene._showNotification(result.ok ? 'Đã lấy vật tư từ kiện hàng.' : result.error); if (result.ok) this.saveMilestone();
        } });
        const shortcut = this.islandEvents.shortcut;
        if (!this.islandEvents.shortcutOpen && distance(player, shortcut.position) < 4) candidates.push({ position: shortcut.position, label: `Dọn cây đổ · rìu đá/sắt · ${this.islandEvents.cutProgress}/3`, action: () => {
            const result = this.islandEvents.cutShortcut(this.scene.inventory);
            this.scene._showNotification(result.message || result.error);
            if (result.ok) { this.refreshCollision(); this.saveMilestone(); }
        } });
        const raft = this.ending.baseRaftPosition;
        if (distance(player, raft) < 5) candidates.push({ position: raft, label: 'Bãi đóng bè · chuẩn bị vượt biển', action: () => this.ui.open('raft') });
        const tower = this.landmarks.towerConsole;
        if (distance(player, tower) < 3) candidates.push({ position: tower, label: 'Radio và máy phát cứu hộ', action: () => this.ui.open('rescue') });
        for (const node of this.landmarks.salvageNodes) {
            const state = this.wreckSalvage.parts[node.id];
            if (!state.claimed && distance(player, node.position) < 2.5) candidates.push({ position: node.position, keepHeld: true,
                label: `${node.name} · ${state.progress >= node.seconds ? 'nhận vật tư đã tháo' : `giữ ${input.getBindingDisplayName('interact')} để tháo (${Math.floor(state.progress)}/${node.seconds}s)`}`,
                action: () => this.startSalvage(node) });
        }
        for (const [id, requirements] of Object.entries({ depot_supplies: { sail_cloth: 1, barrel: 3, fresh_water: 3, smoked_meal: 2 } })) {
            if (this.claimedCaches.has(id)) continue;
            const poiId = 'coastal_depot';
            const p = this.scene.world.pois.find(poi => poi.id === poiId).position;
            const position = [p[0] + 1.5, p[1] + 0.3, p[2]];
            if (distance(player, position) < 3) candidates.push({ position, label: 'Nhận vật tư còn lại trong kho', action: () => {
                if (!transactCraft([this.scene.inventory], {}, Object.entries(requirements).map(([id, count]) => ({ id, count })))) { this.scene._showNotification('Túi chưa đủ chỗ nhận toàn bộ vật tư.'); return; }
                this.claimedCaches.add(id); this.events.emit('deviceRepaired', { id }); this.saveMilestone();
                this.scene._showNotification('Đã thu vật tư. Thùng này chỉ nhận được một lần.');
            } });
        }
        const nearest = candidates.sort((a, b) => distance(player, a.position) - (a.preference || 0) - distance(player, b.position) + (b.preference || 0))[0];
        if (this.swimY === undefined || this.swimY > -0.8) this.ui.hint(nearest ? `${input.getBindingDisplayName('interact')} · ${nearest.label}` : '');
        else if (nearest) this.ui.hint(`${input.getBindingDisplayName('interact')} · ${nearest.label} · Space nổi lên · Ctrl lặn xuống`);
        if (nearest && input.isActionPressed('interact')) { input.consumeAction('interact', { keepHeld: !!nearest.keepHeld }); nearest.action(); }
    }

    refreshResourceIndex() {
        const resources = this.scene.resourceManager.worldResources;
        if (this.indexedResources === resources && this.indexedResourceCount === resources.length && this.resourceIndexTimer > 0) return;
        this.resourceIndex.clear();
        resources.forEach((resource, i) => { if (!resource.isCollected) this.resourceIndex.insert(i,
            { min: Array.from(resource.position, v => v - 0.1), max: Array.from(resource.position, v => v + 0.1) }, resource); });
        this.indexedResources = resources; this.indexedResourceCount = resources.length; this.resourceIndexTimer = 0.25;
    }

    readJournal(id) {
        if (!this.progress.journals.has(id)) {
            const journal = this.journals[id];
            if (!journal || distance(this.scene.player.position, journal.position) > 3) { this.scene._showNotification('Hãy tới gần ghi chép để đọc.'); return; }
            if (!journal.optional && journal.poi === 'mine' && !this.scene.inventory.hasItem('torch')) { this.scene._showNotification('Hang tối. Cần mang theo đuốc để đọc ghi chép.'); return; }
            if (!journal.optional && journal.poi === 'weather_station' && !this.progress.facts['deviceRepaired:station_gate']) { this.scene._showNotification('Mở cửa trạm bằng cuốc sắt trước.'); return; }
            if (journal.poi === 'offshore_wreck' && (!this.scene.inventory.hasItem('dive_kit') || this.scene.player.position[1] > -0.8)) { this.scene._showNotification('Cần bộ lặn và lặn tới khoang tàu.'); return; }
        }
        if (id === 'station_coordinates' && !this.progress.facts['deviceRepaired:station_console']) {
            this.ui.open('repair-circuit'); return;
        }
        if (id === 'station_coordinates' && !this.fieldReadingsReady()) { this.ui.open('survey-report'); return; }
        this.progress.readJournal(id);
        this.ui.open('note', id);
        this.saveMilestone();
    }

    fieldReadingsReady() { return this.progress.completedChapters.has(4) || this.fieldSurvey.allComplete(); }
    surveyCommand(id, command, argument) {
        const station = this.landmarks.surveyStations[id];
        if (!station || distance(this.scene.player.position, station.position) >= 3) return { ok: false, error: 'Hãy tới gần thiết bị khảo sát.' };
        const result = this.fieldSurvey.act(id, command, argument);
        if (result.ok) {
            if (result.completed) {
                this.events.emit('deviceRepaired', { id: station.eventId });
                this.scene.engine.audio.playCraft();
                this.progress.lastMilestone = station.title;
            }
            this.saveMilestone();
        }
        return result;
    }
    installStationCircuit() {
        if (this.stationCircuit.installed) return { ok: true, message: 'Vật tư đã được lắp; không cần trả thêm.' };
        if (distance(this.scene.player.position, this.journals.station_coordinates.position) > 3
            || !this.progress.facts['deviceRepaired:station_gate']) return { ok: false, error: 'Hãy vào trạm và tới bảng điều khiển.' };
        if (!transactCraft([this.scene.inventory], { iron_ingot: 4, copper_ingot: 2 }, [])) return { ok: false, error: 'Cần 4 thỏi sắt và 2 thỏi đồng để lắp vào trạm.' };
        this.stationCircuit.installed = true; this.saveMilestone(); return { ok: true, message: 'Đã lắp vật tư. Nối nguồn qua cả ba cảm biến rồi thử mạch.' };
    }

    testStationCircuit() {
        const result = this.stationCircuit.test();
        if (result.ok) {
            this.events.emit('deviceRepaired', { id: 'station_console' }); this.scene.engine.audio.playCraft();
            result.message = 'Bảng điều khiển đã có điện. Đối chiếu ba thiết bị khảo sát để mở hồ sơ tọa độ.';
        }
        this.saveMilestone(); return result;
    }

    sleep() {
        const plan = getSleepPlan(this.scene);
        if (!plan.allowed) { this.scene._showNotification(plan.reason); return; }
        let remaining = plan.seconds;
        const deathsBefore = this.deaths;
        const startTime = this.scene.dayNight.timeOfDay;
        while (remaining > 0) {
            const step = Math.min(1, remaining);
            this.scene.weather.update(step);
            const effects = this.scene.weather.getGameplayEffects();
            this.production.update(step, effects);
            this.islandEvents.update(step, { ...effects, isStorm: this.scene.weather.currentWeather === 'storm' });
            this.scene.vitals.update(step * 0.35, false);
            const fire = this.registry.nearby(this.scene.player.position, 4.5)
                .find(record => this.production.isBurning(record));
            const exposure = this.scene.exposure.update(step, {
                sheltered: this.registry.sheltered(this.scene.player.position), isNight: true,
                rainFactor: effects.rainFactor, nearCampfire: !!fire,
                fireIntensityMultiplier: fire ? this.production.fireIntensity(fire, effects.rainFactor) : 0,
            });
            if (exposure.damage > 0) this.scene.vitals.applyDamage(exposure.damage, 'cold');
            remaining -= step;
            if (this.deaths !== deathsBefore) break;
        }
        const elapsed = plan.seconds - remaining;
        this.scene.dayNight.timeOfDay = (startTime + elapsed * this.scene.dayNight.daySpeed) % 1;
        this.scene.survivalSeconds += elapsed;
        if (remaining <= 0.000001) {
            this.scene.dayNight.timeOfDay = this.scene.dayNight.dawnTime;
            this.scene.stats.nightsSurvived++;
            this.scene._wasNight = false;
            this.events.emit('slept', { count: 1 });
            this.scene._showNotification('Đã thức dậy. Hãy kiểm tra nước, thức ăn và nhiên liệu.');
        }
        this.scene._exposureModifiers = this.scene.exposure.getModifiers();
        this.scene._updateExposureStatus();
        this.saveMilestone();
    }

    onDeath() {
        this.deaths++;
        this.scene.firstPersonViewModel?.cancelActivity();
        this.placement = null;
        this.wreckSalvage?.pause();
        this.mineExtraction?.pause();
        this.fishing.cancel(); this.hook.cancel(); this.scene.isFishing = false;
        const inventory = this.scene.inventory;
        let dropped = false;
        if (this.difficulty.dropBackpack) {
            const container = new ItemContainer(28);
            for (let index = 0; index < (this.difficulty.dropHotbar ? 28 : 20); index++) {
                container.slots[index] = inventory.slots[index] ? { ...inventory.slots[index] } : null;
                inventory.slots[index] = null;
            }
            if (container.getUsedSlots()) { this.deathBags.push({ id: `death-bag-${this.nextBag++}`, position: Array.from(this.scene.player.position), container }); dropped = true; }
        }
        this.refreshCollision();
        this.scene.player.position.set(findCampaignRespawn(this));
        this.scene.player.velocity.fill(0);
        this.scene.camera._firstUpdate = true;
        this.scene.vitals.reset();
        this.scene.vitals._setVital('hunger', 65);
        this.scene.vitals._setVital('thirst', 65);
        this.scene.exposure.setState({ warmth: 75, wetness: 0 });
        this.swimY = undefined;
        this.oxygen = inventory.hasItem('dive_kit') ? 120 : 45;
        this.respawnProtection = 4;
        this.scene.inventoryController.renderInventory();
        this.scene._showNotification(dropped ? 'Đã tỉnh lại tại điểm nghỉ. Túi đồ được đánh dấu trên bản đồ.' : 'Đã tỉnh lại tại điểm nghỉ. Không có đồ bị rơi.');
        this.saveMilestone();
    }

    lighting() {
        if (this.ending.state?.route === 'rescue') return { position: this.landmarks.towerConsole.map((value, axis) => value + (axis === 1 ? 1 : 0)), color: [0.9, 0.85, 0.66], intensity: this.ending.state.power > 10 ? 1.2 : 0, range: 8 };
        if (this.scene.inventory.hasItem('torch') && this.torchLit && (this.swimY === undefined || this.swimY > -0.8)) return { position: Array.from(this.scene.camera.position), color: [1, 0.72, 0.4], intensity: 2, range: 10 };
        if (this.scene.inventory.hasItem('dive_kit') && this.swimY < -0.8) return { position: Array.from(this.scene.camera.position), color: [0.65, 0.85, 1], intensity: 1.5, range: 8 };
        const fire = this.registry.nearby(this.scene.player.position, 15).filter(record => this.production.isBurning(record))
            .sort((a, b) => distance(a.position, this.scene.player.position) - distance(b.position, this.scene.player.position))[0];
        return fire ? { position: [fire.position[0], fire.position[1] + 0.35, fire.position[2]], color: [1, 0.55, 0.2],
            intensity: 2.5 * this.production.fireIntensity(fire, this.scene.weather.rainIntensity), range: 10 } : { position: [0, 0, 0], color: [1, 0.55, 0.2], intensity: 0, range: 10 };
    }

    drawEndingModels(draw) {
        const state = this.ending.state, raft = this.scene.raftAssembly;
        const position = state?.route === 'raft' ? this.ending.raftPosition() : this.ending.baseRaftPosition;
        const yaw = state?.route === 'raft' ? this.ending.oceanYaw + state.heading : this.ending.oceanYaw;
        if (raft.framePlaced) {
            draw('campaign:campaign_raft_frame', position, yaw);
            if (raft.floatsPlaced) draw('campaign:campaign_raft_floats', position, yaw);
            if (raft.paddlePlaced) draw('campaign:campaign_raft_paddle', position, yaw);
            if (raft.sailPlaced) draw('campaign:campaign_raft_sail', position, yaw);
            if (raft.motorPlaced) draw('campaign:campaign_raft_motor', position, yaw);
        }
        if (state?.route === 'raft') for (const rock of state.rocks) {
            if (Math.abs(rock.along - state.along) > 180) continue;
            const p = raftCoursePosition(rock, this.ending.oceanOrigin, this.ending.oceanYaw);
            const size = this.scene.engine.assets.getModel('campaign:survival_resource-stone')?.targetSize || [1, 1, 1];
            draw('campaign:survival_resource-stone', [p[0], -0.25, p[2]], 0, [rock.radius * 2 / size[0], 1.5 / size[1], rock.radius * 2 / size[2]]);
        }
    }

    draw(shader, mode) {
        const draw = (modelId, position, yaw = 0, scale = [1, 1, 1]) => {
            const model = this.scene.engine.assets.getModel(modelId);
            if (!model || !this.scene._isVisible(position, 8)) return;
            Mat4.identity(this.matrix); Mat4.translate(this.matrix, this.matrix, position); Mat4.rotateY(this.matrix, this.matrix, yaw);
            Mat4.scale(this.matrix, this.matrix, scale);
            if (model.drawables) model.draw(shader, this.matrix, mode);
            else { shader.setUniformMatrix4fv('uModelMatrix', this.matrix); model.draw(mode); }
        };
        this.drawEndingModels(draw);
        for (const cargo of this.islandEvents.cargo) draw('campaign:pirate_crate', cargo.position);
        if (!this.islandEvents.shortcutOpen) {
            const s = this.islandEvents.shortcut, id = getResourceDef('wood').modelId;
            const size = this.scene.engine.assets.getModel(id)?.targetSize || [1, 1, 1];
            draw(id, [s.position[0], s.position[1] + 0.4, s.position[2]], s.yaw, [0.9 / size[0], 0.8 / size[1], 6 / size[2]]);
        }
        for (const shoal of this.islandEvents.shoals) for (let index = 0; index < 4; index++) {
            const angle = this.scene.time * 0.8 + index * Math.PI / 2;
            draw('campaign:survival_fish', [shoal.position[0] + Math.cos(angle) * 2, -0.12, shoal.position[2] + Math.sin(angle) * 2], angle, [0.7, 0.7, 0.7]);
        }
        for (const record of this.staticModels) {
            if (record.id.startsWith('wreck-part-') && this.wreckSalvage.parts[record.id.slice(11)].claimed) continue;
            draw(record.model, record.position, (record.yaw || 0) + (record.gate && this.progress.facts['deviceRepaired:station_gate'] ? Math.PI / 2 : 0), record.scale);
        }
        for (const record of this.registry.structures.values()) {
            const def = STRUCTURE_DEFINITIONS[record.type];
            draw(def.modelId, record.position, record.yaw + (record.type === 'door' && record.open ? Math.PI / 2 : 0));
            if (record.crop) draw(`campaign:campaign_${record.crop.type === 'carrot' ? 'crop_carrot' : 'herb'}_${this.production.cropStage(record)}`, [record.position[0], record.position[1] + 0.24, record.position[2]]);
        }
        for (const bag of this.deathBags) draw('campaign:food_bag', bag.position);
        const player = this.scene.player.position, yaw = this.scene.player.rotation[1];
        const lineOrigin = [player[0] + Math.cos(yaw) * 0.25, player[1] + 0.3, player[2] - Math.sin(yaw) * 0.25];
        const lineTarget = this.hook.state?.position || this.fishing.state?.position;
        if (lineTarget) {
            const delta = lineTarget.map((value, axis) => value - lineOrigin[axis]);
            Mat4.identity(this.matrix);
            Mat4.translate(this.matrix, this.matrix, lineOrigin.map((value, axis) => value + delta[axis] / 2));
            Mat4.rotateY(this.matrix, this.matrix, Math.atan2(delta[0], delta[2]));
            Mat4.rotateX(this.matrix, this.matrix, -Math.atan2(delta[1], Math.hypot(delta[0], delta[2])));
            Mat4.scale(this.matrix, this.matrix, [0.018, 0.018, Math.hypot(...delta)]);
            shader.setUniformMatrix4fv('uModelMatrix', this.matrix); this.ropeMesh.draw(mode);
            if (this.hook.state) draw('campaign:campaign_hook', lineTarget, yaw);
            // The held rod is rendered with the animated hands in camera space.
        }
        if (this.placement?.preview?.record) {
            const record = this.placement.preview.record;
            draw(STRUCTURE_DEFINITIONS[record.type].modelId, record.position, record.yaw);
        }
    }

    drawMap(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#182b29'; ctx.fillRect(0, 0, 600, 600);
        for (const cell of this.discovered) {
            const [x, z] = cell.split(':').map(Number);
            const wx = x * 40 - 300, wz = z * 40 - 300;
            const generator = this.scene.world.biomeGenerator;
            const color = generator.getBiomeColor(generator.getBiome(wx, wz));
            ctx.fillStyle = `rgb(${color.map(channel => Math.round(channel * 255)).join(',')})`;
            ctx.fillRect(x * 37.5, z * 37.5, 38, 38);
        }
        const labelBounds = [];
        const mark = (position, label, color) => {
            const x = (position[0] + 320) / 640 * 600, z = (position[2] + 320) / 640 * 600;
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, z, 4, 0, Math.PI * 2); ctx.fill();
            ctx.font = '12px sans-serif';
            const width = ctx.measureText(label).width;
            const offsets = [[7, -5], [7, 17], [-width - 7, -5], [-width - 7, 17], [7, -23], [7, 35]];
            let bounds;
            for (const [dx, dz] of offsets) {
                const candidate = { x: Math.max(4, Math.min(596 - width, x + dx)), y: Math.max(14, Math.min(586, z + dz)), width };
                if (!labelBounds.some(b => candidate.x < b.x + b.width + 4 && candidate.x + width + 4 > b.x
                    && Math.abs(candidate.y - b.y) < 16)) { bounds = candidate; break; }
            }
            if (bounds) { labelBounds.push(bounds); ctx.fillText(label, bounds.x, bounds.y); }
        };
        for (const poi of this.scene.world.pois) if (this.progress.facts['poiVisited:' + poi.id]) mark(poi.position, poi.name, '#f4db98');
        for (const record of this.registry.structures.values()) if (['bed', 'shelter'].includes(record.type)) mark(record.position, 'Trại', '#eee8d0');
        for (const bag of this.deathBags) mark(bag.position, 'Túi đồ', '#e79270');
        for (const marker of this.markers) mark(marker.position, marker.label, '#e6c454');
        const known = position => this.discovered.has(`${Math.floor((position[0] + 320) / 40)}:${Math.floor((position[2] + 320) / 40)}`);
        for (const cargo of this.islandEvents.cargo) if (known(cargo.position)) mark(cargo.position, 'Hàng sau bão', '#deab7b');
        for (const shoal of this.islandEvents.shoals) if (known(shoal.position)) mark(shoal.position, 'Đàn cá', '#7dd6d2');
        if (known(this.islandEvents.shortcut.position)) mark(this.islandEvents.shortcut.position, this.islandEvents.shortcutOpen ? 'Đường tắt' : 'Cây đổ', '#adce84');
        for (const station of Object.values(this.landmarks.surveyStations)) if (known(station.position)
            && (this.progress.facts['deviceRepaired:station_console'] || this.fieldSurvey.complete(station.id))) {
            mark(station.position, `${this.fieldSurvey.complete(station.id) ? '✓ ' : ''}${station.title}`, '#c5ddc1');
        }
        mark(this.scene.player.position, 'Bạn', '#ffffff');
    }

    addMarker(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z) || x < -320 || x >= 320 || z < -320 || z >= 320) return { ok: false, error: 'Vị trí nằm ngoài bản đồ.' };
        if (this.markers.length >= 20) return { ok: false, error: 'Đã đủ 20 dấu. Hãy bỏ một dấu trước khi thêm.' };
        if (!this.discovered.has(`${Math.floor((x + 320) / 40)}:${Math.floor((z + 320) / 40)}`)) return { ok: false, error: 'Hãy khám phá vùng này trước khi đặt dấu.' };
        this.markers.push({ label: `Điểm ${this.markers.length + 1}`, position: [x, this.scene.terrain.getHeight(x, z), z] });
        this.saveMilestone();
        return { ok: true };
    }
    saveMilestone() { this.saveTimer = 0.3; this.ui?.refreshHUD(); }
    updatePendingSave(seconds) {
        if (this.saveTimer > 0) {
            this.saveTimer -= seconds;
            if (this.saveTimer <= 0) this.scene.saveController.save(true);
        }
    }
    snapshot() {
        return { ...this.progress.snapshot(), registry: this.registry.snapshot(), production: this.production.snapshot(),
            playSeconds: this.playSeconds, markers: this.markers, discovered: [...this.discovered], pinnedRecipe: this.pinnedRecipe, pinnedObjective: this.pinnedObjective,
            deathBags: this.deathBags.map(bag => ({ id: bag.id, position: bag.position, slots: bag.container.snapshot() })), nextBag: this.nextBag,
            fishing: this.fishing.snapshot(), hookReward: this.hook.snapshot(), oxygen: this.oxygen ?? 45, swimY: this.swimY ?? null, deaths: this.deaths,
            ending: this.ending.snapshot(), claimedCaches: [...this.claimedCaches], torchLit: this.torchLit,
            islandEvents: this.islandEvents.snapshot(), wildlife: this.scene.wildlife.snapshot(), stationCircuit: this.stationCircuit.snapshot(), fieldSurvey: this.fieldSurvey.snapshot(), wreckSalvage: this.wreckSalvage.snapshot(), mineExtraction: this.mineExtraction?.snapshot() };
    }
    restore(saved = {}) {
        this.progress.blueprints = this.scene.unlockedBlueprints;
        this.production.blueprints = this.scene.unlockedBlueprints;
        this.progress.restore(saved);
        if (saved.registry) this.registry.restore(saved.registry);
        this.production.restore(saved.production);
        this.playSeconds = saved.playSeconds || 0;
        this.markers = saved.markers || [];
        this.discovered = new Set(saved.discovered || []);
        this.pinnedRecipe = saved.pinnedRecipe || null;
        this.pinnedObjective = saved.pinnedObjective ? { ...saved.pinnedObjective } : null;
        this.torchLit = saved.torchLit !== false;
        this.deathBags = (saved.deathBags || []).map(bag => { const container = new ItemContainer(28); container.restore(bag.slots); return { ...bag, container }; });
        this.nextBag = saved.nextBag || 1;
        this.claimedCaches = new Set(saved.claimedCaches || []);
        this.wreckSalvage.restore(saved.wreckSalvage, this.claimedCaches.has('wreck_salvage'));
        this.mineExtraction?.restore(saved.mineExtraction);
        this.islandEvents.restore(saved.islandEvents);
        this.stationCircuit.restore(saved.stationCircuit);
        this.fieldSurvey.restore(saved.fieldSurvey);
        this.scene.wildlife.restore(saved.wildlife);
        this.ending.restore(saved.ending);
        this.deaths = saved.deaths || 0;
        this.fishing.restore(saved.fishing);
        this.hook.restore(saved.hookReward);
        this.oxygen = saved.oxygen ?? 45;
        this.swimY = saved.swimY ?? undefined;
        this.scene.isFishing = !!this.fishing.state && this.fishing.state.phase !== 'landed';
        this.scene.camera._firstUpdate = true;
        this.refreshCollision();
        const player = this.scene.player;
        if (this.scene.terrain.getHeight(player.position[0], player.position[2]) >= -0.4 &&
            !this.collision.capsuleClear(player.position, player.collider.radius, player.collider.height)) {
            player.position.set(findCampaignRespawn(this, { near: player.position }));
            player.updateModelMatrix();
        }
        this.ui.refreshHUD();
    }
    dispose() { this.ending.dispose(); this.hook.cancel(); this.ropeMesh.delete(); this.progress.dispose(); this.events.dispose(); this.ui.dispose(); this.environmentIndex.clear(); this.resourceIndex.clear(); this.collision.clear(); }
}
