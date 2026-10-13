import { SaveSystem } from './SaveSystem.js';
import { encodeSnapshot, decodeSnapshot, upgradeClassicSnapshot, validateSnapshot } from './SnapshotCodec.js';

const SLOTS = ['latest', 'previous', 'checkpoint'];
const IMPORT_LIMIT = 20 * 1024 * 1024;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Không thể đọc dữ liệu.'));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('Giao dịch lưu bị gián đoạn.'));
        transaction.onerror = () => {}; // onabort is the definitive failed commit.
    });
}

function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The asynchronous world/save API. Legacy localStorage is read-only during migration. */
export class WorldRepository {
    constructor(options = {}) {
        this.indexedDB = options.indexedDB || globalThis.indexedDB;
        this.name = options.name || 'island_survival_v2';
        this.legacy = options.legacy || SaveSystem;
        this._openPromise = null;
        this._queue = Promise.resolve();
        this._ready = null;
        this.recoveryWarnings = new Map();
    }

    async open() {
        if (!this._openPromise) {
            this._openPromise = new Promise((resolve, reject) => {
                if (!this.indexedDB) { reject(new Error('Trình duyệt không hỗ trợ lưu thế giới.')); return; }
                const request = this.indexedDB.open(this.name, 1);
                request.onupgradeneeded = () => {
                    const database = request.result;
                    database.createObjectStore('worlds', { keyPath: 'id' });
                    database.createObjectStore('snapshots', { keyPath: 'key' });
                };
                request.onsuccess = () => {
                    const database = request.result;
                    database.onversionchange = () => { database.close(); this._openPromise = null; };
                    resolve(database);
                };
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Hãy đóng tab game cũ để mở bộ nhớ thế giới.'));
            }).catch(error => { this._openPromise = null; throw error; });
        }
        return this._openPromise;
    }

    _serialize(operation) {
        const result = this._queue.then(operation);
        this._queue = result.catch(() => {});
        return result;
    }

    initialize() {
        if (!this._ready) this._ready = this._serialize(async () => {
            await this.open();
            for (const oldWorld of this.legacy.listWorlds()) {
                const existing = await this._read('worlds', oldWorld.id);
                if (existing?.deleted || existing && !existing.recoveryProblem) continue;
                const legacySnapshot = this.legacy.loadWorld(oldWorld.id);
                const snapshot = legacySnapshot ? upgradeClassicSnapshot(legacySnapshot) : null;
                const corrupt = legacySnapshot && !snapshot || !legacySnapshot && (!!this.legacy.readRawWorld?.(oldWorld.id) || oldWorld.status === 'playing');
                const world = { ...oldWorld, ...(existing || {}), mode: 'classic', generatorVersion: 1,
                    difficulty: 'standard', completedRoutes: [], migratedFromV1: true,
                    recoveryProblem: corrupt ? 'Bản lưu Classic cũ bị hỏng. Dữ liệu gốc vẫn được giữ; hãy xuất tệp phục hồi hoặc nhập bản sao hợp lệ.' : null };
                await this._writeInitial(world, snapshot);
                if (corrupt) continue;
                const restored = snapshot ? await this.loadWorld(world.id) : await this.getWorld(world.id);
                if (!restored) throw new Error(`Không thể xác minh bản lưu cũ: ${world.name}`);
            }
        }).catch(error => { this._ready = null; throw error; });
        return this._ready;
    }

    async _read(storeName, key) {
        const database = await this.open();
        const transaction = database.transaction(storeName, 'readonly');
        const done = transactionDone(transaction);
        const request = key === undefined ? transaction.objectStore(storeName).getAll()
            : transaction.objectStore(storeName).get(key);
        const [value] = await Promise.all([requestResult(request), done]);
        return value;
    }

    async listWorlds() {
        return (await this._read('worlds')).filter(world => !world.deleted).sort((a, b) =>
            (b.lastPlayedAt || b.updatedAt || b.createdAt) - (a.lastPlayedAt || a.updatedAt || a.createdAt));
    }

    async getWorld(id) {
        const world = await this._read('worlds', id);
        return world && !world.deleted ? world : null;
    }

    async _writeInitial(world, snapshot, checkpoint = null) {
        const database = await this.open();
        const transaction = database.transaction(['worlds', 'snapshots'], 'readwrite');
        const done = transactionDone(transaction);
        try {
            transaction.objectStore('worlds').put(world);
            if (snapshot) transaction.objectStore('snapshots').put(encodeSnapshot(world.id, 'latest', snapshot));
            if (checkpoint) transaction.objectStore('snapshots').put(encodeSnapshot(world.id, 'checkpoint', checkpoint));
        } catch (error) {
            transaction.abort();
            await done.catch(() => {});
            throw error;
        }
        await done;
    }

