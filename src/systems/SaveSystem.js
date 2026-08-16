const LEGACY_STORAGE_KEY = 'island_survival_save_v1';
const WORLD_INDEX_KEY = 'island_survival_world_index_v1';
const WORLD_SAVE_PREFIX = 'island_survival_world_save_v1:';

export const SAVE_VERSION = 1;

function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0].toString();
    }
    return Math.floor(Math.random() * 1000000000).toString();
}

function normalizeName(name) {
    return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

function normalizeSeed(seed) {
    return typeof seed === 'string' ? seed.trim() : '';
}

export class SaveSystem {
    static initialize() {
        try {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (e) { }
    }

    static listWorlds() {
        const index = SaveSystem._readIndex();
        return index.worlds.slice().sort((a, b) =>
            (b.lastPlayedAt || b.updatedAt || b.createdAt) - (a.lastPlayedAt || a.updatedAt || a.createdAt)
        );
    }

    static getWorld(id) {
        return SaveSystem._readIndex().worlds.find(world => world.id === id) || null;
    }

    static createWorld({ name, seed = '' }) {
        const cleanName = normalizeName(name);
        const cleanSeed = normalizeSeed(seed);
        const index = SaveSystem._readIndex();
        const error = SaveSystem._validateWorldInput(cleanName, cleanSeed, index.worlds);
        if (error) return { ok: false, error };

        const now = Date.now();
        const world = {
            id: makeId(),
            name: cleanName,
            seed: cleanSeed || makeSeed(),
            createdAt: now,
            updatedAt: now,
            lastPlayedAt: 0,
            status: 'new',
            survivalSeconds: 0,
        };
        index.worlds.push(world);
        if (!SaveSystem._writeIndex(index)) return { ok: false, error: 'Không thể lưu map vào bộ nhớ trình duyệt.' };
        return { ok: true, world };
    }

    static renameWorld(id, name) {
        const cleanName = normalizeName(name);
        const index = SaveSystem._readIndex();
        const world = index.worlds.find(item => item.id === id);
        if (!world) return { ok: false, error: 'Map không còn tồn tại.' };
        const error = SaveSystem._validateWorldInput(cleanName, world.seed, index.worlds.filter(item => item.id !== id));
        if (error) return { ok: false, error };

        world.name = cleanName;
        world.updatedAt = Date.now();
        if (!SaveSystem._writeIndex(index)) return { ok: false, error: 'Không thể đổi tên map.' };
        return { ok: true, world };
    }

    static deleteWorld(id) {
        const index = SaveSystem._readIndex();
        const nextWorlds = index.worlds.filter(world => world.id !== id);
        if (nextWorlds.length === index.worlds.length) return { ok: false, error: 'Map không còn tồn tại.' };
        index.worlds = nextWorlds;
        if (!SaveSystem._writeIndex(index)) return { ok: false, error: 'Không thể xóa map.' };
        try {
            localStorage.removeItem(SaveSystem._saveKey(id));
        } catch (e) { }
        return { ok: true };
    }

    static loadWorld(id) {
        try {
            const raw = localStorage.getItem(SaveSystem._saveKey(id));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION || !data.worldSeed) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    static saveWorld(id, data) {
        const index = SaveSystem._readIndex();
        const world = index.worlds.find(item => item.id === id);
        if (!world) return false;
        try {
            localStorage.setItem(SaveSystem._saveKey(id), JSON.stringify(data));
        } catch (e) {
            return false;
        }

        world.updatedAt = Date.now();
        world.lastPlayedAt = world.updatedAt;
        world.status = 'playing';
        world.survivalSeconds = data.survivalSeconds || 0;
        return SaveSystem._writeIndex(index);
    }

    static prepareWorld(id) {
        const index = SaveSystem._readIndex();
        const world = index.worlds.find(item => item.id === id);
        if (!world) return null;
        world.lastPlayedAt = Date.now();
        world.updatedAt = world.lastPlayedAt;
        world.status = 'playing';
        if (!SaveSystem._writeIndex(index)) return null;
        return world;
    }

    static finishWorld(id, status, survivalSeconds) {
        const index = SaveSystem._readIndex();
        const world = index.worlds.find(item => item.id === id);
        if (!world) return false;
        world.updatedAt = Date.now();
        world.status = status === 'escaped' ? 'escaped' : 'dead';
        world.survivalSeconds = survivalSeconds || 0;
        try {
            localStorage.removeItem(SaveSystem._saveKey(id));
        } catch (e) { }
        return SaveSystem._writeIndex(index);
    }

    static resetWorld(id) {
        const index = SaveSystem._readIndex();
        const world = index.worlds.find(item => item.id === id);
        if (!world) return false;
        world.updatedAt = Date.now();
        world.status = 'new';
        world.survivalSeconds = 0;
        try {
            localStorage.removeItem(SaveSystem._saveKey(id));
        } catch (e) { }
        return SaveSystem._writeIndex(index);
    }

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

    static _readIndex() {
        try {
            const raw = localStorage.getItem(WORLD_INDEX_KEY);
            if (!raw) return { version: SAVE_VERSION, worlds: [] };
            const index = JSON.parse(raw);
            if (!index || typeof index !== 'object' || !Array.isArray(index.worlds)) return { version: SAVE_VERSION, worlds: [] };
            return { version: SAVE_VERSION, worlds: index.worlds.filter(SaveSystem._isValidWorld) };
        } catch (e) {
            return { version: SAVE_VERSION, worlds: [] };
        }
    }

    static _writeIndex(index) {
        try {
            localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify(index));
            return true;
        } catch (e) {
            return false;
        }
    }

    static _saveKey(id) {
        return `${WORLD_SAVE_PREFIX}${id}`;
    }

    static _validateWorldInput(name, seed, worlds) {
        if (!name || name.length > 32) return 'Tên map phải có từ 1 đến 32 ký tự.';
        if (seed.length > 64) return 'Seed tối đa 64 ký tự.';
        if (worlds.some(world => world.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
            return 'Tên map này đã được sử dụng.';
        }
        return '';
    }

    static _isValidWorld(world) {
        return !!world && typeof world.id === 'string' && typeof world.name === 'string' && typeof world.seed === 'string';
    }
}
