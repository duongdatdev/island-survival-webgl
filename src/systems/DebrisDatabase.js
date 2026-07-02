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
    DRIFTWOOD:  'driftwood',
    PLASTIC:    'plastic',
    BOTTLE:     'bottle',
    CLOTH:      'cloth',
    PLANK:      'plank',
    FISHNET:    'fishnet',
};

export const DebrisDatabase = {
    [DebrisType.DRIFTWOOD]: {
        id: DebrisType.DRIFTWOOD,
        name: 'Gỗ Trôi',
        nameEn: 'Driftwood',
        icon: '🪵',
        color: [0.45, 0.30, 0.15],
        meshScale: [0.6, 0.15, 0.2],
        pickupRadius: 2.8,
        gives: { resourceId: 'wood', amount: 2 },
        lifetime: [25, 40],
        driftSpeed: [1.0, 2.0],
        spawnWeight: 4,
    },

    [DebrisType.PLASTIC]: {
        id: DebrisType.PLASTIC,
        name: 'Nhựa Trôi',
        nameEn: 'Plastic Debris',
        icon: '🧴',
        color: [0.85, 0.85, 0.90],
        meshScale: [0.25, 0.2, 0.25],
        pickupRadius: 2.5,
        gives: { resourceId: 'rope', amount: 1 },
        lifetime: [20, 35],
        driftSpeed: [1.2, 2.5],
        spawnWeight: 3,
    },

    [DebrisType.BOTTLE]: {
        id: DebrisType.BOTTLE,
        name: 'Chai Thủy Tinh',
        nameEn: 'Glass Bottle',
        icon: '🍾',
        color: [0.35, 0.65, 0.40],
        meshScale: [0.15, 0.35, 0.15],
        pickupRadius: 2.5,
        gives: { resourceId: 'stone', amount: 1 },
        lifetime: [20, 30],
        driftSpeed: [1.5, 2.8],
        spawnWeight: 2,
    },

    [DebrisType.CLOTH]: {
        id: DebrisType.CLOTH,
        name: 'Vải Rách',
        nameEn: 'Torn Cloth',
        icon: '🧵',
        color: [0.72, 0.58, 0.48],
        meshScale: [0.5, 0.08, 0.4],
        pickupRadius: 2.5,
        gives: { resourceId: 'rope', amount: 2 },
        lifetime: [22, 38],
        driftSpeed: [0.8, 1.8],
        spawnWeight: 2,
    },

    [DebrisType.PLANK]: {
        id: DebrisType.PLANK,
        name: 'Tấm Ván',
        nameEn: 'Wooden Plank',
        icon: '🪓',
        color: [0.60, 0.42, 0.22],
        meshScale: [0.7, 0.1, 0.3],
        pickupRadius: 2.8,
        gives: { resourceId: 'wood', amount: 3 },
        lifetime: [30, 50],
        driftSpeed: [0.6, 1.5],
        spawnWeight: 1,
    },

    [DebrisType.FISHNET]: {
        id: DebrisType.FISHNET,
        name: 'Lưới Cá',
        nameEn: 'Fish Net',
        icon: '🪤',
        color: [0.50, 0.55, 0.52],
        meshScale: [0.55, 0.06, 0.55],
        pickupRadius: 3.0,
        gives: { resourceId: 'rope', amount: 3 },
        lifetime: [28, 45],
        driftSpeed: [0.5, 1.2],
        spawnWeight: 1,
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
