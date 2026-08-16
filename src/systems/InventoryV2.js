import { getResourceDef } from './ResourceDatabase.js';

export class Inventory {
    constructor(maxSlots = 20) {
        this.slots = new Array(28).fill(null);

        this.maxSlots = maxSlots;

        this.selectedHotbarIndex = 0;

        this.onChange = null;
    }

    addItem(resourceId, amount = 1) {
        const def = getResourceDef(resourceId);
        const stackLimit = def ? def.stackSize : 99;
        let remaining = amount;

        const searchOrder = [];
        for (let i = 20; i < 28; i++) searchOrder.push(i);
        for (let i = 0; i < 20; i++) searchOrder.push(i);

        for (const idx of searchOrder) {
            const slot = this.slots[idx];
            if (slot && slot.id === resourceId && slot.count < stackLimit) {
                const add = Math.min(remaining, stackLimit - slot.count);
                slot.count += add;
                remaining -= add;
                if (remaining <= 0) break;
            }
        }

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

    removeItem(resourceId, amount = 1) {
        if (this.getCount(resourceId) < amount) return false;

        let remaining = amount;

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

    useItem(resourceId, amount = 1) {
        return this.removeItem(resourceId, amount);
    }

    getCount(resourceId) {
        let total = 0;
        for (const slot of this.slots) {
            if (slot && slot.id === resourceId) {
                total += slot.count;
            }
        }
        return total;
    }

    hasItem(resourceId, amount = 1) {
        return this.getCount(resourceId) >= amount;
    }

    isFull() {
        for (const slot of this.slots) {
            if (slot === null) return false;
        }
        return true;
    }

    getUsedSlots() {
        let count = 0;
        for (let i = 0; i < 20; i++) {
            if (this.slots[i] !== null) count++;
        }
        return count;
    }

    getSlots() {
        const list = [];
        for (const slot of this.slots) {
            if (slot) {
                list.push({ id: slot.id, count: slot.count });
            }
        }
        return list;
    }

    getAll() {
        const result = {};
        for (const slot of this.slots) {
            if (slot) {
                result[slot.id] = (result[slot.id] || 0) + slot.count;
            }
        }
        return result;
    }

    getEquippedItem() {
        return this.slots[20 + this.selectedHotbarIndex];
    }

    moveOrMerge(srcIdx, destIdx) {
        if (srcIdx < 0 || srcIdx >= 28 || destIdx < 0 || destIdx >= 28) return;
        if (srcIdx === destIdx) return;

        const itemA = this.slots[srcIdx];
        const itemB = this.slots[destIdx];
        if (!itemA) return;

        if (!itemB) {
            this.slots[destIdx] = itemA;
            this.slots[srcIdx] = null;
        } else if (itemB.id === itemA.id) {
            const def = getResourceDef(itemA.id);
            const limit = def ? def.stackSize : 99;

            if (itemB.count >= limit) {
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
            this.slots[destIdx] = itemA;
            this.slots[srcIdx] = itemB;
        }

        if (this.onChange) {
            this.onChange();
        }
    }

    clear() {
        this.slots.fill(null);
        this.onChange = null;
    }
}
