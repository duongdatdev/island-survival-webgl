import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSaveController } from '../src/systems/GameSaveController.js';
import { SaveSystem, SAVE_VERSION } from '../src/systems/SaveSystem.js';

function installStorage() {
    const storage = {};
    globalThis.localStorage = {
        getItem: key => storage[key] || null,
        setItem: (key, value) => { storage[key] = value; },
        removeItem: key => { delete storage[key]; },
    };
    return storage;
}

test('world saves stay isolated and retain their metadata', () => {
    installStorage();
    const first = SaveSystem.createWorld({ name: 'Đảo Bình Minh', seed: 'sunrise' });
    const second = SaveSystem.createWorld({ name: 'Đảo Hoàng Hôn', seed: 'sunset' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(SaveSystem.createWorld({ name: 'đảo bình minh' }).ok, false);

    const save = { version: SAVE_VERSION, worldSeed: 'sunrise', survivalSeconds: 75 };
    assert.equal(SaveSystem.saveWorld(first.world.id, save), true);
    assert.deepEqual(SaveSystem.loadWorld(first.world.id), save);
    assert.equal(SaveSystem.loadWorld(second.world.id), null);

    const renamed = SaveSystem.renameWorld(second.world.id, 'Đảo Mưa');
    assert.equal(renamed.ok, true);
    assert.equal(SaveSystem.getWorld(second.world.id).name, 'Đảo Mưa');

    assert.equal(SaveSystem.finishWorld(first.world.id, 'escaped', 75), true);
    assert.equal(SaveSystem.loadWorld(first.world.id), null);
    assert.equal(SaveSystem.getWorld(first.world.id).status, 'escaped');
    assert.equal(SaveSystem.getWorld(first.world.id).survivalSeconds, 75);
});

test('deleting a world only removes its own progress', () => {
    installStorage();
    const first = SaveSystem.createWorld({ name: 'Map A', seed: 'a' });
    const second = SaveSystem.createWorld({ name: 'Map B', seed: 'b' });
    SaveSystem.saveWorld(first.world.id, { version: SAVE_VERSION, worldSeed: 'a', survivalSeconds: 10 });
    SaveSystem.saveWorld(second.world.id, { version: SAVE_VERSION, worldSeed: 'b', survivalSeconds: 20 });

    assert.equal(SaveSystem.deleteWorld(first.world.id).ok, true);
    assert.equal(SaveSystem.getWorld(first.world.id), null);
    assert.equal(SaveSystem.loadWorld(first.world.id), null);
    assert.equal(SaveSystem.getWorld(second.world.id).name, 'Map B');
    assert.equal(SaveSystem.loadWorld(second.world.id).survivalSeconds, 20);
});

test('captured saves retain removed environment objects', () => {
    const scene = {
        worldSeed: 'persistent-island',
        survivalSeconds: 42,
        player: { position: [1, 2, 3], rotation: [0, 0.5, 0] },
        vitals: { health: 90, hunger: 80, thirst: 70, stamina: 60 },
        inventory: { slots: [], selectedHotbarIndex: 0 },
        objectiveTracker: { getPinnedRecipeId: () => 'stone_axe' },
        raftAssembly: {
            framePlaced: false,
            floatsPlaced: false,
            paddlePlaced: false,
            sailPlaced: false,
            motorPlaced: false,
        },
        campfire: { isBuilt: false, position: [0, 0, 0] },
        waterCollector: {
            isBuilt: false,
            position: [0, 0, 0],
            waterStored: 0,
            rainProgress: 0.625,
        },
        unlockedBlueprints: new Set(),
        dayNight: { timeOfDay: 0.25 },
        weather: {
            currentWeather: 'clear',
            cloudCover: 0.1,
            windSpeed: 0.5,
            rainIntensity: 0,
        },
        removedEnvironmentObjectIds: new Set(['4', '19']),
        resourceManager: { worldResources: [] },
        stats: {},
    };

    const save = SaveSystem.captureScene(scene);
    assert.deepEqual(save.environment.removedObjectIds, ['4', '19']);
    assert.equal(save.ui.pinnedRecipeId, 'stone_axe');
    assert.equal(save.structures.waterCollector.rainProgress, 0.625);
});

test('page lifecycle saves hidden sessions and unregisters cleanly', () => {
    const listeners = new Map();
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    globalThis.window = {
        addEventListener(type, listener) { listeners.set(`window:${type}`, listener); },
        removeEventListener(type, listener) {
            if (listeners.get(`window:${type}`) === listener) listeners.delete(`window:${type}`);
        },
    };
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener(type, listener) { listeners.set(`document:${type}`, listener); },
        removeEventListener(type, listener) {
            if (listeners.get(`document:${type}`) === listener) listeners.delete(`document:${type}`);
        },
    };

    try {
        const scene = {
            _isGameOver: false,
            isEscaping: false,
            activeWorldId: 'world-1',
            survivalSeconds: 12,
            stats: {},
            _domCache: {},
        };
        let saves = 0;
        const storage = {
            captureScene: value => value,
            saveWorld(id, value) {
                assert.equal(id, 'world-1');
                assert.equal(value, scene);
                saves++;
                return true;
            },
        };
        const controller = new GameSaveController(scene, {
            storage,
            window: globalThis.window,
            document: globalThis.document,
            autosaveInterval: 1,
        });
        controller.attach();

        listeners.get('document:visibilitychange')();
        assert.equal(saves, 0);
        globalThis.document.visibilityState = 'hidden';
        listeners.get('document:visibilitychange')();
        listeners.get('window:pagehide')();
        assert.equal(saves, 2);

        controller.updateAutosave(1);
        assert.equal(saves, 3);

        controller.dispose();
        assert.equal(listeners.size, 0);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});
