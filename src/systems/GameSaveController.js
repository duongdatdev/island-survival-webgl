import { getResourceDef } from './ResourceDatabase.js';
import { SaveSystem } from './SaveSystem.js';

export const AUTOSAVE_INTERVAL = 60.0;
const SAVE_STATUS_DURATION = 3.0;

export class GameSaveController {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.storage = options.storage || SaveSystem;
        this.window = options.window || globalThis.window;
        this.document = options.document || globalThis.document;
        this.autosaveInterval = options.autosaveInterval || AUTOSAVE_INTERVAL;
        this.autosaveTimer = 0;
        this.statusTimer = 0;
        this._onPageHide = null;
        this._onVisibilityChange = null;
    }

    attach() {
        if (!this.window || !this.document || this._onPageHide) return;
        this._onPageHide = () => this.save(true);
        this._onVisibilityChange = () => {
            if (this.document.visibilityState === 'hidden') this.save(true);
        };
        this.window.addEventListener('pagehide', this._onPageHide);
        this.document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    dispose() {
        if (this._onPageHide) this.window?.removeEventListener('pagehide', this._onPageHide);
        if (this._onVisibilityChange) {
            this.document?.removeEventListener('visibilitychange', this._onVisibilityChange);
        }
        this._onPageHide = null;
        this._onVisibilityChange = null;
    }

    save(silent = true) {
        const scene = this.scene;
        if (scene._isGameOver || scene.isEscaping) {
            if (!silent) this.setStatus('Không thể lưu khi ván chơi đã kết thúc.', true);
            return false;
        }

        scene.stats.survivalSeconds = scene.survivalSeconds;
        const ok = !!scene.activeWorldId && this.storage.saveWorld(
            scene.activeWorldId,
            this.storage.captureScene(scene)
        );

        this.autosaveTimer = 0;
        if (!silent) {
            this.setStatus(
                ok ? '💾 Đã lưu tiến trình!' : '❌ Lưu thất bại — bộ nhớ trình duyệt đã đầy.',
                !ok
            );
        }
        return ok;
    }

    updateAutosave(deltaTime) {
        this.autosaveTimer += deltaTime;
        if (this.autosaveTimer >= this.autosaveInterval) this.save(true);
    }

    updateStatus(deltaTime) {
        if (this.statusTimer <= 0) return;
        this.statusTimer -= deltaTime;
        const el = this.scene._domCache?.saveStatus;
        if (this.statusTimer <= 0 && el) {
            el.textContent = '';
            el.classList.remove('error');
        }
    }

    setStatus(message, isError) {
        const el = this.scene._domCache?.saveStatus;
        if (!el) return;
        el.textContent = message;
        el.classList.toggle('error', !!isError);
        this.statusTimer = SAVE_STATUS_DURATION;
    }

    finish(status) {
        const scene = this.scene;
        if (!scene.activeWorldId) return false;
        return this.storage.finishWorld(scene.activeWorldId, status, scene.survivalSeconds);
    }

    reset() {
        const scene = this.scene;
        return !!scene.activeWorldId && this.storage.resetWorld(scene.activeWorldId);
    }

    apply(save) {
        const scene = this.scene;
        console.log('GameScene: Restoring saved run...');

        scene.removedEnvironmentObjectIds = new Set(
            (save.environment && save.environment.removedObjectIds) || []
        );
        for (let index = scene.environmentEntities.length - 1; index >= 0; index--) {
            const entity = scene.environmentEntities[index];
            if (!scene.removedEnvironmentObjectIds.has(entity.worldObjectId)) continue;
            if (scene.collisionSystem) scene.collisionSystem.unregister(entity);
            scene.environmentEntities.splice(index, 1);
            entity.delete();
        }

        scene.player.position[0] = save.player.position[0];
        scene.player.position[1] = save.player.position[1];
        scene.player.position[2] = save.player.position[2];
        scene.player.rotation[1] = save.player.yaw;
        scene.player.updateModelMatrix();

        scene.survivalSeconds = save.survivalSeconds || 0;
        Object.assign(scene.vitals, save.vitals);
        for (const id of ['health', 'hunger', 'thirst', 'stamina']) {
            scene._updateVitalBar(id, scene.vitals[id], 100);
        }

        for (let index = 0; index < scene.inventory.slots.length; index++) {
            const stored = save.inventory.slots[index];
            scene.inventory.slots[index] = stored ? { id: stored.id, count: stored.count } : null;
        }
        scene.inventory.selectedHotbarIndex = save.inventory.selectedHotbarIndex || 0;

        Object.assign(scene.raftAssembly, {
            framePlaced: !!save.raft.framePlaced,
            floatsPlaced: !!save.raft.floatsPlaced,
            paddlePlaced: !!save.raft.paddlePlaced,
            sailPlaced: !!save.raft.sailPlaced,
            motorPlaced: !!save.raft.motorPlaced,
        });

        const campfire = save.structures.campfire;
        scene.campfire.isBuilt = !!campfire.isBuilt;
        scene.campfire.position.set(campfire.position);
        scene.campfire.updateModelMatrix();

        const collector = save.structures.waterCollector;
        scene.waterCollector.isBuilt = !!collector.isBuilt;
        scene.waterCollector.position.set(collector.position);
        scene.waterCollector.waterStored = collector.waterStored || 0;
        scene.waterCollector.rainProgress = collector.rainProgress || 0;
        scene.waterCollector.updateModelMatrix();

        scene.unlockedBlueprints = new Set(save.blueprints || []);
        scene.objectiveTracker?.setPinnedRecipe(save.ui?.pinnedRecipeId || null);
        if (save.environment) {
            scene.dayNight.timeOfDay = save.environment.timeOfDay;
            scene.weather.currentWeather = save.environment.weather;
            scene.weather.nextWeather = save.environment.weather;
            scene.weather.cloudCover = save.environment.cloudCover;
            scene.weather.windSpeed = save.environment.windSpeed;
            scene.weather.rainIntensity = save.environment.rainIntensity;
        }

        scene.resourceManager.delete();
        for (const entry of save.resources || []) {
            const definition = getResourceDef(entry.id);
            if (!definition) continue;
            const resource = scene.resourceManager.createResourceEntity(
                scene.gl,
                definition,
                [entry.position[0], entry.position[1], entry.position[2]]
            );
            if (entry.rewardType) resource.rewardType = entry.rewardType;
            scene.resourceManager.worldResources.push(resource);
        }

        if (save.stats) Object.assign(scene.stats, save.stats);
        scene._wasNight = scene.dayNight.timeOfDay > 0.85 || scene.dayNight.timeOfDay < 0.1;
        scene._wasStorm = scene.weather.currentWeather === 'storm';
        scene.inventoryController.renderInventory();
        scene.inventoryController.renderCraftingPanel();
        scene._showNotification('💾 Đã tải lại tiến trình đã lưu!');
    }
}
