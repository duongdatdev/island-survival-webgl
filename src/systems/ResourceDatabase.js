
import { AXE_SWING_DURATION } from './CombatConfig.js';

export const WOOD_LOG_MODEL_ID = 'survival:wood_log';
export const CHEST_MODEL_ID = 'environment:chest';

export const ResourceType = {
    WOOD:         'wood',
    STONE:        'stone',
    ROPE:         'rope',
    BARREL:       'barrel',
    COCONUT:      'coconut',
    RAW_FISH:     'raw_fish',
    COOKED_MEAL:  'cooked_meal',
    FRESH_WATER:  'fresh_water',
    STONE_AXE:        'stone_axe',
    CAMPFIRE:         'campfire',
    WATER_COLLECTOR:  'water_collector',
    RAFT_FRAME:       'raft_frame',
    BARREL_FLOATS:    'barrel_floats',
    PADDLE:           'paddle',
    FISHING_ROD:      'fishing_rod',
    SAIL_CLOTH:       'sail_cloth',
    ENGINE_PARTS:     'engine_parts',
    RAFT_SAIL:        'raft_sail',
    RAFT_MOTOR:       'raft_motor',
    TREASURE_CHEST:   'treasure_chest',

    RAW_CRAB_MEAT:      'raw_crab_meat',
    RAW_SEAGULL_MEAT:   'raw_seagull_meat',
    RAW_BOAR_MEAT:      'raw_boar_meat',
    HERB:               'herb',
    BANDAGE:            'bandage',
    SPEAR:              'spear',
    BOW:                'bow',
    ARROW:              'arrow'
};

