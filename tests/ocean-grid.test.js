import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanGridAxis, Water } from '../src/entities/Water.js';

test('ocean grid resolves metre-scale waves around the raft while retaining a continuous distant horizon', () => {
    const axis = oceanGridAxis(128, 1280, 128, 24);
    assert.equal(axis.length, 177); assert.equal(axis[0], -640); assert.equal(axis.at(-1), 640);
    for (let i = 0; i < axis.length; i++) {
        assert.ok(Math.abs(axis[i] + axis[axis.length - 1 - i]) < 1e-8);
        if (i) assert.ok(axis[i] > axis[i - 1]);
        if (i && Math.abs(axis[i]) <= 64 && Math.abs(axis[i - 1]) <= 64) assert.equal(axis[i] - axis[i - 1], 1);
    }
    const water = Object.create(Water.prototype); Object.assign(water, { size: axis.length - 1, width: 1280, gridAxis: axis });
    const mesh = water._generateWaterGrid(null), vertices = axis.length ** 2;
    assert.equal(mesh.positions.length, vertices * 3); assert.equal(mesh.indices.length, 176 ** 2 * 6);
    assert.equal(mesh.indices.reduce((maximum, index) => Math.max(maximum, index), 0), vertices - 1);
    for (let row = 0; row < axis.length; row++) for (let column = 0; column < axis.length; column++) {
        const index = (row * axis.length + column) * 3;
        assert.equal(mesh.positions[index], Math.fround(axis[column])); assert.equal(mesh.positions[index + 2], Math.fround(axis[row]));
    }
});

test('invalid local ocean grids fail before allocating a mesh', () => {
    for (const dimensions of [[0, 1280, 128, 24], [128, 128, 128, 24], [128, 1280, 0, 24], [128, 1280, 128, 0], [128, Infinity, 128, 24]]) {
        assert.throws(() => oceanGridAxis(...dimensions), /Invalid ocean/);
    }
});
