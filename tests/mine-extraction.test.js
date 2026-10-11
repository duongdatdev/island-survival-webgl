import test from 'node:test';
import assert from 'node:assert/strict';
import { MineExtraction, assertMineExtractionSnapshot } from '../src/systems/MineExtraction.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

test('deep faces require picks, improve with iron, and repeat only under eligible held input', () => {
    const mine = new MineExtraction(), inventory = new ItemContainer(4);
    assert.equal(mine.start('iron', inventory).ok, false); assert.equal(mine.start('invalid', inventory).ok, false);
    inventory.addItem('stone_pickaxe', 1); assert.equal(mine.start('iron', inventory).ok, true);
    assert.equal(mine.start('__proto__', inventory).ok, false); assert.equal(mine.start('constructor', inventory).ok, false);
    mine.update(5, inventory, { held: true, eligible: true }); assert.equal(mine.faces.iron.progress, 3);
    mine.update(20, inventory, { held: false, eligible: true }); assert.equal(mine.faces.iron.progress, 3);
    assert.equal(inventory.getCount('iron_ore'), 0); assert.equal(mine.active, null);
    mine.start('iron', inventory); inventory.addItem('iron_pickaxe', 1);
    const result = mine.update(3, inventory, { held: true, eligible: true });
    assert.equal(result.claimed, 'iron'); assert.equal(inventory.getCount('iron_ore'), 2); assert.equal(mine.faces.iron.batches, 1);
    mine.update(6, inventory, { held: true, eligible: true }); assert.equal(inventory.getCount('iron_ore'), 4);
    mine.update(100, inventory, { held: true, eligible: false }); assert.equal(mine.active, null); assert.equal(inventory.getCount('iron_ore'), 4);
    mine.start('copper', inventory); mine.update(6, inventory, { held: true, eligible: true });
    assert.equal(inventory.getCount('copper_ore'), 2); assert.equal(mine.faces.copper.batches, 1);
});

test('finished ore is atomic when full, persists without offline work, and can be collected once without a pick', () => {
    const mine = new MineExtraction(), inventory = new ItemContainer(2);
    inventory.addItem('iron_pickaxe', 1); inventory.addItem('iron_ore', 98); mine.start('iron', inventory);
    assert.equal(mine.update(6, inventory, { held: true, eligible: true }).waiting, true);
    assert.equal(inventory.getCount('iron_ore'), 98); assert.equal(mine.faces.iron.progress, 6); assert.equal(mine.faces.iron.batches, 0);
    const restored = new MineExtraction(); restored.restore(mine.snapshot());
    assert.equal(restored.active, null); restored.update(100000, inventory, { held: true, eligible: true });
    assert.equal(restored.faces.iron.progress, 6); inventory.removeItem('iron_pickaxe', 1);
    assert.equal(restored.start('iron', inventory).claimed, 'iron'); assert.equal(inventory.getCount('iron_ore'), 100);
    assert.equal(restored.claim('iron', inventory).ok, false); assert.equal(restored.start('iron', inventory).ok, false);
    assert.equal(restored.faces.iron.batches, 1);
});

test('partial mining restores separately per face and malformed snapshots cannot replace current work', () => {
    const mine = new MineExtraction(), inventory = new ItemContainer(3); inventory.addItem('iron_pickaxe', 1);
    mine.start('copper', inventory); mine.update(2.5, inventory, { held: true, eligible: true }); mine.pause();
    mine.start('iron', inventory); mine.update(1.25, inventory, { held: true, eligible: true });
    const expected = mine.snapshot(), restored = new MineExtraction(); restored.restore(expected);
    assert.deepEqual(restored.snapshot(), expected); assert.equal(restored.active, null);
    for (const mutate of [s => s.faces.iron.progress = -1, s => s.faces.iron.progress = 6.1, s => s.faces.copper.batches = 1.5,
        s => delete s.faces.copper, s => s.faces.fake = { progress: 0, batches: 0 }, s => s.version = 2]) {
        const bad = structuredClone(expected); mutate(bad); assert.throws(() => assertMineExtractionSnapshot(bad));
        assert.throws(() => restored.restore(bad)); assert.deepEqual(restored.snapshot(), expected);
    }
    assert.throws(() => restored.update(NaN, inventory)); assert.throws(() => restored.update(-1, inventory));
});
