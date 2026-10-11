import { getResourceDef } from './ResourceDatabase.js';

/** Count-based storage shared by backpacks, chests, stations and death bags. */
export class ItemContainer {
    constructor(capacity = 24, options = {}) {
        if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid container capacity');
        this.slots = new Array(capacity).fill(null);
        this.searchOrder = options.searchOrder || Array.from({ length: capacity }, (_, i) => i);
        this.removeOrder = options.removeOrder || Array.from({ length: capacity }, (_, i) => i);
        this.onChange = null;
        this._silent = false;
    }

    _notify() {
        if (!this._silent) this.onChange?.();
    }

    _stackLimit(id) {
        return getResourceDef(id)?.stackSize || 99;
    }

    getCount(id) {
        return this.slots.reduce((sum, slot) => sum + (slot?.id === id ? slot.count : 0), 0);
    }

    hasItem(id, count = 1) {
        return this.getCount(id) >= count;
    }

    capacityFor(id) {
        const limit = this._stackLimit(id);
        return this.slots.reduce((sum, slot) => sum + (!slot ? limit : slot.id === id ? limit - slot.count : 0), 0);
    }

    canAdd(id, count = 1) {
        return typeof id === 'string' && Number.isInteger(count) && count > 0 && this.capacityFor(id) >= count;
    }

    /** All-or-nothing. Callers never lose an unaccepted remainder. */
    addItem(id, count = 1) {
        if (!this.canAdd(id, count)) return false;
        const limit = this._stackLimit(id);
        let remaining = count;
        for (const index of this.searchOrder) {
            const slot = this.slots[index];
            if (!slot || slot.id !== id) continue;
            const added = Math.min(remaining, limit - slot.count);
            slot.count += added;
            remaining -= added;
            if (!remaining) break;
        }
        for (const index of this.searchOrder) {
            if (!remaining) break;
            if (this.slots[index]) continue;
            const added = Math.min(remaining, limit);
            this.slots[index] = { id, count: added };
            remaining -= added;
        }
        this._notify();
        return true;
    }

    removeItem(id, count = 1) {
        if (!Number.isInteger(count) || count < 1 || !this.hasItem(id, count)) return false;
        let remaining = count;
        for (const index of this.removeOrder) {
            const slot = this.slots[index];
            if (slot?.id !== id) continue;
            const removed = Math.min(remaining, slot.count);
            slot.count -= removed;
            remaining -= removed;
            if (!slot.count) this.slots[index] = null;
            if (!remaining) break;
        }
        this._notify();
        return true;
    }

    removeItemAt(index, count = 1) {
        const slot = this.slots[index];
        if (!Number.isInteger(count) || count < 1 || !slot || slot.count < count) return false;
        slot.count -= count;
        if (!slot.count) this.slots[index] = null;
        this._notify();
        return true;
    }

    useItem(id, count = 1) { return this.removeItem(id, count); }
    isFull() { return this.slots.every(Boolean); }
    getUsedSlots() { return this.slots.filter(Boolean).length; }
    getSlots() { return this.slots.filter(Boolean).map(slot => ({ ...slot })); }
    getAll() {
        const result = {};
        for (const slot of this.slots) if (slot) result[slot.id] = (result[slot.id] || 0) + slot.count;
        return result;
    }

    /** Explicit partial transfer for shift-click: returns the moved quantity. */
    transferTo(destination, id, count = this.getCount(id), partial = false) {
        if (!(destination instanceof ItemContainer) || destination === this
            || !Number.isInteger(count) || count < 1) return 0;
        const available = Math.min(this.getCount(id), destination.capacityFor(id));
        const moved = partial ? Math.min(count, available) : available >= count ? count : 0;
        if (!moved) return 0;
        const sourceSilent = this._silent;
        const destinationSilent = destination._silent;
        this._silent = destination._silent = true;
        this.removeItem(id, moved);
        destination.addItem(id, moved);
        this._silent = sourceSilent;
        destination._silent = destinationSilent;
        this._notify();
        destination._notify();
        return moved;
    }

    moveOrMerge(source, destination) {
        if (!Number.isInteger(source) || !Number.isInteger(destination) || source === destination
            || source < 0 || destination < 0 || source >= this.slots.length || destination >= this.slots.length) return;
        const item = this.slots[source];
        const target = this.slots[destination];
        if (!item) return;
        if (!target || target.id !== item.id || target.count === this._stackLimit(item.id)) {
            this.slots[destination] = item;
            this.slots[source] = target;
        } else {
            const moved = Math.min(item.count, this._stackLimit(item.id) - target.count);
            target.count += moved;
            item.count -= moved;
            if (!item.count) this.slots[source] = null;
        }
        this._notify();
    }

    snapshot() { return this.slots.map(slot => slot ? { ...slot } : null); }

    restore(slots) {
        if (!Array.isArray(slots) || slots.length !== this.slots.length
            || slots.some(slot => slot && (typeof slot.id !== 'string' || !Number.isInteger(slot.count)
                || slot.count < 1 || slot.count > this._stackLimit(slot.id)))) return false;
        this.slots = slots.map(slot => slot ? { id: slot.id, count: slot.count } : null);
        this._notify();
        return true;
    }

    clear() {
        this.slots.fill(null);
        this.onChange = null;
    }
}

/** Reserve ingredients across consenting containers and commit output atomically. */
export function transactCraft(containers, ingredients, output, destination = containers[0]) {
    const sources = [...new Set(containers)];
    if (!sources.length || !sources.every(c => c instanceof ItemContainer)
        || !(destination instanceof ItemContainer) || !ingredients || !output) return false;
    const entries = Object.entries(ingredients);
    if (entries.some(([id, amount]) => !Number.isInteger(amount) || amount < 1
        || sources.reduce((sum, c) => sum + c.getCount(id), 0) < amount)) return false;
    const participants = [...new Set([...sources, destination])];
    const snapshots = participants.map(c => c.snapshot());
    const silent = participants.map(c => c._silent);
    participants.forEach(c => { c._silent = true; });
    let success = false;
    try {
        for (const [id, amount] of entries) {
            let remaining = amount;
            for (const c of sources) {
                const removed = Math.min(remaining, c.getCount(id));
                if (removed) c.removeItem(id, removed);
                remaining -= removed;
                if (!remaining) break;
            }
        }
        success = true;
        for (const item of Array.isArray(output) ? output : [output]) {
            if (!destination.addItem(item.id, item.count || 1)) { success = false; break; }
        }
    } finally {
        if (!success) participants.forEach((c, i) => { c.slots = snapshots[i]; });
        participants.forEach((c, i) => { c._silent = silent[i]; });
    }
    if (success) participants.forEach((c, i) => {
        if (JSON.stringify(c.slots) !== JSON.stringify(snapshots[i])) c._notify();
    });
    return success;
}
