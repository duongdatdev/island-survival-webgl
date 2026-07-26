/**
 * SaveSystem (v1.0) — local persistence for a run in progress.
 *
 * The save is a plain JSON snapshot in localStorage. It stores the world seed
 * rather than the generated geometry: the world generator is deterministic, so
 * regenerating from the seed reproduces the same island for a fraction of the
 * storage cost. Only the state that *diverges* from a fresh generation (picked
 * resources, placed structures, inventory, vitals) is written out.
 *
 * Transient things — drifting debris, particles, living creatures — are not
 * saved. They respawn on load, which is cheaper than serializing them and
 * indistinguishable in play.
 */

const STORAGE_KEY = 'island_survival_save_v1';
export const SAVE_VERSION = 1;

export class SaveSystem {
    /**
     * @returns {boolean} True when a loadable save exists.
     */
    static hasSave() {
        return SaveSystem.load() !== null;
    }

    /**
     * Lightweight header for the "Continue" button — survival time and date,
     * without the caller having to interpret the whole payload.
     * @returns {{savedAt:number, survivalSeconds:number, seed:string}|null}
     */
    static getMeta() {
        const data = SaveSystem.load();
        if (!data) return null;
        return {
            savedAt: data.savedAt || 0,
            survivalSeconds: data.survivalSeconds || 0,
            seed: data.worldSeed || '',
        };
    }

    /**
     * Read and validate the stored save.
     * @returns {object|null} Parsed save, or null when absent/corrupt/outdated.
     */
    static load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return null;

            // A save from a different schema can't be trusted to restore
            // cleanly, so treat it as absent rather than half-applying it.
            if (data.version !== SAVE_VERSION) {
                console.warn(`SaveSystem: ignoring save with version ${data.version} (expected ${SAVE_VERSION}).`);
                return null;
            }
            if (!data.worldSeed) return null;

            return data;
        } catch (e) {
            console.warn('SaveSystem: save data is unreadable, discarding.', e);
            return null;
        }
    }

    /**
     * Persist a snapshot.
     * @param {object} data Snapshot from `SaveSystem.captureScene`.
     * @returns {boolean} True when the write succeeded.
     */
    static save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            // Quota errors are the realistic failure here — surface it to the
            // caller so the UI can tell the player the save didn't happen.
            console.error('SaveSystem: failed to write save.', e);
            return false;
        }
    }

    static deleteSave() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* ignore */ }
    }

    /**
     * Build a snapshot from a live GameScene.
     * @param {import('../scenes/GameScene.js').GameScene} scene
     * @returns {object}
     */
    static captureScene(scene) {
        const player = scene.player;
        const vitals = scene.vitals;
        const raft = scene.raftAssembly;

        return {
            version: SAVE_VERSION,
            savedAt: Date.now(),
            worldSeed: scene.worldSeed,
            survivalSeconds: scene.survivalSeconds,

            player: {
                position: [player.position[0], player.position[1], player.position[2]],
                yaw: player.rotation[1],
            },

            vitals: {
                health: vitals.health,
                hunger: vitals.hunger,
                thirst: vitals.thirst,
                stamina: vitals.stamina,
            },

            inventory: {
                // Slots hold {id, count} or null — copy so later mutation of the
                // live inventory can't retroactively alter a written save.
                slots: scene.inventory.slots.map(s => (s ? { id: s.id, count: s.count } : null)),
                selectedHotbarIndex: scene.inventory.selectedHotbarIndex,
            },

            raft: {
                framePlaced: raft.framePlaced,
                floatsPlaced: raft.floatsPlaced,
                paddlePlaced: raft.paddlePlaced,
                sailPlaced: raft.sailPlaced,
                motorPlaced: raft.motorPlaced,
            },

            structures: {
                campfire: {
                    isBuilt: scene.campfire.isBuilt,
                    position: [scene.campfire.position[0], scene.campfire.position[1], scene.campfire.position[2]],
                },
                waterCollector: {
                    isBuilt: scene.waterCollector.isBuilt,
                    position: [scene.waterCollector.position[0], scene.waterCollector.position[1], scene.waterCollector.position[2]],
                    waterStored: scene.waterCollector.waterStored,
                },
            },

            blueprints: Array.from(scene.unlockedBlueprints),

            environment: {
                timeOfDay: scene.dayNight.timeOfDay,
                weather: scene.weather.currentWeather,
                cloudCover: scene.weather.cloudCover,
                windSpeed: scene.weather.windSpeed,
                rainIntensity: scene.weather.rainIntensity,
            },

            // Surviving pickups only. Anything the player already collected is
            // simply absent, so a load never resurrects harvested resources.
            resources: scene.resourceManager.worldResources
                .filter(r => !r.isCollected)
                .map(r => ({
                    id: r.resourceId,
                    position: [r.position[0], r.position[1], r.position[2]],
                    rewardType: r.rewardType || null,
                })),

            stats: Object.assign({}, scene.stats),
        };
    }
}
