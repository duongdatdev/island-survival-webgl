/**
 * Inventory System - Tracks quantities of collected resources
 * Supports event-driven UI updates via onChange callback.
 * 
 * v0.2: Added slot limits, isFull check, getSlots for Grid UI, and useItem for consumables.
 */

export class Inventory {
    constructor(maxSlots = 20) {
        /** @type {Map<string, number>} Resource ID → quantity */
        this.items = new Map();

        /** @type {number} Maximum number of different item types that can be stored */
        this.maxSlots = maxSlots;

        /** @type {Function|null} Callback fired whenever inventory changes: (resourceId, newCount, delta) */
        this.onChange = null;
    }

    /**
     * Add a quantity of a resource to the inventory
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean} True if added successfully
     */
    addItem(resourceId, amount = 1) {
        const current = this.items.get(resourceId) || 0;

        // If this is a new item type, check slot limit
        if (current === 0 && this.items.size >= this.maxSlots) {
            // Inventory full (no more slots)
            return false;
        }

        const newCount = current + amount;
        this.items.set(resourceId, newCount);

        if (this.onChange) {
            this.onChange(resourceId, newCount, amount);
        }
        return true;
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
        if (newCount <= 0) {
            this.items.delete(resourceId);
        } else {
            this.items.set(resourceId, newCount);
        }

        if (this.onChange) {
            this.onChange(resourceId, newCount, -amount);
        }

        return true;
    }

    /**
     * Use (consume) an item from the inventory.
     * Alias for removeItem — used semantically for consumables.
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean}
     */
    useItem(resourceId, amount = 1) {
        return this.removeItem(resourceId, amount);
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
     * Check if the inventory is full (no new item types can be added)
     * @returns {boolean}
     */
    isFull() {
        return this.items.size >= this.maxSlots;
    }

    /**
     * Get the number of occupied slots
     * @returns {number}
     */
    getUsedSlots() {
        return this.items.size;
    }

    /**
     * Get all items as an array of slot data for Grid Inventory UI.
     * Each slot: { id, count }
     * @returns {Array<{id: string, count: number}>}
     */
    getSlots() {
        const slots = [];
        for (const [key, value] of this.items) {
            if (value > 0) {
                slots.push({ id: key, count: value });
            }
        }
        return slots;
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
