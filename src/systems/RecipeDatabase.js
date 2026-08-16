
export const RecipeType = {
    STONE_AXE:        'stone_axe',
    RAFT_FRAME:       'raft_frame',
    PADDLE:           'paddle',
    BARREL_FLOATS:    'barrel_floats',
    CAMPFIRE:         'campfire',
    WATER_COLLECTOR:  'water_collector',
    FISHING_ROD:      'fishing_rod',
    RAFT_SAIL:        'raft_sail',
    RAFT_MOTOR:       'raft_motor',

    SPEAR:    'spear',
    BOW:      'bow',
    ARROW:    'arrow',
    BANDAGE:  'bandage'
};

export const RecipeDatabase = {
    [RecipeType.STONE_AXE]: {
        id: RecipeType.STONE_AXE,
        name: 'Rìu Đá',
        nameEn: 'Stone Axe',
        icon: '🪓',
        description: 'Công cụ cơ bản để chặt cây và khai thác tài nguyên hiệu quả hơn.',
        descriptionEn: 'Basic tool for chopping trees and gathering resources more efficiently.',
        category: 'tool',
        ingredients: {
            wood: 2,
            stone: 2
        }
    },

    [RecipeType.CAMPFIRE]: {
        id: RecipeType.CAMPFIRE,
        name: 'Lửa Trại',
        nameEn: 'Campfire',
        icon: '🔥',
        description: 'Đống lửa để nấu thức ăn sống thành bữa ăn bổ dưỡng.',
        descriptionEn: 'A fire pit to cook raw food into nourishing meals.',
        category: 'structure',
        ingredients: {
            stone: 5,
            wood: 3
        }
    },

    [RecipeType.WATER_COLLECTOR]: {
        id: RecipeType.WATER_COLLECTOR,
        name: 'Bẫy Nước Mưa',
        nameEn: 'Water Collector',
        icon: '💧',
        description: 'Thiết bị hứng nước mưa để cung cấp nước ngọt uống được.',
        descriptionEn: 'A device to capture rainwater and provide drinkable fresh water.',
        category: 'structure',
        ingredients: {
            wood: 4,
            barrel: 2
        }
    },

    [RecipeType.RAFT_FRAME]: {
        id: RecipeType.RAFT_FRAME,
        name: 'Khung Bè',
        nameEn: 'Raft Frame',
        icon: '🧱',
        description: 'Cấu trúc gỗ thô dùng để làm khung cho chiếc bè cứu sinh của bạn.',
        descriptionEn: 'Rough wooden structure used as the frame for your escape raft.',
        category: 'raft',
        ingredients: {
            wood: 10
        }
    },

    [RecipeType.PADDLE]: {
        id: RecipeType.PADDLE,
        name: 'Mái Chèo',
        nameEn: 'Paddle',
        icon: '🛶',
        description: 'Mái chèo bằng gỗ chắc chắn giúp đẩy bè vượt sóng khơi xa.',
        descriptionEn: 'Sturdy wooden paddle to propel your raft across the open ocean.',
        category: 'raft',
        ingredients: {
            wood: 5,
            rope: 2
        }
    },

    [RecipeType.BARREL_FLOATS]: {
        id: RecipeType.BARREL_FLOATS,
        name: 'Phao Thùng',
        nameEn: 'Barrel Floats',
        icon: '🛢️',
        description: 'Phao nổi chế tạo từ các thùng gỗ rỗng liên kết bằng dây thừng.',
        descriptionEn: 'Buoyancy floats made from empty wooden barrels bound with rope.',
        category: 'raft',
        ingredients: {
            barrel: 3,
            rope: 1
        }
    },

    [RecipeType.FISHING_ROD]: {
        id: RecipeType.FISHING_ROD,
        name: 'Cần Câu',
        nameEn: 'Fishing Rod',
        icon: '🎣',
        description: 'Dùng câu cá dọc bờ biển để kiếm thức ăn.',
        descriptionEn: 'Used to catch fish along the coastline for food.',
        category: 'tool',
        requiresBlueprint: 'fishing_rod_blueprint',
        ingredients: {
            wood: 3,
            rope: 2
        }
    },

    [RecipeType.RAFT_SAIL]: {
        id: RecipeType.RAFT_SAIL,
        name: 'Cánh Buồm',
        nameEn: 'Raft Sail',
        icon: '⛵',
        description: 'Lắp vào bè để tận dụng sức gió, giúp di chuyển nhanh hơn.',
        descriptionEn: 'Attach to the raft to harness wind power and travel faster.',
        category: 'raft',
        requiresBlueprint: 'sail_raft_blueprint',
        ingredients: {
            wood: 3,
            rope: 2,
            sail_cloth: 1
        }
    },

    [RecipeType.RAFT_MOTOR]: {
        id: RecipeType.RAFT_MOTOR,
        name: 'Động Cơ Bè',
        nameEn: 'Raft Motor',
        icon: '🚀',
        description: 'Động cơ xăng gắn đuôi bè giúp tăng tốc độ tối đa!',
        descriptionEn: 'Outboard engine to propel your raft at maximum speed!',
        category: 'raft',
        requiresBlueprint: 'motor_raft_blueprint',
        ingredients: {
            wood: 5,
            rope: 2,
            engine_parts: 2
        }
    },


    [RecipeType.SPEAR]: {
        id: RecipeType.SPEAR,
        name: 'Giáo',
        nameEn: 'Spear',
        icon: '🔱',
        description: 'Cây giáo sắc nhọn bằng gỗ và dây thừng, dùng để tấn công tầm gần.',
        descriptionEn: 'A sharp wooden spear bound with rope, used for melee attacks.',
        category: 'tool',
        ingredients: {
            wood: 3,
            rope: 1
        }
    },

    [RecipeType.BOW]: {
        id: RecipeType.BOW,
        name: 'Cung',
        nameEn: 'Bow',
        icon: '🏹',
        description: 'Cây cung bắn tên tầm xa, giúp săn sinh vật từ khoảng cách an toàn.',
        descriptionEn: 'A ranged bow for hunting creatures from a safe distance.',
        category: 'tool',
        ingredients: {
            wood: 3,
            rope: 2
        }
    },

    [RecipeType.ARROW]: {
        id: RecipeType.ARROW,
        name: 'Tên (x3)',
        nameEn: 'Arrows x3',
        icon: '➵',
        description: 'Mũi tên gỗ vót nhọn ghép đá. Chế tạo 3 cây một lần.',
        descriptionEn: 'Sharp wooden arrows tipped with stone. Craft 3 at a time.',
        category: 'tool',
        yield: 3,
        ingredients: {
            wood: 1,
            stone: 1
        }
    },

    [RecipeType.BANDAGE]: {
        id: RecipeType.BANDAGE,
        name: 'Băng Gạc',
        nameEn: 'Bandage',
        icon: '🩹',
        description: 'Băng gạc thảo dược giúp cầm máu và hồi phục vết thương.',
        descriptionEn: 'Herbal bandage to stop bleeding and heal wounds.',
        category: 'structure',
        ingredients: {
            herb: 3
        }
    }
};

export function getAllRecipes() {
    return Object.values(RecipeDatabase);
}

export function getRecipeDef(recipeId) {
    return RecipeDatabase[recipeId] || null;
}
