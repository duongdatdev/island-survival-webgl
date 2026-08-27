import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAutomaticObjective, ObjectiveTracker } from '../src/systems/ObjectiveTracker.js';

function makeScene({ flags = {}, counts = {} } = {}) {
    return {
        raftAssembly: {
            framePlaced: false,
            floatsPlaced: false,
            paddlePlaced: false,
            ...flags,
        },
        campfire: { isBuilt: false },
        waterCollector: { isBuilt: false },
        unlockedBlueprints: new Set(),
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

test('pinned recipes override the automatic objective and report progress', () => {
    const scene = makeScene({ counts: { wood: 2, stone: 1 } });
    const tracker = new ObjectiveTracker(scene, { document: null });

    assert.equal(tracker.setPinnedRecipe('stone_axe'), true);
    const objective = tracker.getCurrentObjective();

    assert.equal(objective.source, 'pinned');
    assert.equal(objective.recipeId, 'stone_axe');
    assert.deepEqual(
        objective.ingredients.map(item => [item.resourceId, item.current, item.complete]),
        [['wood', 2, true], ['stone', 1, false]]
    );
});

test('completed or locked recipes cannot remain pinned', () => {
    const scene = makeScene();
    const tracker = new ObjectiveTracker(scene, { document: null });

    assert.equal(tracker.setPinnedRecipe('fishing_rod'), false);
    assert.equal(tracker.getPinnedRecipeId(), null);

    assert.equal(tracker.setPinnedRecipe('raft_frame'), true);
    scene.raftAssembly.framePlaced = true;
    const objective = tracker.getCurrentObjective();

    assert.equal(tracker.getPinnedRecipeId(), null);
    assert.equal(objective.recipeId, 'barrel_floats');
});
