import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceGeometry } from '../src/renderer/ResourceGeometry.js';

const bounds = positions => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
    }
    return { min, max };
};

test('procedural pickup meshes are valid, grounded within unit bounds, and distinct by silhouette', () => {
    const stone = createResourceGeometry({ id: 'stone', color: [.55,.55,.52] });
    const fish = createResourceGeometry({ id: 'raw_fish', color: [.6,.65,.7] });
    const herb = createResourceGeometry({ id: 'herb', color: [.2,.5,.2] });
    const fiber = createResourceGeometry({ id: 'fiber', color: [.66,.56,.35] });
    const meal = createResourceGeometry({ id: 'cooked_meal', color: [.7,.35,.15] });
    for (const data of [stone, fish, herb, fiber, meal]) {
        assert.ok(data.positions.length > 36);
        assert.equal(data.positions.length, data.normals.length);
        assert.equal(data.colors.length, data.positions.length / 3 * 4);
        assert.equal(data.indices.length % 3, 0);
        for (const component of data.positions) assert.ok(component >= -0.5 && component <= 0.5);
        for (const component of data.normals) assert.ok(Number.isFinite(component));
        const { min, max } = bounds(data.positions);
        assert.ok(min[1] >= -0.5 && max[1] <= 0.5);
    }
    assert.notEqual(stone.positions.length, fish.positions.length);
    assert.notEqual(fish.positions.length, herb.positions.length);
    assert.notEqual(fiber.positions.length, meal.positions.length);
});
