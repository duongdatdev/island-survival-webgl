/**
 * Inventory System - Tracks quantities of collected resources
 * Supports event-driven UI updates via onChange callback.
 */

export class Inventory {
    constructor() {
        /** @type {Map<string, number>} Resource ID → quantity */
        this.items = new Map();

        /** @type {Function|null} Callback fired whenever inventory changes: (resourceId, newCount, delta) */
        this.onChange = null;
    }

    /**
     * Add a quantity of a resource to the inventory
     * @param {string} resourceId
     * @param {number} amount
     */
    addItem(resourceId, amount = 1) {
        const current = this.items.get(resourceId) || 0;
        const newCount = current + amount;
        this.items.set(resourceId, newCount);

        if (this.onChange) {
            this.onChange(resourceId, newCount, amount);
        }
    }

    /**
     * Remove a quantity of a resource from the inventory
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean} True if removal was successful
     */
    removeItem(resourceId, amount = 1) {
        const current = this.items.get(resourceId) || 0;
        if (current < amount) return false;

        const newCount = current - amount;
        this.items.set(resourceId, newCount);

        if (this.onChange) {
            this.onChange(resourceId, newCount, -amount);
        }

        return true;
    }

    /**
     * Get the current count of a resource
     * @param {string} resourceId
     * @returns {number}
     */
    getCount(resourceId) {
        return this.items.get(resourceId) || 0;
    }

    /**
     * Check if the inventory has at least `amount` of a resource
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean}
     */
    hasItem(resourceId, amount = 1) {
        return this.getCount(resourceId) >= amount;
    }

    /**
     * Get all items as a plain object { resourceId: count }
     * @returns {Object}
     */
    getAll() {
        const result = {};
        for (const [key, value] of this.items) {
            result[key] = value;
        }
        return result;
    }

    /**
     * Clear all items from the inventory
     */
    clear() {
        this.items.clear();
        this.onChange = null;
    }
}
