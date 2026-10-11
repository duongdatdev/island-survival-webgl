import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSystem } from '../src/systems/FishingSystem.js';
import { DebrisHook } from '../src/systems/DebrisHook.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

function landFish(fishing, inventory) {
    fishing.update(2.6, {}, inventory);
    assert.equal(fishing.state.phase, 'bite');
    fishing.update(0.05, { strike: true, reel: true }, inventory);
    for (let time = 0; fishing.state?.phase === 'reeling' && time < 100; time += 0.05) {
        fishing.update(0.05, { reel: fishing.state.tension < 0.65 }, inventory);
    }
}

test('fishing requires water, a bite strike and alternating reel/release, with three groups', () => {
    const caught = [];
    const inventory = new ItemContainer(4);
    const fishing = new FishingSystem({ random: () => 0, onCaught: id => caught.push(id) });
    assert.equal(fishing.cast([0, 0, 5], 0.1), false);
    assert.equal(fishing.cast([0, 0, 5], 1), true);
    fishing.update(0.1, { strike: true }, inventory);
    assert.equal(fishing.state, null);
    fishing.cast([0, 0, 5], 1);
    fishing.update(5, {}, inventory);
    assert.equal(fishing.state, null);
    fishing.cast([0, 0, 5], 1);
    landFish(fishing, inventory);
    assert.deepEqual(caught, ['raw_fish']);
    assert.equal(inventory.getCount('raw_fish'), 1);
    for (const [depth, roll, fish] of [[1, 0.8, 'reef_fish'], [5, 0.8, 'ocean_fish']]) {
        const rolls = [roll, 0];
        fishing.random = () => rolls.shift() ?? 0;
        fishing.cast([0, 0, 5], depth);
        landFish(fishing, inventory);
        assert.equal(inventory.getCount(fish), 1);
    }
});

test('continuously pulling breaks the line; full inventory preserves a landed catch across reload', () => {
    const inventory = new ItemContainer(1);
    inventory.addItem('wood', 99);
    const fishing = new FishingSystem({ random: () => 0 });
    fishing.cast([0, 0, 5], 1);
    fishing.update(2.6, {}, inventory);
    fishing.update(10, { strike: true, reel: true }, inventory);
    assert.equal(fishing.state, null);
    fishing.cast([0, 0, 5], 1);
    landFish(fishing, inventory);
    assert.equal(fishing.state.phase, 'landed');
    assert.equal(fishing.cancel(), false);
    const restored = new FishingSystem();
    restored.restore(fishing.snapshot());
    inventory.removeItem('wood', 99);
    assert.equal(restored.claim(inventory), true);
    assert.equal(restored.claim(inventory), false);
    assert.equal(inventory.getCount('raw_fish'), 1);
});

function debris(x, z) {
    return { position: [x, 0.15, z], debrisDef: { gives: { resourceId: 'wood', amount: 3 } },
        collect() { this.isCollected = true; } };
}

test('hook pulls aimed debris within 20 m, rejects animals/out of range, cancel releases it', () => {
    const inventory = new ItemContainer(1), hook = new DebrisHook();
    assert.equal(hook.cast([0, 1, 0], [0, 0, 1], [{ position: [0, 0, 5], health: 100 }, debris(0, 21), debris(4, 5)]), false);
    const item = debris(0, 18);
    assert.equal(hook.cast([0, 1, 0], [0, 0, 1], [item]), true);
    hook.cancel(); assert.equal(item.isHooked, false); assert.equal(item.isCollected, undefined);
    hook.cast([0, 1, 0], [0, 0, 1], [item]);
    hook.update(5, [0, 1, 0], inventory);
    assert.equal(item.isCollected, true);
    assert.equal(inventory.getCount('wood'), 3);
    hook.update(5, [0, 1, 0], inventory);
    assert.equal(inventory.getCount('wood'), 3);
});

test('hook capacity failure persists pending reward and claims only once after reload', () => {
    const inventory = new ItemContainer(1), hook = new DebrisHook();
    inventory.addItem('stone', 99);
    hook.cast([0, 1, 0], [0, 0, 1], [debris(0, 10)]);
    hook.update(5, [0, 1, 0], inventory);
    assert.deepEqual(hook.snapshot(), { id: 'wood', count: 3 });
    const restored = new DebrisHook(); restored.restore(hook.snapshot());
    assert.equal(restored.claim(inventory), false);
    inventory.removeItem('stone', 99);
    assert.equal(restored.claim(inventory), true);
    assert.equal(restored.claim(inventory), false);
    assert.equal(inventory.getCount('wood'), 3);
});