export const ResourceDatabase = {
    [ResourceType.WOOD]: {
        id: ResourceType.WOOD,
        name: 'Gỗ',
        nameEn: 'Wood',
        icon: '🪵',
        color: [0.55, 0.35, 0.18],
        meshScale: [0.15, 0.35, 0.15],
        modelId: WOOD_LOG_MODEL_ID,
        modelScale: 1.0,
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 4,
        consumable: false
    },

    [ResourceType.STONE]: {
        id: ResourceType.STONE,
        name: 'Đá',
        nameEn: 'Stone',
        icon: '🪨',
        color: [0.55, 0.55, 0.52],
        meshScale: [0.28, 0.17, 0.25],
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 3,
        consumable: false
    },

    [ResourceType.ROPE]: {
        id: ResourceType.ROPE,
        name: 'Dây Thừng',
        nameEn: 'Rope',
        icon: '🪢',
        color: [0.82, 0.72, 0.45],
        meshScale: [0.22, 0.08, 0.22],
        pickupRadius: 2.5,
        stackSize: 99,
        spawnWeight: 2,
        consumable: false
    },

    [ResourceType.BARREL]: {
        id: ResourceType.BARREL,
        name: 'Thùng Gỗ',
        nameEn: 'Barrel',
        icon: '🛢️',
        color: [0.45, 0.28, 0.15],
        meshScale: [0.22, 0.3, 0.22],
        pickupRadius: 2.8,
        stackSize: 99,
        spawnWeight: 1,
        consumable: false
    },

    [ResourceType.COCONUT]: {
        id: ResourceType.COCONUT,
        name: 'Dừa',
        nameEn: 'Coconut',
        icon: '🥥',
        color: [0.35, 0.55, 0.2],
        meshScale: [0.17, 0.17, 0.17],
        pickupRadius: 2.5,
        stackSize: 20,
        spawnWeight: 2,
        consumable: false
    },

    [ResourceType.RAW_FISH]: {
        id: ResourceType.RAW_FISH,
        name: 'Cá Sống',
        nameEn: 'Raw Fish',
        icon: '🐟',
        color: [0.6, 0.65, 0.7],
        meshScale: [0.22, 0.08, 0.11],
        pickupRadius: 2.8,
        stackSize: 20,
        spawnWeight: 1,
        consumable: false
    },

    [ResourceType.COOKED_MEAL]: {
        id: ResourceType.COOKED_MEAL,
        name: 'Thức Ăn Chín',
        nameEn: 'Cooked Meal',
        icon: '🍖',
        color: [0.7, 0.35, 0.15],
        meshScale: [0.3, 0.2, 0.3],
        pickupRadius: 0,
        stackSize: 10,
        spawnWeight: 0,
        consumable: true,
        vitalEffect: { type: 'hunger', amount: 40 }
    },

    [ResourceType.FRESH_WATER]: {
        id: ResourceType.FRESH_WATER,
        name: 'Nước Ngọt',
        nameEn: 'Fresh Water',
        icon: '💧',
        color: [0.2, 0.5, 0.8],
        meshScale: [0.25, 0.3, 0.25],
        pickupRadius: 0,
        stackSize: 10,
        spawnWeight: 0,
        consumable: true,
        vitalEffect: { type: 'thirst', amount: 50 }
    },

    [ResourceType.STONE_AXE]: {
        id: ResourceType.STONE_AXE,
        name: 'Rìu Đá',
        nameEn: 'Stone Axe',
        icon: '🪓',
        color: [0.4, 0.4, 0.4],
        meshScale: [0.3, 0.3, 0.3],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false,
        weaponType: 'melee',
        weaponDamage: 10,
        weaponRange: 2.0,
        weaponCooldown: AXE_SWING_DURATION
    },

    [ResourceType.CAMPFIRE]: {
        id: ResourceType.CAMPFIRE,
        name: 'Lửa Trại',
        nameEn: 'Campfire',
        icon: '🔥',
        color: [0.8, 0.3, 0.1],
        meshScale: [0.4, 0.4, 0.4],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: true
    },

    [ResourceType.WATER_COLLECTOR]: {
        id: ResourceType.WATER_COLLECTOR,
        name: 'Bẫy Nước Mưa',
        nameEn: 'Water Collector',
        icon: '💧',
        color: [0.3, 0.5, 0.7],
        meshScale: [0.4, 0.5, 0.4],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: true
    },

    [ResourceType.RAFT_FRAME]: {
        id: ResourceType.RAFT_FRAME,
        name: 'Khung Bè',
        nameEn: 'Raft Frame',
        icon: '🧱',
        color: [0.6, 0.4, 0.2],
        meshScale: [0.5, 0.2, 0.5],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.BARREL_FLOATS]: {
        id: ResourceType.BARREL_FLOATS,
        name: 'Phao Thùng',
        nameEn: 'Barrel Floats',
        icon: '🛢️',
        color: [0.5, 0.3, 0.2],
        meshScale: [0.5, 0.4, 0.5],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.PADDLE]: {
        id: ResourceType.PADDLE,
        name: 'Mái Chèo',
        nameEn: 'Paddle',
        icon: '🛶',
        color: [0.6, 0.4, 0.2],
        meshScale: [0.2, 0.8, 0.2],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.FISHING_ROD]: {
        id: ResourceType.FISHING_ROD,
        name: 'Cần Câu',
        nameEn: 'Fishing Rod',
        icon: '🎣',
        color: [0.7, 0.5, 0.3],
        meshScale: [0.1, 0.9, 0.1],
        pickupRadius: 2.5,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.SAIL_CLOTH]: {
        id: ResourceType.SAIL_CLOTH,
        name: 'Vải Buồm',
        nameEn: 'Sail Cloth',
        icon: '⛵',
        color: [0.95, 0.95, 0.95],
        meshScale: [0.4, 0.4, 0.05],
        pickupRadius: 2.5,
        stackSize: 10,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.ENGINE_PARTS]: {
        id: ResourceType.ENGINE_PARTS,
        name: 'Phụ Tùng Động Cơ',
        nameEn: 'Engine Parts',
        icon: '⚙️',
        color: [0.5, 0.5, 0.5],
        meshScale: [0.3, 0.3, 0.3],
        pickupRadius: 2.5,
        stackSize: 10,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.RAFT_SAIL]: {
        id: ResourceType.RAFT_SAIL,
        name: 'Cánh Buồm',
        nameEn: 'Raft Sail',
        icon: '⛵',
        color: [0.9, 0.9, 0.9],
        meshScale: [0.4, 0.8, 0.4],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.RAFT_MOTOR]: {
        id: ResourceType.RAFT_MOTOR,
        name: 'Động Cơ Bè',
        nameEn: 'Raft Motor',
        icon: '🚀',
        color: [0.35, 0.35, 0.35],
        meshScale: [0.4, 0.4, 0.4],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.TREASURE_CHEST]: {
        id: ResourceType.TREASURE_CHEST,
        name: 'Rương Kho Báu',
        nameEn: 'Treasure Chest',
        icon: '📦',
        color: [0.8, 0.5, 0.2],
        meshScale: [0.75, 0.55, 0.55],
        modelId: CHEST_MODEL_ID,
        modelScale: 1.0,
        pickupRadius: 2.8,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false
    },


    [ResourceType.RAW_CRAB_MEAT]: {
        id: ResourceType.RAW_CRAB_MEAT,
        name: 'Thịt Cua Sống',
        nameEn: 'Raw Crab Meat',
        icon: '🦀',
        color: [0.85, 0.4, 0.2],
        meshScale: [0.18, 0.08, 0.14],
        pickupRadius: 2.5,
        stackSize: 20,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.RAW_SEAGULL_MEAT]: {
        id: ResourceType.RAW_SEAGULL_MEAT,
        name: 'Thịt Chim Sống',
        nameEn: 'Raw Seagull Meat',
        icon: '🍗',
        color: [0.75, 0.5, 0.3],
        meshScale: [0.16, 0.08, 0.12],
        pickupRadius: 2.5,
        stackSize: 20,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.RAW_BOAR_MEAT]: {
        id: ResourceType.RAW_BOAR_MEAT,
        name: 'Thịt Lợn Rừng Sống',
        nameEn: 'Raw Boar Meat',
        icon: '🥩',
        color: [0.6, 0.25, 0.15],
        meshScale: [0.2, 0.1, 0.15],
        pickupRadius: 2.5,
        stackSize: 20,
        spawnWeight: 0,
        consumable: false
    },

    [ResourceType.HERB]: {
        id: ResourceType.HERB,
        name: 'Thảo Dược',
        nameEn: 'Herb',
        icon: '🌿',
        color: [0.2, 0.7, 0.25],
        meshScale: [0.12, 0.06, 0.12],
        pickupRadius: 2.5,
        stackSize: 30,
        spawnWeight: 2,
        consumable: false
    },

    [ResourceType.BANDAGE]: {
        id: ResourceType.BANDAGE,
        name: 'Băng Gạc',
        nameEn: 'Bandage',
        icon: '🩹',
        color: [0.95, 0.95, 0.85],
        meshScale: [0.2, 0.1, 0.15],
        pickupRadius: 0,
        stackSize: 10,
        spawnWeight: 0,
        consumable: true,
        vitalEffect: { type: 'health', amount: 25 }
    },

    [ResourceType.SPEAR]: {
        id: ResourceType.SPEAR,
        name: 'Giáo',
        nameEn: 'Spear',
        icon: '🔱',
        color: [0.55, 0.35, 0.15],
        meshScale: [0.1, 0.9, 0.1],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false,
        weaponType: 'melee',
        weaponDamage: 25,
        weaponRange: 3.0,
        weaponCooldown: 0.8
    },

    [ResourceType.BOW]: {
        id: ResourceType.BOW,
        name: 'Cung',
        nameEn: 'Bow',
        icon: '🏹',
        color: [0.5, 0.3, 0.1],
        meshScale: [0.3, 0.6, 0.05],
        pickupRadius: 0,
        stackSize: 1,
        spawnWeight: 0,
        consumable: false,
        weaponType: 'ranged',
        weaponDamage: 15,
        weaponRange: 20.0,
        weaponCooldown: 1.2
    },

    [ResourceType.ARROW]: {
        id: ResourceType.ARROW,
        name: 'Tên',
        nameEn: 'Arrow',
        icon: '➵',
        color: [0.6, 0.5, 0.25],
        meshScale: [0.05, 0.4, 0.05],
        pickupRadius: 0,
        stackSize: 30,
        spawnWeight: 0,
        consumable: false
    }
};

export function getAllResources() {
    return Object.values(ResourceDatabase);
}

export function getResourceDef(resourceId) {
    return ResourceDatabase[resourceId] || null;
}

export function getWeightedRandomType() {
    const resources = getAllResources().filter(r => r.spawnWeight > 0);
    const totalWeight = resources.reduce((sum, r) => sum + r.spawnWeight, 0);
    let roll = Math.random() * totalWeight;

    for (const res of resources) {
        roll -= res.spawnWeight;
        if (roll <= 0) return res.id;
    }

    return resources[resources.length - 1].id;
}
