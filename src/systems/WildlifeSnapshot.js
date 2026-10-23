import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

export const WILDLIFE_COUNTS = Object.freeze({ crab: 12, seagull: 8, boar: 10, shark: 6, deer: 10, goat: 8, monitor: 8 });
export const MAX_WILDLIFE_POPULATION = Object.values(WILDLIFE_COUNTS).reduce((sum, count) => sum + count, 0);

// Shared by browser gameplay and the dedicated server; no renderer or entity imports.
export function assertWildlifeSnapshot(saved) {
    const validId = id => typeof id === 'string' && /^(crab|seagull|boar|shark|deer|goat|monitor)-\d+$/.test(id)
        && id === id.split('-')[0] + '-' + Number(id.split('-')[1])
        && +id.split('-')[1] < WILDLIFE_COUNTS[id.split('-')[0]];
    if (!saved || !Array.isArray(saved.killed) || saved.killed.length > MAX_WILDLIFE_POPULATION
        || !Array.isArray(saved.animals) || saved.animals.length > MAX_WILDLIFE_POPULATION
        || saved.killed.some(id => !validId(id)) || new Set(saved.killed).size !== saved.killed.length) throw new Error('Bản lưu động vật không hợp lệ.');
    const ids = new Set(saved.killed);
    for (const a of saved.animals) {
        if (!validId(a?.id) || ids.has(a.id) || !Array.isArray(a.position) || a.position.length !== 3
            || !a.position.every(v => Number.isFinite(v) && Math.abs(v) < 400)
            || !Number.isFinite(a.health) || a.health <= 0 || a.health > CREATURE_BALANCE[a.id.split('-')[0]].maxHealth
            || !Number.isFinite(a.yaw)
            || a.orbit != null && (!a.id.startsWith('seagull-') || !Array.isArray(a.orbit) || a.orbit.length !== 5
                || !a.orbit.every(Number.isFinite) || a.orbit[2] < 3 || a.orbit[2] > 15)) throw new Error('Bản lưu động vật không hợp lệ.');
        ids.add(a.id);
    }
}
