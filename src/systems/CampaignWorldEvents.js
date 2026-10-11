import { PRNG } from '../gameplay/world/PRNG.js';
import { transactCraft } from './ItemContainer.js';

export const STORM_CARGO = Object.freeze({ wood: 5, scrap: 3, rope: 2, barrel: 1 });
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function assertWorldEventsSnapshot(saved = {}) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Bản lưu sự kiện đảo không hợp lệ.');
    const number = (v, low = 0) => Number.isFinite(v) && v >= low;
    const position = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 400);
    const ids = new Set();
    if (saved.time != null && !number(saved.time) || saved.nextShoalAt != null && !number(saved.nextShoalAt)
        || saved.nextId != null && (!Number.isSafeInteger(saved.nextId) || saved.nextId < 1)
        || saved.randomState != null && !Number.isSafeInteger(saved.randomState)
        || saved.cutProgress != null && (!Number.isInteger(saved.cutProgress) || saved.cutProgress < 0 || saved.cutProgress > 3)
        || ['wasStorm', 'shortcutOpen'].some(key => saved[key] != null && typeof saved[key] !== 'boolean')
        || saved.cargo != null && (!Array.isArray(saved.cargo) || saved.cargo.length > 3)
        || saved.shoals != null && (!Array.isArray(saved.shoals) || saved.shoals.length > 2)) throw new Error('Bản lưu sự kiện đảo không hợp lệ.');
    for (const [type, records] of [['storm-cargo', saved.cargo || []], ['fish-shoal', saved.shoals || []]]) {
        for (const record of records) {
            const match = typeof record?.id === 'string' && record.id.match(new RegExp(`^${type}-(\\d+)$`));
            if (!match || ids.has(record.id) || +match[1] >= (saved.nextId || 1) || !position(record.position)
                || type === 'fish-shoal' && (record.radius !== 12 || !Number.isInteger(record.remaining)
                    || record.remaining < 0 || record.remaining > 6 || !number(record.expiresAt))) throw new Error('Bản lưu sự kiện đảo không hợp lệ.');
            ids.add(record.id);
        }
    }
}

