import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';
import { PROTOCOL_VERSION, sharedFromSnapshot, personalFromSnapshot, snapshotFromState, diffShared,
    applyChanges, safeRecordKey } from '../src/network/WorldSync.js';
import { socketURL } from '../src/network/NetworkClient.js';
import { ServerBookmarks } from '../src/network/ServerBookmarks.js';
import { getDebrisDef } from '../src/systems/DebrisDatabase.js';

function fixture(seed = 'network-test') {
    const snapshot = worldSnapshot({ mode: 'classic', seed, generatorVersion: 1 });
    snapshot.environment = { timeOfDay: 0.4, weather: 'clear', cloudCover: 0.1, windSpeed: 0.2, rainIntensity: 0, removedObjectIds: [] };
    snapshot.resources = [{ id: 'wood', netId: 'initial-0', position: [2, 1, 3], rewardType: null }];
    return snapshot;
}

async function setup(t, options = {}) {
    await mkdir('.cache', { recursive: true });
    const dataDir = await mkdtemp(resolve('.cache', 'network-test-'));
    let app = await createGameServer({ dataDir, ...options });
    let address = await app.listen(0, '127.0.0.1');
    const clients = [];
    t.after(async () => {
        for (const client of clients) client.socket.terminate();
        await app.close();
        if (resolve(dataDir).startsWith(resolve('.cache') + sep)) await rm(dataDir, { recursive: true, force: true });
    });
    return { get app() { return app; }, dataDir,
        get http() { return `http://127.0.0.1:${address.port}`; },
        async restart() {
            for (const client of clients) client.socket.terminate();
            await app.close();
            app = await createGameServer({ dataDir, ...options });
            address = await app.listen(0, '127.0.0.1');
        },
        async client(hello) {
            const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
            const messages = [], waiters = [];
            socket.on('message', raw => {
                const message = JSON.parse(raw);
                const i = waiters.findIndex(w => w.type === message.type);
                if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(message); }
                else messages.push(message);
            });
            const client = { socket,
                send: message => socket.send(JSON.stringify(message)),
                next(type) {
                    const i = messages.findIndex(m => m.type === type);
                    if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
                    return new Promise((resolve, reject) => {
                        const waiter = { type, resolve, timer: setTimeout(() => reject(new Error(`Missing ${type}; received ${JSON.stringify(messages).slice(0, 400)}`)), 3000) };
                        waiters.push(waiter);
                    });
                },
            };
            clients.push(client);
            await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
            client.send({ type: 'hello', protocol: PROTOCOL_VERSION, name: 'Survivor', serverPassword: '', password: '', ...hello });
            return client;
        },
    };
}

test('socket addresses require a dedicated server address and support LAN, IPv6 and HTTPS', () => {
    const location = { origin: 'http://192.168.1.9:3000', protocol: 'http:' };
    assert.throws(() => socketURL('', location), /địa chỉ server riêng/);
    assert.equal(socketURL('192.168.1.4:3000', location), 'ws://192.168.1.4:3000/ws');
    assert.equal(socketURL('https://island.example/game/', location), 'wss://island.example/game/ws');
    assert.equal(socketURL('http://[::1]:3000', location), 'ws://[::1]:3000/ws');
    assert.throws(() => socketURL('ftp://localhost', location));
    assert.throws(() => socketURL('http://user:pass@localhost', location));
    assert.throws(() => socketURL('http://192.168.1.4', { origin: 'https://example.com', protocol: 'https:' }));
});

test('world records round-trip with personal inventory kept separate and prototype keys forbidden', () => {
    const snapshot = fixture();
    const shared = sharedFromSnapshot(snapshot), personal = personalFromSnapshot(snapshot);
    assert.equal('inventory' in shared, false);
    const restored = snapshotFromState(snapshot, shared, personal);
    assert.deepEqual(restored.resources, snapshot.resources);
    assert.deepEqual(restored.inventory, snapshot.inventory);
    assert.equal(safeRecordKey('__proto__'), false);
    assert.equal(safeRecordKey('constructor'), false);
    assert.equal(safeRecordKey('campaign:unknown'), false);
    const next = { ...shared }; delete next['resource:initial-0'];
    assert.deepEqual(applyChanges(shared, diffShared(shared, next)), next);
});

