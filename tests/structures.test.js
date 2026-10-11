import test from 'node:test';
import assert from 'node:assert/strict';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

function materials() {
    const bag = new ItemContainer(20);
    for (const id of ['wood', 'stone', 'fiber', 'rope', 'barrel', 'iron_ingot', 'scrap']) bag.addItem(id, 99);
    return bag;
}
const registry = options => new StructureRegistry({ level: () => 3, ...options });

test('placement rejects water, steep terrain, protected areas and overlaps without consuming materials', () => {
    const bag = materials();
    const before = bag.snapshot();
    for (const terrain of [{ getHeight: () => 0 }, { getHeight: x => x }]) {
        assert.equal(registry({ terrain }).place('foundation', [0, 0, 0], 0, bag).ok, false);
    }
    const protectedRegistry = registry({ protectedAreas: [{ position: [0, 1, 0], radius: 4 }] });
    assert.equal(protectedRegistry.place('foundation', [0, 0, 0], 0, bag).ok, false);
    assert.deepEqual(bag.snapshot(), before);
    const store = registry();
    assert.equal(store.place('foundation', [0.4, 0, 0.2], 0, bag).ok, true);
    const afterFirst = bag.snapshot();
    assert.equal(store.place('foundation', [0, 0, 0], 0, bag).ok, false);
    assert.deepEqual(bag.snapshot(), afterFirst);
});

test('roof coverage needs a foundation and protects only positions beneath it', () => {
    const store = registry();
    const bag = materials();
    assert.equal(store.place('roof', [0, 0, 0], 0, bag).ok, false);
    const { structure: foundation } = store.place('foundation', [0, 0, 0], 0, bag);
    const { structure: roof } = store.place('roof', [0, 0, 0], 0, bag, { parentId: foundation.id });
    assert.equal(store.sheltered([0, 1.5, 0]), true);
    assert.equal(store.sheltered([2, 1.5, 0]), false);
    assert.equal(store.sheltered([0, 5, 0]), false);
    assert.equal(store.dismantle(foundation.id, bag).ok, false);
    assert.equal(store.dismantle(roof.id, bag).ok, true);
    assert.equal(store.sheltered([0, 1.5, 0]), false);
});

test('multiple chests retain separate contents, opt-in crafting and persistent IDs', () => {
    const store = registry();
    const bag = materials();
    const { structure: a } = store.place('chest', [0, 0, 0], 0, bag);
    const { structure: b } = store.place('chest', [3, 0, 0], 0, bag);
    a.container.addItem('wood', 10);
    b.container.addItem('stone', 12);
    b.allowCrafting = true;
    assert.deepEqual(store.craftingSources([0, 1, 0], bag), [bag, b.container]);
    assert.equal(store.dismantle(a.id, bag).ok, false);
    const restored = registry();
    restored.restore(store.snapshot());
    assert.equal(restored.structures.get(a.id).container.getCount('wood'), 10);
    assert.equal(restored.structures.get(b.id).container.getCount('stone'), 12);
    const placed = restored.place('chest', [6, 0, 0], 0, bag);
    assert.ok(placed.ok);
    assert.notEqual(placed.structure.id, a.id);
    assert.notEqual(placed.structure.id, b.id);
});

test('dismantling with insufficient refund capacity leaves both materials and structure unchanged', () => {
    const store = registry();
    const bag = materials();
    const { structure } = store.place('chest', [0, 0, 0], 0, bag);
    const full = new ItemContainer(1);
    full.addItem('stone', 99);
    assert.equal(store.dismantle(structure.id, full).ok, false);
    assert.equal(store.structures.has(structure.id), true);
    assert.deepEqual(full.getAll(), { stone: 99 });
});

test('doorway opening and hinged door remain attached to their foundation', () => {
    const store = registry();
    const bag = materials();
    const { structure: foundation } = store.place('foundation', [0, 0, 0], 0, bag);
    const { structure: doorway } = store.place('doorway', [0, 0, 0], 0, bag, { parentId: foundation.id });
    const result = store.place('door', [0, 0, 0], 0, bag, { parentId: doorway.id });
    assert.equal(result.ok, true);
    assert.equal(store.dismantle(doorway.id, bag).ok, false);
});
