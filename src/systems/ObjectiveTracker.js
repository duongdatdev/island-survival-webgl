import { getRecipeDef } from './RecipeDatabase.js';
import { getResourceDef } from './ResourceDatabase.js';

const REQUIRED_RAFT_STEPS = Object.freeze([
    Object.freeze({ flag: 'framePlaced', recipeId: 'raft_frame' }),
    Object.freeze({ flag: 'floatsPlaced', recipeId: 'barrel_floats' }),
    Object.freeze({ flag: 'paddlePlaced', recipeId: 'paddle' }),
]);

const COMPLETION_CHECKS = Object.freeze({
    raft_frame: scene => scene.raftAssembly?.framePlaced,
    barrel_floats: scene => scene.raftAssembly?.floatsPlaced,
    paddle: scene => scene.raftAssembly?.paddlePlaced,
    raft_sail: scene => scene.raftAssembly?.sailPlaced,
    raft_motor: scene => scene.raftAssembly?.motorPlaced,
    campfire: scene => scene.campfire?.isBuilt,
    water_collector: scene => scene.waterCollector?.isBuilt,
});

export function isRecipeTrackable(scene, recipeId) {
    const recipe = getRecipeDef(recipeId);
    if (!recipe) return false;
    if (recipe.requiresBlueprint && !scene.unlockedBlueprints?.has(recipe.requiresBlueprint)) {
        return false;
    }
    const completionCheck = COMPLETION_CHECKS[recipeId];
    return !completionCheck || !completionCheck(scene);
}

export function buildRecipeObjective(recipeId, inventory, source = 'recipe') {
    const recipe = getRecipeDef(recipeId);
    if (!recipe) return null;

    return {
        source,
        recipeId,
        icon: recipe.icon,
        title: recipe.name,
        description: source === 'automatic'
            ? 'Thu thập đủ nguyên liệu rồi chế tạo trong Kho đồ.'
            : recipe.description,
        ingredients: Object.entries(recipe.ingredients).map(([resourceId, required]) => {
            const resource = getResourceDef(resourceId);
            const current = inventory.getCount(resourceId);
            return {
                resourceId,
                icon: resource?.icon || '',
                name: resource?.name || resourceId,
                current,
                required,
                complete: current >= required,
            };
        }),
    };
}

export function buildAutomaticObjective(scene) {
    for (const step of REQUIRED_RAFT_STEPS) {
        if (scene.raftAssembly[step.flag]) continue;

        const recipe = getRecipeDef(step.recipeId);
        if (scene.inventory.hasItem(step.recipeId, 1)) {
            return {
                source: 'automatic',
                recipeId: step.recipeId,
                icon: recipe?.icon || '🛶',
                title: `Lắp ${recipe?.name || step.recipeId}`,
                description: 'Mang bộ phận đến bãi lắp bè và nhấn E để lắp.',
                ingredients: [],
            };
        }

        return buildRecipeObjective(step.recipeId, scene.inventory, 'automatic');
    }

    return {
        source: 'automatic',
        recipeId: null,
        icon: '🏝️',
        title: 'Rời khỏi đảo',
        description: 'Đến chiếc bè hoàn chỉnh ở bờ biển và chọn Rời Đảo.',
        ingredients: [],
    };
}

export class ObjectiveTracker {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.document = options.document || globalThis.document;
        this.element = null;
        this.pinnedRecipeId = null;
        this._lastSignature = '';
    }

    init() {
        this.element = this.document?.getElementById('objective-tracker') || null;
        this.update(true);
    }

    getCurrentObjective() {
        if (this.pinnedRecipeId && !isRecipeTrackable(this.scene, this.pinnedRecipeId)) {
            this.pinnedRecipeId = null;
        }
        if (this.pinnedRecipeId) {
            return buildRecipeObjective(this.pinnedRecipeId, this.scene.inventory, 'pinned');
        }
        return buildAutomaticObjective(this.scene);
    }

    getPinnedRecipeId() {
        return this.pinnedRecipeId;
    }

    setPinnedRecipe(recipeId) {
        const nextRecipeId = recipeId || null;
        if (nextRecipeId && !isRecipeTrackable(this.scene, nextRecipeId)) {
            this.pinnedRecipeId = null;
            this.update(true);
            return false;
        }
        this.pinnedRecipeId = nextRecipeId;
        this.update(true);
        return true;
    }

    togglePinnedRecipe(recipeId) {
        return this.setPinnedRecipe(this.pinnedRecipeId === recipeId ? null : recipeId);
    }

    update(force = false) {
        if (!this.element) return;
        if (this.scene._isGameOver || this.scene.isEscaping) {
            this.element.classList.add('hidden');
            return;
        }

        const objective = this.getCurrentObjective();
        const signature = JSON.stringify(objective);
        if (!force && signature === this._lastSignature) return;
        this._lastSignature = signature;

        const ingredients = objective.ingredients.map(item => `
            <span class="objective-ingredient${item.complete ? ' complete' : ''}">
                ${item.icon} ${item.name} ${item.current}/${item.required}
            </span>
        `).join('');

        const kicker = objective.source === 'pinned' ? 'CÔNG THỨC GHIM' : 'MỤC TIÊU';
        this.element.innerHTML = `
            <div class="objective-kicker">${kicker}</div>
            <div class="objective-title"><span>${objective.icon}</span>${objective.title}</div>
            <div class="objective-description">${objective.description}</div>
            ${ingredients ? `<div class="objective-ingredients">${ingredients}</div>` : ''}
        `;
        this.element.classList.remove('hidden');
    }

    dispose() {
        if (this.element) {
            this.element.classList.add('hidden');
            this.element.replaceChildren();
        }
        this.element = null;
        this._lastSignature = '';
    }
}