test('server serializes competing pickups, restores the losing inventory and persists player tokens across restart', async t => {
    const env = await setup(t);
    const host = await env.client({ action: 'create', world: { name: 'LAN', seed: 'network-test', mode: 'classic' } });
    const welcome = await host.next('welcome');
    host.send({ type: 'initialize', snapshot: fixture() });
    const initialized = await host.next('initialized');
    const guest = await env.client({ action: 'join', room: welcome.room, name: 'Guest' });
    const guestWelcome = await guest.next('welcome');
    const shared = initialized.shared;
    const personalA = personalFromSnapshot(fixture()), personalB = personalFromSnapshot(fixture());
    personalA.inventory.slots[0] = { id: 'wood', count: 1 };
    personalB.inventory.slots[0] = { id: 'wood', count: 1 };
    const changes = [{ key: 'resource:initial-0', before: shared['resource:initial-0'], value: null }];
    host.send({ type: 'commit', seq: 1, changes, personal: personalA });
    guest.send({ type: 'commit', seq: 1, changes, personal: personalB });
    const accepted = await host.next('accepted');
    assert.equal(accepted.revision, 1);
    const rejected = await guest.next('rejected');
    assert.equal(rejected.personal.inventory.slots[0], null);
    assert.equal(rejected.shared['resource:initial-0'], undefined);
    assert.equal((await guest.next('changes')).changes[0].value, null);
    host.send({ type: 'save', request: 1 });
    await host.next('saved');
    host.send({ type: 'checkpoint', action: 'save', request: 'before-departure' });
    assert.equal((await host.next('checkpoint')).ok, true);
    personalA.inventory.slots[0].count = 2;
    host.send({ type: 'commit', seq: 2, changes: [], personal: personalA });
    await host.next('accepted');
    host.send({ type: 'checkpoint', action: 'load', request: 'return-to-base' });
    assert.equal((await host.next('checkpoint')).personal.inventory.slots[0].count, 1);
    assert.equal([...env.app.rooms.values()][0].shared['resource:initial-0'], undefined, 'loading a player checkpoint cannot rewind the shared island');
    const disk = JSON.parse(await readFile(resolve(env.dataDir, 'worlds.json'), 'utf8'));
    assert.equal(disk.rooms[0].players.length, 2);
    assert.equal(JSON.stringify(disk).includes(welcome.token), true);
    await env.restart();
    const resumed = await env.client({ action: 'join', room: welcome.room, token: welcome.token });
    const rejoined = await resumed.next('welcome');
    assert.equal(rejoined.id, welcome.id);
    assert.equal(rejoined.snapshot.inventory.slots[0].count, 2);
    assert.equal(rejoined.snapshot.resources.length, 0);
    const returningGuest = await env.client({ action: 'join', room: welcome.room, token: guestWelcome.token });
    assert.equal((await returningGuest.next('welcome')).snapshot.inventory.slots[0], null);
});

test('private rooms reject wrong passwords, capacity, malformed packets and stale clock ownership', async t => {
    const env = await setup(t, { maxPlayers: 2, accessPassword: 'server-secret' });
    const wrongServer = await env.client({ action: 'create' });
    assert.match((await wrongServer.next('error')).message, /mật khẩu server/);
    wrongServer.socket.terminate();
    const host = await env.client({ action: 'create', serverPassword: 'server-secret', password: 'room-secret', world: { mode: 'classic', seed: 'network-test' } });
    const welcome = await host.next('welcome');
    host.send({ type: 'initialize', snapshot: fixture() });
    await host.next('initialized'); await host.next('roster');
    const denied = await env.client({ action: 'join', serverPassword: 'server-secret', room: welcome.room, password: 'bad' });
    assert.match((await denied.next('error')).message, /sai mật khẩu/); denied.socket.terminate();
    const guest = await env.client({ action: 'join', serverPassword: 'server-secret', room: welcome.room, password: 'room-secret' });
    const guestWelcome = await guest.next('welcome'); await host.next('roster'); await guest.next('roster');
    const full = await env.client({ action: 'join', serverPassword: 'server-secret', room: welcome.room, password: 'room-secret' });
    assert.match((await full.next('error')).message, /đủ 2/); full.socket.terminate();
    host.send({ type: 'pose', pose: { position: [1, 2, 3], yaw: 0, paused: true } });
    assert.equal((await guest.next('roster')).leader, guestWelcome.id);
    assert.equal((await host.next('roster')).leader, guestWelcome.id);
    const shared = [...env.app.rooms.values()][0].shared;
    const clockChanges = [{ key: 'clock', before: shared.clock, value: { ...shared.clock, timeOfDay: 0.8 } }];
    host.send({ type: 'commit', seq: 1, changes: clockChanges, personal: personalFromSnapshot(fixture()) });
    assert.equal((await host.next('rejected')).shared.clock.timeOfDay, 0.4);
    guest.send({ type: 'commit', seq: 1, changes: [{ key: '__proto__', before: null, value: {} }], personal: personalFromSnapshot(fixture()) });
    assert.match((await guest.next('error')).message, /không hợp lệ/);
    guest.send({ type: 'commit', seq: 2, changes: [], personal: null });
    await guest.next('rejected');
    const response = await fetch(env.http + '/api/health'); assert.equal((await response.json()).ok, true);
    const rootResponse = await fetch(env.http);
    assert.match(rootResponse.headers.get('content-type'), /application\/json/);
    assert.equal((await rootResponse.json()).service, 'Island Survival Dedicated Server');
    assert.equal((await fetch(env.http + '/index.html')).status, 404);
    assert.equal((await fetch(env.http + '/server/index.js')).status, 404);
    assert.equal((await fetch(env.http + '/%2e%2e/server/index.js')).status, 404);
});

