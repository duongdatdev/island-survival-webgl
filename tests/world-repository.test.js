import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { WorldRepository } from '../src/systems/WorldRepository.js';
import { decodeSnapshot, validateSnapshot } from '../src/systems/SnapshotCodec.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';

const noLegacy = { listWorlds: () => [], loadWorld: () => null };

test('a deleted migrated world does not reappear when retained legacy data is reopened', async () => {
    const indexedDB = new IDBFactory();
    const oldWorld = { id: 'retained-legacy', name: 'Legacy', seed: 'old', status: 'playing' };
    const legacy = { listWorlds: () => [oldWorld], loadWorld: () => null };
    const store = new WorldRepository({ indexedDB, legacy });
    await store.initialize();
    assert.equal((await store.listWorlds()).length, 1);
    await store.deleteWorld(oldWorld.id);
    await store.close();
    const reopened = new WorldRepository({ indexedDB, legacy });
    await reopened.initialize();
    assert.deepEqual(await reopened.listWorlds(), []);
    assert.equal(await reopened.getWorld(oldWorld.id), null);
    assert.equal(legacy.listWorlds().length, 1);
    await reopened.close();
});
function repository() { return new WorldRepository({ indexedDB: new IDBFactory(), legacy: noLegacy }); }
function snapshot(world, seconds = 10) {
    return worldSnapshot(world, seconds);
}

test('malformed world-event, animal and fishing snapshots are rejected before saving or importing', async () => {
    const store = repository(); const { world } = await store.createWorld({ name: 'Nested validation' });
    await store.saveWorld(world.id, snapshot(world, 10));
    for (const fields of [
        { islandEvents: null }, { islandEvents: { cargo: {} } }, { islandEvents: { cutProgress: 100 } },
        { wildlife: { killed: ['boar-100'], animals: [] } },
        { wildlife: { killed: ['boar-01'], animals: [] } },
        { wildlife: { killed: ['boar-1', 'boar-1'], animals: [] } },
        { wildlife: { killed: [], animals: [{ id: 'boar-0', position: [0, 0, 0], health: 10000, yaw: 0 }] } },
        { fishing: { phase: 'landed', position: [0, 0, 0], fish: 'wood', timer: 0, time: 1, tension: 0, progress: 1, group: 0 } },
    ]) {
        const bad = snapshot(world, 20); Object.assign(bad.campaign, fields);
        assert.equal(validateSnapshot(bad), false); assert.equal(await store.saveWorld(world.id, bad), false);
        const imported = await store.importWorld(JSON.stringify({ format: 'island-survival-world', version: 2, world, snapshot: bad, checkpoint: null }));
        assert.equal(imported.ok, false); assert.equal((await store.listWorlds()).length, 1);
        assert.equal((await store.loadWorld(world.id)).survivalSeconds, 10);
    }
    await store.close();
});

test('campaign worlds default to new generator and store two snapshots plus checkpoint', async () => {
    const store = repository();
    const { world } = await store.createWorld({ name: 'Đảo mới', seed: 'new-world' });
    assert.equal(world.mode, 'campaign');
    assert.equal(world.generatorVersion, 3);
    assert.equal(await store.saveWorld(world.id, snapshot(world, 10), { checkpoint: true }), true);
    assert.equal(await store.saveWorld(world.id, snapshot(world, 20)), true);
    assert.equal((await store.loadWorld(world.id)).survivalSeconds, 20);
    assert.equal((await store.loadWorld(world.id, 'previous')).survivalSeconds, 10);
    assert.equal((await store.loadWorld(world.id, 'checkpoint')).survivalSeconds, 10);
    await store.close();
});

