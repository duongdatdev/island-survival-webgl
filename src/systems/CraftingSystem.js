import { getRecipeDef } from './RecipeDatabase.js';

export class CraftingSystem {
    /**
     * Check if the player has enough ingredients for a given recipe
     * @param {string} recipeId 
     * @param {Inventory} inventory 
     * @returns {boolean}
     */
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

    /**
     * Attempts to craft the item. Deducts resources and adds the item to the inventory.
     * @param {string} recipeId 
     * @param {Inventory} inventory 
     * @returns {boolean} True if successfully crafted
     */
    static craft(recipeId, inventory) {
        if (!this.canCraft(recipeId, inventory)) {
            return false;
        }

        const recipe = getRecipeDef(recipeId);
        if (!recipe) return false;

        // Deduct ingredients
        for (const [ingredientId, requiredCount] of Object.entries(recipe.ingredients)) {
            inventory.removeItem(ingredientId, requiredCount);
        }

        // Add crafted item to inventory (recipes may produce a batch, e.g. arrows)
        inventory.addItem(recipeId, recipe.yield || 1);
        return true;
    }
}