test('server bookmarks retain only connection addresses and support edit, remove and corrupt storage', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const bookmarks = new ServerBookmarks(storage, { origin: 'http://localhost:3000', protocol: 'http:' });
    const saved = bookmarks.save({ name: 'Bạn bè', url: '192.168.1.2:3000', room: '', password: 'never-store-this' });
    assert.equal(saved.url, 'ws://192.168.1.2:3000/ws');
    assert.equal(JSON.stringify(bookmarks.list()).includes('never-store-this'), false);
    bookmarks.save({ ...saved, name: 'Tên mới', room: 'ABC234' });
    assert.equal(bookmarks.list().length, 1);
    assert.equal(bookmarks.list()[0].name, 'Tên mới');
    assert.throws(() => bookmarks.save({ name: 'Bad', url: 'ftp://example.com' }));
    bookmarks.remove(saved.id); assert.deepEqual(bookmarks.list(), []);
    storage.setItem('island.online.servers.v1', 'broken-json'); assert.deepEqual(bookmarks.list(), []);
});

test('joining an empty server by address creates its default island and status probes never join or expose credentials', async t => {
    const env = await setup(t);
    const probe = await env.client({ type: 'inspect' });
    assert.deepEqual((await probe.next('serverStatus')).rooms, []);
    assert.equal(env.app.rooms.size, 0);
    const first = await env.client({ action: 'join', world: { mode: 'classic', seed: 'network-test' } });
    const welcome = await first.next('welcome');
    first.send({ type: 'initialize', snapshot: fixture() }); await first.next('initialized');
    const statusProbe = await env.client({ type: 'inspect' });
    const status = await statusProbe.next('serverStatus');
    assert.equal(status.rooms[0].players, 1);
    assert.equal(status.rooms[0].ready, true);
    assert.equal(JSON.stringify(status).includes(welcome.token), false);
    assert.equal(JSON.stringify(status).includes('salt'), false);
    const second = await env.client({ action: 'join' });
    assert.equal((await second.next('welcome')).room, welcome.room);
    assert.equal([...env.app.rooms.values()][0].members.size, 2);
});

test('headless server accepts every Survival Pack drift type without loading browser assets', async t => {
    const manifest = JSON.parse(await readFile(new URL('../assets/survival-pack/survival-items.json', import.meta.url), 'utf8'));
    const env = await setup(t);
    const host = await env.client({ action: 'create', world: { mode: 'classic', seed: 'network-test' } });
    const welcome = await host.next('welcome');
    host.send({ type: 'initialize', snapshot: fixture() });
    await host.next('initialized');
    const changes = manifest.items.filter(item => item.registerAsDebris !== false).map(item => {
        const type = 'survival:' + item.id, def = getDebrisDef(type);
        for (const field of ['name', 'nameEn', 'icon', 'modelScale', 'pickupRadius', 'gives', 'lifetime', 'driftSpeed', 'spawnWeight']) {
            assert.deepEqual(def?.[field], item[field], type + ':' + field);
        }
        return { key: 'debris:' + item.id, before: null, value: { netId: item.id, type,
            position: [1, 0, 2], direction: [1, 0, 0], speed: 1, age: 0, lifetime: 60,
            yaw: 0, onShore: false, hooked: false, owner: null } };
    });
    const personal = personalFromSnapshot(fixture());
    host.send({ type: 'commit', seq: 1, changes, personal });
    assert.equal((await host.next('accepted')).changes.length, changes.length);
    const unknown = { ...changes[0], key: 'debris:unknown', value: { ...changes[0].value, netId: 'unknown', type: 'survival:unknown' } };
    host.send({ type: 'commit', seq: 2, changes: [unknown], personal });
    await host.next('rejected');
    await env.restart();
    const resumed = await env.client({ action: 'join', room: welcome.room, token: welcome.token });
    const rejoined = await resumed.next('welcome');
    assert.equal(Object.keys(rejoined.shared).filter(key => key.startsWith('debris:')).length, changes.length);
});