test('quota exceptions and interrupted writes roll back snapshots, checkpoint and route metadata', async () => {
    for (const failure of ['quota', 'interruption']) {
    const store = repository(), { world } = await store.createWorld({ name: 'Quota' });
    await store.saveWorld(world.id, snapshot(world, 10), { checkpoint: true });
    const database = await store.open(), original = database.transaction.bind(database); let writes = 0;
    database.transaction = (...args) => {
        const tx = original(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
            const os = objectStore(name);
            if (tx.mode === 'readwrite' && !os.quotaWrapped) {
                const put = os.put.bind(os); os.quotaWrapped = true;
                os.put = (...values) => {
                    writes++;
                    if (failure === 'quota' && writes === 2) throw new DOMException('Full storage', 'QuotaExceededError');
                    if (failure === 'interruption' && writes === 3) queueMicrotask(() => tx.abort());
                    return put(...values);
                };
            }
            return os;
        };
        return tx;
    };
    assert.equal(await store.saveWorld(world.id, snapshot(world, 20), { checkpoint: true, completedRoute: 'raft' }), false);
    database.transaction = original;
    assert.equal((await store.loadWorld(world.id)).survivalSeconds, 10);
    assert.equal((await store.loadWorld(world.id, 'checkpoint')).survivalSeconds, 10);
    assert.equal(await store.loadWorld(world.id, 'previous'), null);
    assert.deepEqual((await store.getWorld(world.id)).completedRoutes, []);
    assert.equal(await store.saveWorld(world.id, snapshot(world, 30)), true);
    await store.close();
    }
});

test('all corrupted snapshots block loading and leave stored data available for recovery', async () => {
    const store = repository(), { world } = await store.createWorld({ name: 'Corrupt' });
    await store.saveWorld(world.id, snapshot(world, 10));
    const db = await store.open();
    const record = await store._read('snapshots', `${world.id}:latest`);
    const mutation = db.transaction('snapshots', 'readwrite'); mutation.objectStore('snapshots').put({ ...record, json: '{broken' });
    await new Promise(resolve => { mutation.oncomplete = resolve; });
    await assert.rejects(() => store.loadWorld(world.id), /Không còn bản lưu hợp lệ/);
    assert.equal((await store._read('snapshots', `${world.id}:latest`)).json, '{broken');
    assert.equal((await store.getWorld(world.id)).survivalSeconds, 10);
    const backup = JSON.parse(await store.exportWorld(world.id));
    assert.equal(backup.format, 'island-survival-recovery'); assert.equal(backup.records[0].json, '{broken');
    assert.equal((await store.importWorld(JSON.stringify(backup))).ok, false);
    await store.close();
});

test('corrupt Classic migration stays visible and exportable, retains source, and retries after source repair', async () => {
    const indexedDB = new IDBFactory(), world = { id: 'old-bad', name: 'Old island', seed: 'old', status: 'playing' };
    let raw = '{broken', data = null;
    const legacy = { listWorlds: () => [world], loadWorld: () => data, readRawWorld: () => raw };
    const store = new WorldRepository({ indexedDB, legacy }); await store.initialize();
    assert.equal((await store.listWorlds()).length, 1); assert.match((await store.getWorld(world.id)).recoveryProblem, /Classic/);
    await assert.rejects(() => store.loadWorld(world.id), /Classic/);
    const exported = JSON.parse(await store.exportWorld(world.id)); assert.equal(exported.legacy, raw);
    await store.close();
    data = { ...worldSnapshot({ ...world, mode: 'classic', generatorVersion: 1 }), version: 1 }; raw = JSON.stringify(data);
    const repaired = new WorldRepository({ indexedDB, legacy }); await repaired.initialize();
    assert.equal((await repaired.getWorld(world.id)).recoveryProblem, null);
    assert.deepEqual((await repaired.loadWorld(world.id)).player.position, data.player.position);
    assert.equal(legacy.readRawWorld(), raw); await repaired.close();
});

test('concurrent writes are serialized and capture state at submission', async () => {
    const store = repository();
    const { world } = await store.createWorld({ name: 'Queue' });
    const first = snapshot(world, 10);
    const pending = store.saveWorld(world.id, first);
    first.survivalSeconds = 999;
    await Promise.all([pending, store.saveWorld(world.id, snapshot(world, 20)), store.saveWorld(world.id, snapshot(world, 30))]);
    assert.equal((await store.loadWorld(world.id)).survivalSeconds, 30);
    assert.equal((await store.loadWorld(world.id, 'previous')).survivalSeconds, 20);
    await store.close();
});

