import { getRecipeDef } from './RecipeDatabase.js';

export class CraftingSystem {
    static canCraft(recipeId, inventory) {
        const recipe = getRecipeDef(recipeId);
        if (!recipe) return false;

        for (const [ingredientId, requiredCount] of Object.entries(recipe.ingredients)) {
            if (inventory.getCount(ingredientId) < requiredCount) {
                return false;
            }
        }
        return true;
    }

    static craft(recipeId, inventory) {
        if (!this.canCraft(recipeId, inventory)) {
            return false;
        }

        const recipe = getRecipeDef(recipeId);
        if (!recipe) return false;

        for (const [ingredientId, requiredCount] of Object.entries(recipe.ingredients)) {
            inventory.removeItem(ingredientId, requiredCount);
        }

        inventory.addItem(recipeId, recipe.yield || 1);
        return true;
    }
}
