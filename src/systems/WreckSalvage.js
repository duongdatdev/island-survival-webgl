import { transactCraft } from './ItemContainer.js';

export const WRECK_PARTS = Object.freeze([
    { id: 'cargo', name: 'Thùng hàng mắc dây', seconds: 6, tools: ['stone_axe', 'iron_axe'], toolLabel: 'rìu đá hoặc rìu sắt',
        model: 'pirate_crate', offset: [3.2, 0, 0], scale: [0.75, 0.75, 0.75], rewards: [{ id: 'scrap', count: 8 }] },
    { id: 'wiring', name: 'Hộp dây dẫn', seconds: 5, tools: [], model: 'campaign_battery', offset: [-3.2, 0, -2.2], scale: [2, 2, 2],
        rewards: [{ id: 'scrap', count: 6 }, { id: 'copper_ingot', count: 4 }] },
    { id: 'machinery', name: 'Cụm máy kẹt trong vỏ tàu', seconds: 8, tools: ['stone_pickaxe', 'iron_pickaxe'], toolLabel: 'cuốc đá hoặc cuốc sắt',
        model: 'campaign_raft_motor', offset: [3.2, 0.524, 2.2], focus: [0, 0.2, -0.9], scale: [1, 1, 1], rewards: [{ id: 'scrap', count: 6 }] },
]);

export function wreckSalvageLayout(world) {
    const wreck = world.pois.find(p => p.id === 'offshore_wreck'), cos = Math.cos(wreck.yaw), sin = Math.sin(wreck.yaw);
    return WRECK_PARTS.map(def => {
        const [x, y, z] = def.offset;
        // The intact lower hull is solid. Loose equipment rests outside its sides, within the protected seabed area.
        const base = [wreck.position[0] + x * cos + z * sin, wreck.position[1] + y, wreck.position[2] - x * sin + z * cos];
        base[1] = world.terrainGenerator.getHeight(base[0], base[2]) + y;
        const [fx, fy, fz] = def.focus || [0, 0.5, 0];
        return { ...def, modelId: `wreck-part-${def.id}`, base,
            position: [base[0] + fx * cos + fz * sin, base[1] + fy, base[2] - fx * sin + fz * cos], yaw: wreck.yaw };
    });
}

/** Work advances only under live input; finished rewards remain at the site until they fit. */
export class WreckSalvage {
    constructor() { this.restore(null); }
    allClaimed() { return WRECK_PARTS.every(def => this.parts[def.id].claimed); }
    pause() { this.active = null; }
    start(id, inventory) {
        const def = WRECK_PARTS.find(def => def.id === id), state = this.parts[id];
        if (!def || state.claimed) return { ok: false, error: 'Điểm này đã được trục vớt.' };
        if (state.progress >= def.seconds) return this.claim(id, inventory);
        this.active = id; return { ok: true, message: `Giữ phím tương tác để tháo ${def.name.toLowerCase()}. Thả phím hoặc rời vị trí sẽ giữ phần việc đã làm.` };
    }
    claim(id, inventory) {
        const def = WRECK_PARTS.find(def => def.id === id), state = this.parts[id];
        if (!def || state.claimed || state.progress < def.seconds) return { ok: false, error: 'Chưa tháo xong thiết bị.' };
        this.pause();
        if (!transactCraft([inventory], {}, def.rewards)) return { ok: false, waiting: true, error: 'Túi đầy. Vật tư đã tháo vẫn ở đây; cất đồ rồi quay lại nhận.' };
        state.claimed = true; return { ok: true, claimed: id, message: `Đã thu vật tư từ ${def.name.toLowerCase()}.` };
    }
    update(seconds, inventory, { held = false, eligible = false } = {}) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Thời gian trục vớt không hợp lệ.');
        if (!this.active) return null;
        if (!held || !eligible) { this.pause(); return { paused: true }; }
        const id = this.active, def = WRECK_PARTS.find(def => def.id === id), state = this.parts[id];
        state.progress = Math.min(def.seconds, state.progress + Math.max(0, seconds));
        if (state.progress >= def.seconds) return this.claim(id, inventory);
        return { working: true, id };
    }
    activity() {
        const def = WRECK_PARTS.find(def => def.id === this.active);
        return def ? { name: def.name, progress: this.parts[def.id].progress / def.seconds } : null;
    }
    snapshot() { return { version: 1, parts: structuredClone(this.parts) }; }
    restore(saved, legacyClaimed = false) {
        if (saved == null) {
            this.parts = Object.fromEntries(WRECK_PARTS.map(def => [def.id, { progress: legacyClaimed ? def.seconds : 0, claimed: legacyClaimed }]));
        } else { assertWreckSalvageSnapshot(saved); this.parts = structuredClone(saved.parts); }
        this.active = null;
    }
}

export function assertWreckSalvageSnapshot(saved) {
    if (!saved || saved.version !== 1 || !saved.parts || Array.isArray(saved.parts)
        || Object.keys(saved.parts).length !== WRECK_PARTS.length || !WRECK_PARTS.every(def => {
            const state = saved.parts[def.id];
            return state && Number.isFinite(state.progress) && state.progress >= 0 && state.progress <= def.seconds
                && typeof state.claimed === 'boolean' && (!state.claimed || state.progress === def.seconds);
        })) throw new Error('Bản lưu trục vớt không hợp lệ.');
}