test('corrupted latest snapshot falls back without accepting altered contents', async () => {
    const store = repository();
    const { world } = await store.createWorld({ name: 'Recovery' });
    await store.saveWorld(world.id, snapshot(world, 10));
    await store.saveWorld(world.id, snapshot(world, 20));
    const record = await store._read('snapshots', `${world.id}:latest`);
    record.json = record.json.replace('20', '99');
    assert.equal(decodeSnapshot(record), null);
    const db = await store.open();
    await new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record);
        tx.oncomplete = resolve;
        tx.onabort = reject;
    });
    assert.equal((await store.loadWorld(world.id)).survivalSeconds, 10);
    assert.equal(await store.saveWorld(world.id, snapshot(world, 30)), true);
    assert.equal((await store.loadWorld(world.id, 'previous')).survivalSeconds, 10);
    await store.close();
});

test('invalid and foreign-world saves never replace valid progress', async () => {
    const store = repository();
    const { world } = await store.createWorld({ name: 'Validation' });
    await store.saveWorld(world.id, snapshot(world, 10));
    const bad = snapshot(world, 20);
    bad.player.position[0] = Infinity;
    assert.equal(await store.saveWorld(world.id, bad), false);
    const foreign = snapshot(world, 20);
    foreign.worldSeed = 'other';
    assert.equal(await store.saveWorld(world.id, foreign), false);
    assert.equal((await store.loadWorld(world.id)).survivalSeconds, 10);
    await store.close();
});

test('v1 migration retains positions and Classic identity without deleting its source', async () => {
    const oldWorld = { id: 'old-world', name: 'Căn cứ cũ', seed: 'legacy-seed', status: 'playing' };
    const oldSnapshot = { ...snapshot({ ...oldWorld, mode: 'classic', generatorVersion: 1 }), version: 1 };
    delete oldSnapshot.mode;
    delete oldSnapshot.generatorVersion;
    const store = new WorldRepository({ indexedDB: new IDBFactory(), legacy: {
        listWorlds: () => [oldWorld], loadWorld: () => oldSnapshot } });
    await store.initialize();
    await store.initialize();
    const world = await store.getWorld(oldWorld.id);
    const restored = await store.loadWorld(oldWorld.id);
    assert.equal(world.mode, 'classic');
    assert.equal(restored.generatorVersion, 1);
    assert.deepEqual(restored.player.position, oldSnapshot.player.position);
    assert.equal(oldSnapshot.version, 1);
    assert.equal((await store.listWorlds()).length, 1);
    await store.close();
});

test('export/import creates an isolated copy and preserves checkpoint and both ending flags', async () => {
    const store = repository();
    const { world } = await store.createWorld({ name: 'My Island' });
    await store.saveWorld(world.id, snapshot(world, 10), { checkpoint: true });
    await store.finishWorld(world.id, 'escaped', 10, 'raft');
    await store.finishWorld(world.id, 'escaped', 10, 'rescue');
    const exported = await store.exportWorld(world.id);
    const result = await store.importWorld(exported);
    assert.equal(result.ok, true);
    assert.equal(result.world.name, 'My Island (2)');
    assert.notEqual(result.world.id, world.id);
    assert.deepEqual(result.world.completedRoutes, ['raft', 'rescue']);
    assert.equal((await store.loadWorld(result.world.id, 'checkpoint')).survivalSeconds, 10);
    assert.equal((await store.importWorld('{bad')).ok, false);
    assert.equal((await store.listWorlds()).length, 2);
    await store.close();
});

test('deleting one world does not remove another world or its checkpoint', async () => {
    const store = repository();
    const { world: a } = await store.createWorld({ name: 'A' });
    const { world: b } = await store.createWorld({ name: 'B' });
    await store.saveWorld(a.id, snapshot(a), { checkpoint: true });
    await store.saveWorld(b.id, snapshot(b), { checkpoint: true });
    assert.equal((await store.deleteWorld(a.id)).ok, true);
    assert.equal(await store.loadWorld(a.id), null);
    assert.equal((await store.loadWorld(b.id, 'checkpoint')).survivalSeconds, 10);
    await store.close();
});
