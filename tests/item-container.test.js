import test from 'node:test';
import assert from 'node:assert/strict';
import { ItemContainer, transactCraft } from '../src/systems/ItemContainer.js';
import { Inventory } from '../src/systems/InventoryV2.js';
import { CraftingSystem } from '../src/systems/CraftingSystem.js';

test('failed insertion leaves the entire container unchanged', () => {
    const chest = new ItemContainer(1);
    chest.addItem('wood', 98);
    let events = 0;
    chest.onChange = () => events++;
    assert.equal(chest.addItem('wood', 2), false);
    assert.deepEqual(chest.getAll(), { wood: 98 });
    assert.equal(events, 0);
});

test('explicit partial transfers conserve items and publish only final states', () => {
    const bag = new ItemContainer(2);
    const chest = new ItemContainer(1);
    bag.addItem('wood', 10);
    chest.addItem('wood', 95);
    const totals = [];
    bag.onChange = chest.onChange = () => totals.push(bag.getCount('wood') + chest.getCount('wood'));
    assert.equal(bag.transferTo(chest, 'wood', 10), 0);
    assert.equal(bag.transferTo(chest, 'wood', 10, true), 4);
    assert.equal(bag.getCount('wood'), 6);
    assert.equal(chest.getCount('wood'), 99);
    assert.deepEqual(totals, [105, 105]);
});

test('crafting across stores rolls back when the output cannot fit', () => {
    const bag = new ItemContainer(1);
    const chest = new ItemContainer(1);
    bag.addItem('coconut', 2);
    chest.addItem('wood', 10);
    const before = [bag.snapshot(), chest.snapshot()];
    assert.equal(transactCraft([bag, chest], { wood: 2 }, { id: 'stone_axe' }), false);
    assert.deepEqual([bag.snapshot(), chest.snapshot()], before);
});

test('crafting may use the slot released by ingredients and aggregates stores', () => {
    const bag = new ItemContainer(1);
    const chest = new ItemContainer(1);
    bag.addItem('wood', 1);
    chest.addItem('wood', 1);
    assert.equal(transactCraft([bag, chest], { wood: 2 }, { id: 'stone_axe' }), true);
    assert.deepEqual(bag.getAll(), { stone_axe: 1 });
    assert.deepEqual(chest.getAll(), {});
});

test('legacy inventory keeps hotbar insertion and backpack-first removal', () => {
    const bag = new Inventory();
    bag.addItem('wood', 2);
    assert.deepEqual(bag.slots[20], { id: 'wood', count: 2 });
    bag.slots[0] = { id: 'wood', count: 1 };
    bag.removeItem('wood', 1);
    assert.equal(bag.slots[0], null);
    assert.equal(bag.slots[20].count, 2);
});

test('classic crafting does not consume ingredients when an output is rejected', () => {
    const bag = new Inventory();
    bag.slots.fill(null);
    for (let i = 0; i < 28; i++) bag.slots[i] = { id: 'coconut', count: 1 };
    bag.slots[0] = { id: 'wood', count: 3 };
    bag.slots[1] = { id: 'stone', count: 3 };
    assert.equal(CraftingSystem.craft('stone_axe', bag), false);
    assert.equal(bag.getCount('wood'), 3);
    assert.equal(bag.getCount('stone'), 3);
});

test('invalid snapshots do not replace the current contents', () => {
    const chest = new ItemContainer(1);
    chest.addItem('wood', 2);
    assert.equal(chest.restore([{ id: 'wood', count: -1 }]), false);
    assert.equal(chest.getCount('wood'), 2);
});
