/**
 * Debris Database - Central registry of drifting debris types that spawn in the ocean.
 * 
 * Separate from ResourceDatabase (island resources ≠ ocean debris).
 * To add a new debris type: simply add a new entry to DebrisDatabase.
 * 
 * Each entry:
 *   id           - Unique string identifier
 *   name         - Vietnamese display name
 *   nameEn       - English display name
 *   icon         - Emoji icon for UI
 *   color        - [r, g, b] mesh color (0-1)
 *   meshScale    - [x, y, z] cube scale dimensions
 *   pickupRadius - Distance (units) player must be within to collect
 *   gives        - { resourceId, amount } — maps to ResourceDatabase item for Inventory
 *   lifetime     - [min, max] seconds before auto-despawn
 *   driftSpeed   - [min, max] units/sec toward island center
 *   spawnWeight  - Higher = more likely to spawn
 */

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

/**
 * Get all debris definitions as an array
 * @returns {object[]}
 */
export function getAllDebris() {
    return Object.values(DebrisDatabase);
}

/**
 * Get a debris definition by its ID
 * @param {string} debrisId
 * @returns {object|null}
 */
export function getDebrisDef(debrisId) {
    return DebrisDatabase[debrisId] || null;
}

/**
 * Get a weighted random debris type for spawning
 * @returns {string} Debris type ID
 */
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

/**
 * Generate a random value within a [min, max] range
 * @param {number[]} range - [min, max]
 * @returns {number}
 */
export function randomInRange(range) {
    return range[0] + Math.random() * (range[1] - range[0]);
}