    createWorld({ name, seed = '', mode = 'campaign', difficulty = 'standard' }) {
        return this._serialize(async () => {
            name = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
            seed = typeof seed === 'string' ? seed.trim() : '';
            if (!name || name.length > 32) return { ok: false, error: 'Tên thế giới phải có từ 1 đến 32 ký tự.' };
            if (seed.length > 64 || !['classic', 'campaign'].includes(mode)
                || !['relaxed', 'standard', 'harsh'].includes(difficulty)) return { ok: false, error: 'Cấu hình thế giới không hợp lệ.' };
            const worlds = await this.listWorlds();
            if (worlds.some(world => world.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
                return { ok: false, error: 'Tên thế giới này đã được sử dụng.' };
            }
            const now = Date.now();
            const world = { id: makeId(), name, seed: seed || makeId().slice(0, 32), mode, difficulty,
                generatorVersion: mode === 'classic' ? 1 : 3, status: 'new', createdAt: now,
                updatedAt: now, lastPlayedAt: 0, survivalSeconds: 0, playSeconds: 0, completedRoutes: [] };
            await this._writeInitial(world, null);
            return { ok: true, world };
        });
    }

    async loadWorld(id, slot = null) {
        const world = await this.getWorld(id);
        if (!world) return null;
        if (!slot && world.recoveryProblem) throw new Error(world.recoveryProblem);
        let hadRecord = false;
        if (!slot) this.recoveryWarnings.delete(id);
        for (const name of slot ? [slot] : SLOTS) {
            const record = await this._read('snapshots', `${id}:${name}`);
            hadRecord ||= !!record;
            const snapshot = decodeSnapshot(record);
            if (snapshot && snapshot.worldSeed === world.seed && snapshot.mode === world.mode
                && snapshot.generatorVersion === world.generatorVersion) {
                if (!slot && name !== 'latest') this.recoveryWarnings.set(id, 'Bản lưu gần nhất bị hỏng. Đã khôi phục bản trước đó; một phần tiến trình gần đây có thể chưa được lưu.');
                return snapshot;
            }
        }
        if (!slot && (hadRecord || ['playing', 'completed'].includes(world.status))) throw new Error('Không còn bản lưu hợp lệ cho thế giới này. Dữ liệu gốc vẫn được giữ; hãy nhập bản sao đã xuất để khôi phục.');
        return null;
    }

    saveWorld(id, data, options = {}) {
        // Capture before joining the queue; later scene mutations cannot alter this save.
        let snapshot;
        try { snapshot = structuredClone(data); }
        catch { return Promise.resolve(false); }
        if (!validateSnapshot(snapshot)) return Promise.resolve(false);
        return this._serialize(async () => {
            const world = await this.getWorld(id);
            if (!world || snapshot.worldSeed !== world.seed || snapshot.mode !== world.mode
                || snapshot.generatorVersion !== world.generatorVersion) return false;
            const routes = world.mode === 'campaign' && ['raft', 'rescue'].includes(options.completedRoute)
                ? [...new Set([...(world.completedRoutes || []), options.completedRoute])] : world.completedRoutes || [];
            const record = encodeSnapshot(id, 'latest', snapshot);
            const database = await this.open();
            const transaction = database.transaction(['worlds', 'snapshots'], 'readwrite');
            const done = transactionDone(transaction);
            const store = transaction.objectStore('snapshots');
            const latest = store.get(`${id}:latest`);
            latest.onsuccess = () => {
                try {
                    const previous = decodeSnapshot(latest.result);
                    if (previous) store.put(encodeSnapshot(id, 'previous', previous));
                    store.put(record);
                    if (options.checkpoint) store.put(encodeSnapshot(id, 'checkpoint', snapshot));
                    transaction.objectStore('worlds').put({ ...world, updatedAt: Date.now(), lastPlayedAt: Date.now(),
                        completedRoutes: routes, status: routes.length ? 'completed' : 'playing',
                        survivalSeconds: snapshot.survivalSeconds, playSeconds: snapshot.playSeconds || 0,
                        chapter: snapshot.campaign?.chapter || 1 });
                } catch { transaction.abort(); }
            };
            try { await done; return true; }
            catch { return false; }
        });
    }

    async _updateWorld(id, transform, clearSnapshots = false) {
        const world = await this.getWorld(id);
        if (!world) return null;
        const updated = transform(world);
        const database = await this.open();
        const transaction = database.transaction(['worlds', 'snapshots'], 'readwrite');
        const done = transactionDone(transaction);
        if (updated) transaction.objectStore('worlds').put(updated);
        else transaction.objectStore('worlds').put({ ...world, deleted: true });
        if (clearSnapshots) for (const slot of SLOTS) transaction.objectStore('snapshots').delete(`${id}:${slot}`);
        await done;
        return updated || world;
    }

    renameWorld(id, name) {
        return this._serialize(async () => {
            name = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
            if (!name || name.length > 32) return { ok: false, error: 'Tên thế giới phải có từ 1 đến 32 ký tự.' };
            const worlds = await this.listWorlds();
            if (worlds.some(world => world.id !== id && world.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
                return { ok: false, error: 'Tên thế giới này đã được sử dụng.' };
            }
            const world = await this._updateWorld(id, world => ({ ...world, name, updatedAt: Date.now() }));
            return world ? { ok: true, world } : { ok: false, error: 'Thế giới không còn tồn tại.' };
        });
    }

    deleteWorld(id) {
        return this._serialize(async () => ({ ok: !!await this._updateWorld(id, () => null, true) }));
    }

    prepareWorld(id) {
        return this._serialize(() => this._updateWorld(id, world => ({ ...world, lastPlayedAt: Date.now() })));
    }

    resetWorld(id) {
        return this._serialize(async () => !!await this._updateWorld(id, world => ({ ...world,
            status: 'new', survivalSeconds: 0, playSeconds: 0, chapter: 1, completedRoutes: [] }), true));
    }

    finishWorld(id, status, survivalSeconds, route = 'raft') {
        return this._serialize(async () => {
            const existing = await this.getWorld(id);
            if (!existing) return false;
            const campaign = existing.mode === 'campaign';
            return !!await this._updateWorld(id, world => ({ ...world, updatedAt: Date.now(), survivalSeconds,
                status: campaign ? status === 'escaped' ? 'completed' : world.status : status,
                completedRoutes: campaign && status === 'escaped'
                    ? [...new Set([...(world.completedRoutes || []), route])] : world.completedRoutes }), !campaign);
        });
    }

    async exportWorld(id) {
        await this._queue;
        const world = await this.getWorld(id);
        if (!world) throw new Error('Thế giới không còn tồn tại.');
        try {
            return JSON.stringify({ format: 'island-survival-world', version: 2, world,
                snapshot: await this.loadWorld(id), checkpoint: await this.loadWorld(id, 'checkpoint') }, null, 2);
        } catch (error) {
            // Preserve exact stored bytes; a corrupt world must still be exportable for manual recovery.
            return JSON.stringify({ format: 'island-survival-recovery', version: 2, world, error: error.message,
                records: await Promise.all(SLOTS.map(slot => this._read('snapshots', `${id}:${slot}`))),
                legacy: this.legacy.readRawWorld?.(id) || null }, null, 2);
        }
    }

    importWorld(json) {
        return this._serialize(async () => {
            let payload;
            try {
                if (typeof json !== 'string' || json.length > IMPORT_LIMIT) throw new Error();
                payload = JSON.parse(json);
                const world = payload.world;
                if (payload.format !== 'island-survival-world' || payload.version !== 2 || !world
                    || typeof world.name !== 'string' || !world.name.trim() || world.name.length > 32
                    || typeof world.seed !== 'string' || !world.seed || world.seed.length > 64
                    || !['classic', 'campaign'].includes(world.mode)
                    || !(world.mode === 'classic' ? [1] : [2, 3]).includes(world.generatorVersion)
                    || !['relaxed', 'standard', 'harsh'].includes(world.difficulty)
                    || !['new', 'playing', 'completed', 'escaped', 'dead'].includes(world.status)
                    || world.completedRoutes != null && (!Array.isArray(world.completedRoutes) || world.completedRoutes.length > 2
                        || world.completedRoutes.some(route => !['raft', 'rescue'].includes(route)))
                    || ['playing', 'completed'].includes(world.status) && !payload.snapshot) throw new Error();
                for (const snapshot of [payload.snapshot, payload.checkpoint].filter(Boolean)) {
                    if (!validateSnapshot(snapshot) || snapshot.worldSeed !== world.seed
                        || snapshot.mode !== world.mode || snapshot.generatorVersion !== world.generatorVersion) throw new Error();
                }
            } catch { return { ok: false, error: 'Tệp thế giới không hợp lệ hoặc không được hỗ trợ.' }; }
            const worlds = await this.listWorlds();
            const originalName = payload.world.name.trim();
            let name = originalName;
            let suffix = 2;
            while (worlds.some(world => world.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
                const tail = ` (${suffix++})`;
                name = originalName.slice(0, 32 - tail.length) + tail;
            }
            const now = Date.now();
            const world = { ...payload.world, id: makeId(), name, createdAt: now, updatedAt: now, deleted: false, recoveryProblem: null,
                completedRoutes: [...new Set(payload.world.completedRoutes || [])] };
            await this._writeInitial(world, payload.snapshot, payload.checkpoint);
            return { ok: true, world };
        });
    }

    async close() {
        await this._queue;
        if (this._openPromise) (await this._openPromise).close();
        this._openPromise = null;
        this._ready = null;
    }
}