/** Optional world opportunities use active simulation time and never mutate bases or quest objects. */
export class CampaignWorldEvents {
    constructor(world, registry, events) {
        this.world = world; this.registry = registry; this.events = events;
        this.random = new PRNG('island-events:' + world.seed);
        this.time = 0; this.nextShoalAt = 600; this.nextId = 1; this.wasStorm = false;
        this.cargo = []; this.shoals = []; this.shortcutOpen = false; this.cutProgress = 0;
        const camp = world.pois.find(p => p.id === 'abandoned_camp').position;
        const station = world.pois.find(p => p.id === 'weather_station').position;
        const position = camp.map((v, i) => v + (station[i] - v) * 0.45);
        position[1] = world.terrainGenerator.getHeight(position[0], position[2]);
        this.shortcut = { id: 'forest_pass', position, yaw: Math.atan2(station[0] - camp[0], station[2] - camp[2]) + Math.PI / 2 };
    }
    update(seconds, weather = {}) {
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        this.time += seconds;
        const storm = weather.isStorm === true || (weather.stormFactor || 0) > 0.25;
        if (this.wasStorm && !storm) this.spawnCargo();
        this.wasStorm = storm;
        this.shoals = this.shoals.filter(shoal => shoal.expiresAt > this.time && shoal.remaining > 0);
        if (this.time >= this.nextShoalAt) {
            this.spawnShoal();
            this.nextShoalAt = this.time + this.random.nextRange(600, 900);
        }
    }
    _coastPosition(ocean) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const angle = this.random.nextRange(-Math.PI, Math.PI);
            const radius = this.world.terrainGenerator.island.radius + (ocean ? this.random.nextRange(10, 20) : -6);
            const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
            const ground = this.world.terrainGenerator.getHeight(x, z);
            const position = [x, ocean ? 0.15 : ground, z];
            if (ocean ? ground > -0.5 : ground < 0.15) continue;
            if (!ocean && (this.world.pois.some(p => planarDistance(p.position, position) < p.radius + 6)
                || this.registry.nearby(position, 6).length)) continue;
            return position;
        }
        return null;
    }
    spawnCargo() {
        if (this.cargo.length >= 3) return null;
        const position = this._coastPosition(false);
        if (!position) return null;
        const cargo = { id: `storm-cargo-${this.nextId++}`, position };
        this.cargo.push(cargo); this.events?.emit('worldOpportunity', { type: 'cargo', id: cargo.id, position });
        return cargo;
    }
    claimCargo(id, inventory) {
        const index = this.cargo.findIndex(item => item.id === id);
        if (index < 0) return { ok: false, error: 'Kiện hàng này đã được lấy.' };
        if (!transactCraft([inventory], {}, Object.entries(STORM_CARGO).map(([id, count]) => ({ id, count })))) return { ok: false, error: 'Túi chưa đủ chỗ nhận vật tư; kiện hàng vẫn được giữ.' };
        this.cargo.splice(index, 1);
        this.events?.emit('stormCargoClaimed', { id, count: 1 });
        return { ok: true };
    }
    spawnShoal() {
        if (this.shoals.length >= 2) return null;
        const position = this._coastPosition(true);
        if (!position) return null;
        const shoal = { id: `fish-shoal-${this.nextId++}`, position, radius: 12, remaining: 6, expiresAt: this.time + 480 };
        this.shoals.push(shoal); this.events?.emit('worldOpportunity', { type: 'shoal', id: shoal.id, position });
        return shoal;
    }
    shoalAt(position) { return this.shoals.find(shoal => shoal.expiresAt > this.time && shoal.remaining > 0 && planarDistance(position, shoal.position) < shoal.radius); }
    caughtAtShoal(id) {
        const shoal = this.shoals.find(item => item.id === id);
        if (!shoal) return false;
        shoal.remaining--; return true;
    }
    cutShortcut(inventory) {
        if (this.shortcutOpen) return { ok: false, error: 'Lối đi đã được mở.' };
        if (!inventory.hasItem('stone_axe') && !inventory.hasItem('iron_axe')) return { ok: false, error: 'Cần mang rìu đá hoặc rìu sắt để dọn cây đổ.' };
        this.cutProgress = Math.min(3, this.cutProgress + (inventory.hasItem('iron_axe') ? 3 : 1));
        this.events?.emit('shortcutCut', { id: 'forest_pass', progress: this.cutProgress });
        if (this.cutProgress < 3) return { ok: true, message: `Đang dọn cây đổ: ${this.cutProgress}/3.` };
        if (!inventory.addItem('wood', 6)) return { ok: false, error: 'Cần chỗ cho 6 gỗ trước khi dọn cây đổ.' };
        this.shortcutOpen = true; this.events?.emit('shortcutOpened', { id: 'forest_pass' });
        return { ok: true, message: 'Đã mở đường tắt giữa trại và trạm khí tượng · nhận 6 gỗ.' };
    }
    snapshot() {
        return { time: this.time, nextShoalAt: this.nextShoalAt, nextId: this.nextId, wasStorm: this.wasStorm,
            cargo: structuredClone(this.cargo), shoals: structuredClone(this.shoals), shortcutOpen: this.shortcutOpen,
            cutProgress: this.cutProgress, randomState: this.random.seedState };
    }
    restore(saved = {}) {
        assertWorldEventsSnapshot(saved);
        this.time = saved.time || 0; this.nextShoalAt = saved.nextShoalAt ?? this.time + 600;
        this.nextId = saved.nextId || 1; this.wasStorm = !!saved.wasStorm;
        this.cargo = structuredClone(saved.cargo || []); this.shoals = structuredClone(saved.shoals || []);
        this.shortcutOpen = !!saved.shortcutOpen; this.cutProgress = saved.cutProgress || 0;
        if (Number.isFinite(saved.randomState)) this.random.seedState = saved.randomState;
    }
}
