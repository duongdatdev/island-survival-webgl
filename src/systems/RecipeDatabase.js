/**
 * Recipe Database - Registry of all craftable items in the game.
 */

export const RecipeType = {
    STONE_AXE:     'stone_axe',
    RAFT_FRAME:    'raft_frame',
    PADDLE:        'paddle',
    BARREL_FLOATS: 'barrel_floats'
};

export const RecipeDatabase = {
    [RecipeType.STONE_AXE]: {
        id: RecipeType.STONE_AXE,
        name: 'Rìu Đá',
        nameEn: 'Stone Axe',
        icon: '🪓',
        description: 'Công cụ cơ bản để chặt cây và khai thác tài nguyên hiệu quả hơn.',
        descriptionEn: 'Basic tool for chopping trees and gathering resources more efficiently.',
        ingredients: {
            wood: 2,
            stone: 2
        }
    },

    [RecipeType.RAFT_FRAME]: {
        id: RecipeType.RAFT_FRAME,
        name: 'Khung Bè',
        nameEn: 'Raft Frame',
        icon: '🧱',
        description: 'Cấu trúc gỗ thô dùng để làm khung cho chiếc bè cứu sinh của bạn.',
        descriptionEn: 'Rough wooden structure used as the frame for your escape raft.',
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
        ingredients: {
            barrel: 3,
            rope: 1
        }
    }
};

/**
 * Get all recipe definitions as an array
 * @returns {object[]}
 */
export function getAllRecipes() {
    return Object.values(RecipeDatabase);
}

/**
 * Get a recipe definition by its ID
 * @param {string} recipeId
 * @returns {object|null}
 */
export function getRecipeDef(recipeId) {
    return RecipeDatabase[recipeId] || null;
}
