/**
 * Resource Database - Central registry of all collectible resource types
 * Each resource defines its visual properties, mesh shape, and gameplay parameters.
 */

export const ResourceType = {
    WOOD:   'wood',
    STONE:  'stone',
    ROPE:   'rope',
    BARREL: 'barrel'
};

/**
 * Resource definitions keyed by ResourceType ID
 */
export const ResourceDatabase = {
    [ResourceType.WOOD]: {
        id: ResourceType.WOOD,
        name: 'Gỗ',
        nameEn: 'Wood',
        icon: '🪵',
        color: [0.55, 0.35, 0.18],       // Warm brown (log)
        meshScale: [0.25, 0.6, 0.25],    // Tall narrow log shape
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 4                     // Higher = more common
    },

    [ResourceType.STONE]: {
        id: ResourceType.STONE,
        name: 'Đá',
        nameEn: 'Stone',
        icon: '🪨',
        color: [0.55, 0.55, 0.52],       // Gray stone
        meshScale: [0.5, 0.3, 0.45],     // Low flat rock shape
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 3
    },

    [ResourceType.ROPE]: {
        id: ResourceType.ROPE,
        name: 'Dây Thừng',
        nameEn: 'Rope',
        icon: '🪢',
        color: [0.82, 0.72, 0.45],       // Sandy rope color
        meshScale: [0.4, 0.15, 0.4],     // Flat coiled disc shape
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 2
    },

    [ResourceType.BARREL]: {
        id: ResourceType.BARREL,
        name: 'Thùng Gỗ',
        nameEn: 'Barrel',
        icon: '🛢️',
        color: [0.45, 0.28, 0.15],       // Dark wood barrel
        meshScale: [0.4, 0.55, 0.4],     // Cylindrical barrel shape
        pickupRadius: 2.8,
        stackSize: 99,
        spawnWeight: 1                     // Rarer
    }
};

/**
 * Get all resource definitions as an array
 */
export function getAllResources() {
    return Object.values(ResourceDatabase);
}

/**
 * Get a resource definition by its ID
 * @param {string} resourceId
 * @returns {object|null}
 */
export function getResourceDef(resourceId) {
    return ResourceDatabase[resourceId] || null;
}

/**
 * Get a weighted random resource type for spawning
 * @returns {string} Resource ID
 */
export function getWeightedRandomType() {
    const resources = getAllResources();
    const totalWeight = resources.reduce((sum, r) => sum + r.spawnWeight, 0);
    let roll = Math.random() * totalWeight;

    for (const res of resources) {
        roll -= res.spawnWeight;
        if (roll <= 0) return res.id;
    }

    return resources[resources.length - 1].id;
}
