import test from 'node:test';
import assert from 'node:assert/strict';
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
