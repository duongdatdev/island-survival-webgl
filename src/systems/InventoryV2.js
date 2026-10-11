import { ItemContainer } from './ItemContainer.js';

export class Inventory extends ItemContainer {
    constructor(maxSlots = 20) {
        super(28, {
            searchOrder: [...Array.from({ length: 8 }, (_, i) => i + 20), ...Array.from({ length: 20 }, (_, i) => i)],
        });
        this.maxSlots = maxSlots;
        this.selectedHotbarIndex = 0;
    }

    getUsedSlots() { return this.slots.slice(0, 20).filter(Boolean).length; }
    getEquippedItem() { return this.slots[20 + this.selectedHotbarIndex]; }
}
