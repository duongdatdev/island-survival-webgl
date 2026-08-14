import test from 'node:test';
import assert from 'node:assert/strict';

import { ResourceManager } from '../src/systems/ResourceManager.js';

const resourceDef = {
    id: 'test_resource',
    modelId: 'test:model',
    modelScale: 1,
    meshScale: [0.4, 0.4, 0.4],
};

test('initial OBJ resources use their normalized base instead of fallback mesh height', () => {
    const manager = new ResourceManager({
        getModel() {
            return { bounds: { min: [-0.5, 0, -0.5] } };
        },
    });

    assert.equal(manager.getGroundedSpawnY(resourceDef, 2), 2.15);
});

test('initial glTF resources use half of their normalized height', () => {
    const manager = new ResourceManager({
        getModel() {
            return { targetSize: [0.75, 0.55, 0.55] };
        },
    });

    assert.equal(manager.getGroundedSpawnY(resourceDef, 2), 2.425);
});

test('procedural fallback resources remain grounded from their box dimensions', () => {
    const manager = new ResourceManager({ getModel() { return null; } });

    assert.equal(manager.getGroundedSpawnY(resourceDef, 2), 2.35);
});
