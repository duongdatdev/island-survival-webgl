import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAutomaticObjective } from '../src/systems/ObjectiveTracker.js';

function makeScene({ flags = {}, counts = {} } = {}) {
    return {
        raftAssembly: {
            framePlaced: false,
            floatsPlaced: false,
            paddlePlaced: false,
            ...flags,
        },
        inventory: {
            hasItem(id, amount = 1) { return (counts[id] || 0) >= amount; },
            getCount(id) { return counts[id] || 0; },
        },
    };
}

test('automatic objective starts with raft frame ingredient progress', () => {
    const objective = buildAutomaticObjective(makeScene({ counts: { wood: 4 } }));

    assert.equal(objective.recipeId, 'raft_frame');
    assert.equal(objective.title, 'Khung Bè');
    assert.deepEqual(
        objective.ingredients.map(item => [item.resourceId, item.current, item.required]),
        [['wood', 4, 10]]
    );
});

test('automatic objective switches from crafting to installing owned raft parts', () => {
    const objective = buildAutomaticObjective(makeScene({ counts: { raft_frame: 1 } }));

    assert.equal(objective.recipeId, 'raft_frame');
    assert.equal(objective.title, 'Lắp Khung Bè');
    assert.deepEqual(objective.ingredients, []);
});

test('automatic objective advances through required raft modules', () => {
    const floats = buildAutomaticObjective(makeScene({
        flags: { framePlaced: true },
        counts: { barrel: 2, rope: 1 },
    }));
    const paddle = buildAutomaticObjective(makeScene({
        flags: { framePlaced: true, floatsPlaced: true },
    }));
    const escape = buildAutomaticObjective(makeScene({
        flags: { framePlaced: true, floatsPlaced: true, paddlePlaced: true },
    }));

    assert.equal(floats.recipeId, 'barrel_floats');
    assert.equal(paddle.recipeId, 'paddle');
    assert.equal(escape.recipeId, null);
    assert.equal(escape.title, 'Rời khỏi đảo');
});
