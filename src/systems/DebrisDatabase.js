
import { WOOD_LOG_MODEL_ID } from './ResourceDatabase.js';

export const DebrisType = {
    WOOD:     'wood',
    STONE:    'stone',
    ROPE:     'rope',
    BARREL:   'barrel',
    RAW_FISH: 'raw_fish',
};

export const DebrisDatabase = {
    [DebrisType.WOOD]: {
        id: DebrisType.WOOD,
        name: 'Gỗ Trôi',
        nameEn: 'Driftwood',
        icon: '🪵',
        color: [0.55, 0.35, 0.18],
        meshScale: [0.33, 0.08, 0.11],
        modelId: WOOD_LOG_MODEL_ID,
        modelScale: 1.0,
        pickupRadius: 2.8,
        gives: { resourceId: 'wood', amount: 2 },
        lifetime: [50, 80],
        driftSpeed: [1.0, 2.0],
        spawnWeight: 5,
    },

    [DebrisType.STONE]: {
        id: DebrisType.STONE,
        name: 'Đá Trôi',
        nameEn: 'Drifting Stone',
        icon: '🪨',
        color: [0.55, 0.55, 0.52],
        meshScale: [0.19, 0.11, 0.165],
        pickupRadius: 2.5,
        gives: { resourceId: 'stone', amount: 2 },
        lifetime: [50, 80],
        driftSpeed: [1.2, 2.4],
        spawnWeight: 4,
    },

    [DebrisType.ROPE]: {
        id: DebrisType.ROPE,
        name: 'Dây Thừng Trôi',
        nameEn: 'Drifting Rope',
        icon: '🪢',
        color: [0.82, 0.72, 0.45],
        meshScale: [0.22, 0.05, 0.22],
        pickupRadius: 2.5,
        gives: { resourceId: 'rope', amount: 2 },
        lifetime: [50, 80],
        driftSpeed: [0.8, 1.8],
        spawnWeight: 4,
    },

    [DebrisType.BARREL]: {
        id: DebrisType.BARREL,
        name: 'Thùng Gỗ Trôi',
        nameEn: 'Drifting Barrel',
        icon: '🛢️',
        color: [0.45, 0.28, 0.15],
        meshScale: [0.22, 0.30, 0.22],
        pickupRadius: 2.8,
        gives: { resourceId: 'barrel', amount: 1 },
        lifetime: [60, 90],
        driftSpeed: [0.6, 1.4],
        spawnWeight: 2,
    },

    [DebrisType.RAW_FISH]: {
        id: DebrisType.RAW_FISH,
        name: 'Cá Sống Trôi',
        nameEn: 'Drifting Raw Fish',
        icon: '🐟',
        color: [0.6, 0.65, 0.7],
        meshScale: [0.22, 0.066, 0.099],
        pickupRadius: 2.5,
        gives: { resourceId: 'raw_fish', amount: 1 },
        lifetime: [40, 70],
        driftSpeed: [1.5, 2.8],
        spawnWeight: 2,
    },
};

export function getAllDebris() {
    return Object.values(DebrisDatabase);
}

export function getDebrisDef(debrisId) {
    return DebrisDatabase[debrisId] || null;
}

export function getWeightedRandomDebrisType() {
    const allDebris = getAllDebris();
    const totalWeight = allDebris.reduce((sum, d) => sum + d.spawnWeight, 0);
    let roll = Math.random() * totalWeight;

    for (const debris of allDebris) {
        roll -= debris.spawnWeight;
        if (roll <= 0) return debris.id;
    }

    return allDebris[allDebris.length - 1].id;
}

export function randomInRange(range) {
    return range[0] + Math.random() * (range[1] - range[0]);
}
