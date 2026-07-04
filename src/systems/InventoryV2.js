import { getResourceDef } from './ResourceDatabase.js';

/**
 * Inventory System - Tracks items in a grid/slot system.
 * Total 28 slots:
 * - 0 to 19: Main Inventory Grid (20 slots)
 * - 20 to 27: Hotbar (8 slots)
 * 
 * Supports event-driven UI updates via onChange callback.
 */
export class Inventory {
    constructor(maxSlots = 20) {
        /** @type {Array<{id: string, count: number}|null>} */
        this.slots = new Array(28).fill(null);

        /** @type {number} Number of slots in the main inventory grid (0-19) */
        this.maxSlots = maxSlots;

        /** @type {number} Currently selected hotbar slot index (0 to 7) */
        this.selectedHotbarIndex = 0;

        /** @type {Function|null} Callback fired when inventory changes */
        this.onChange = null;
    }

    /**
     * Add an item to the inventory, stacking if possible.
     * Searches Hotbar (20-27) first, then Main Grid (0-19).
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean} True if all items were added successfully
     */
    addItem(resourceId, amount = 1) {
        const def = getResourceDef(resourceId);
        const stackLimit = def ? def.stackSize : 99;
        let remaining = amount;

        // Define search order: Hotbar first, then Inventory Grid
        const searchOrder = [];
        for (let i = 20; i < 28; i++) searchOrder.push(i);
        for (let i = 0; i < 20; i++) searchOrder.push(i);

        // 1. Try to merge into existing stacks that are not full
        for (const idx of searchOrder) {
            const slot = this.slots[idx];
            if (slot && slot.id === resourceId && slot.count < stackLimit) {
                const add = Math.min(remaining, stackLimit - slot.count);
                slot.count += add;
                remaining -= add;
                if (remaining <= 0) break;
            }
        }

        // 2. If still remaining, place in empty slots
        if (remaining > 0) {
            for (const idx of searchOrder) {
                if (this.slots[idx] === null) {
                    const add = Math.min(remaining, stackLimit);
                    this.slots[idx] = { id: resourceId, count: add };
                    remaining -= add;
                    if (remaining <= 0) break;
                }
            }
        }

        if (remaining < amount) {
            if (this.onChange) {
                this.onChange();
            }
            return remaining === 0;
        }
        return false;
    }

    /**
     * Remove a quantity of an item from the inventory.
     * Deducts from Main Grid first (0-19), then Hotbar (20-27).
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean} True if removal was successful
     */
    removeItem(resourceId, amount = 1) {
        if (this.getCount(resourceId) < amount) return false;

        let remaining = amount;

        // Search order for removal: Main Grid first, then Hotbar
        const searchOrder = [];
        for (let i = 0; i < 20; i++) searchOrder.push(i);
        for (let i = 20; i < 28; i++) searchOrder.push(i);

        for (const idx of searchOrder) {
            const slot = this.slots[idx];
            if (slot && slot.id === resourceId) {
                if (slot.count >= remaining) {
                    slot.count -= remaining;
                    remaining = 0;
                } else {
                    remaining -= slot.count;
                    slot.count = 0;
                }

                if (slot.count <= 0) {
                    this.slots[idx] = null;
                }

                if (remaining <= 0) break;
            }
        }

        if (this.onChange) {
            this.onChange();
        }

        return true;
    }

    /**
     * Remove items directly from a specific slot index.
     * @param {number} idx
     * @param {number} amount
     * @returns {boolean}
     */
    removeItemAt(idx, amount = 1) {
        const slot = this.slots[idx];
        if (!slot || slot.count < amount) return false;

        slot.count -= amount;
        if (slot.count <= 0) {
            this.slots[idx] = null;
        }

        if (this.onChange) {
            this.onChange();
        }
        return true;
    }

    /**
     * Use (consume) an item from the inventory.
     * Alias for removeItem — used semantically.
     * @param {string} resourceId
     * @param {number} amount
     * @returns {boolean}
     */
    useItem(resourceId, amount = 1) {
        return this.removeItem(resourceId, amount);
    }

    /**
     * Get the total count of a resource across all slots
     * @param {string} resourceId
     * @returns {number}
     */
    getCount(resourceId) {
        let total = 0;
        for (const slot of this.slots) {
            if (slot && slot.id === resourceId) {
                total += slot.count;
            }
        }
        return total;
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
     * Check if the inventory is completely full (no empty slots)
     * @returns {boolean}
     */
    isFull() {
        for (const slot of this.slots) {
            if (slot === null) return false;
        }
        return true;
    }

    /**
     * Get the number of occupied slots in the main inventory grid (0-19)
     * @returns {number}
     */
    getUsedSlots() {
        let count = 0;
        for (let i = 0; i < 20; i++) {
            if (this.slots[i] !== null) count++;
        }
        return count;
    }

    /**
     * Return all occupied slots as an array of data.
     * Keeping backward compatibility for resource managers.
     * @returns {Array<{id: string, count: number}>}
     */
    getSlots() {
        const list = [];
        for (const slot of this.slots) {
            if (slot) {
                list.push({ id: slot.id, count: slot.count });
            }
        }
        return list;
    }

    /**
     * Get all items as a flat map of { resourceId: count }
     * @returns {Object}
     */
    getAll() {
        const result = {};
        for (const slot of this.slots) {
            if (slot) {
                result[slot.id] = (result[slot.id] || 0) + slot.count;
            }
        }
        return result;
    }

    /**
     * Get the currently equipped hotbar item
     * @returns {{id: string, count: number}|null}
     */
    getEquippedItem() {
        return this.slots[20 + this.selectedHotbarIndex];
    }

    /**
     * Swaps or merges items between two slots (drag and drop helper)
     * @param {number} srcIdx
     * @param {number} destIdx
     */
    moveOrMerge(srcIdx, destIdx) {
        if (srcIdx < 0 || srcIdx >= 28 || destIdx < 0 || destIdx >= 28) return;
        if (srcIdx === destIdx) return;

        const itemA = this.slots[srcIdx];
        const itemB = this.slots[destIdx];
        if (!itemA) return;

        if (!itemB) {
            // Move item to empty slot
            this.slots[destIdx] = itemA;
            this.slots[srcIdx] = null;
        } else if (itemB.id === itemA.id) {
            // Merge item stack
            const def = getResourceDef(itemA.id);
            const limit = def ? def.stackSize : 99;

            if (itemB.count >= limit) {
                // Swap if target is already full
                this.slots[destIdx] = itemA;
                this.slots[srcIdx] = itemB;
            } else {
                const spacesLeft = limit - itemB.count;
                if (itemA.count <= spacesLeft) {
                    itemB.count += itemA.count;
                    this.slots[srcIdx] = null;
                } else {
                    itemB.count = limit;
                    itemA.count -= spacesLeft;
                }
            }
        } else {
            // Swap items of different types
            this.slots[destIdx] = itemA;
            this.slots[srcIdx] = itemB;
        }

        if (this.onChange) {
            this.onChange();
        }
    }

    /**
     * Clear all slots
     */
    clear() {
        this.slots.fill(null);
        this.onChange = null;
    }
}
