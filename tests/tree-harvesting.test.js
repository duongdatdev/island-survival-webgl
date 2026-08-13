import test from 'node:test';
import assert from 'node:assert/strict';

import { EnvironmentObject, TREE_HITS_TO_FELL } from '../src/entities/EnvironmentObject.js';
import { GameScene } from '../src/scenes/GameScene.js';

function createTree(position = [0, 0, 2], category = 'Tree') {
    const mesh = {
        bounds: {
            center: [0, 3, 0],
            radius: 3,
            min: [-0.5, 0, -0.5],
            max: [0.5, 6, 0.5],
        },
        draw() {},
    };
    return new EnvironmentObject(null, mesh, position, [0, 0, 0], [1, 1, 1], true, true, category);
}

test('only trees and palms expose chopping state', () => {
    const tree = createTree();
    const palm = createTree([1, 0, 1], 'Palm');
    const rock = createTree([2, 0, 1], 'Rock');

    assert.equal(tree.isHarvestableTree, true);
    assert.equal(palm.isHarvestableTree, true);
    assert.equal(rock.isHarvestableTree, false);
    assert.equal(rock.chop([0, 0, 0]).hit, false);
});

test('the third aimed axe hit starts a fall away from the player', () => {
    const tree = createTree();
    const scene = Object.create(GameScene.prototype);
    let unregisterCalls = 0;
    scene.environmentEntities = [tree];
    scene.collisionSystem = { unregister() { unregisterCalls++; } };

    for (let hit = 1; hit <= TREE_HITS_TO_FELL; hit++) {
        const result = scene._tryChopTree([0, 0, 0], 0, { id: 'stone_axe' });
        assert.equal(result.hit, true);
        assert.equal(result.hitsRemaining, TREE_HITS_TO_FELL - hit);
    }

    assert.equal(tree.treeState, 'falling');
    assert.equal(tree.collider.type, 'none');
    assert.equal(unregisterCalls, 1);
    assert.ok(Math.abs(tree._fallYaw) < 1e-6);
});

test('wood pickups spawn once, and only on the frame the tree touches terrain', () => {
    const tree = createTree();
    tree.chop([0, 0, 0]);
    tree.chop([0, 0, 0]);
    tree.chop([0, 0, 0]);

    const drops = [];
    const scene = Object.create(GameScene.prototype);
    scene.gl = null;
    scene.environmentEntities = [tree];
    scene.terrain = { getHeight() { return 0; } };
    scene.resourceManager = {
        spawnResource(gl, id, x, z, terrain, options) {
            drops.push({ id, x, z, options });
        },
    };
    scene.engine = { audio: { playTreeFall() {} } };
    scene.particleSystem = { emit() {} };
    scene._updateFallingTrees(0.1);
    assert.equal(tree.treeState, 'falling');
    assert.equal(drops.length, 0);

    for (let i = 0; i < 20 && tree.treeState === 'falling'; i++) {
        scene._updateFallingTrees(0.1);
    }

    assert.equal(tree.treeState, 'fallen');
    assert.equal(scene.environmentEntities.length, 0);
    assert.equal(drops.length, 3);
    assert.ok(drops.every(drop => drop.id === 'wood'));
    assert.ok(drops.every(drop => drop.options.allowWater === true));
    assert.ok(drops.every(drop => drop.z > tree.position[2]));

    scene._updateFallingTrees(10);
    assert.equal(drops.length, 3);
});
