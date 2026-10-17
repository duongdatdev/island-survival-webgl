import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleWaterShore } from '../src/entities/Water.js';

test('water shore mask follows sampled height and stays continuous across zero depth', () => {
    const terrain = { getHeight: x => x < -2 ? -8 : x < 0 ? -0.02 : x < 2 ? 0.02 : 0.5 };
    const deep = sampleWaterShore(terrain, -3, 0);
    const shallow = sampleWaterShore(terrain, -1, 0);
    const wetSand = sampleWaterShore(terrain, 1, 0);
    const dryLand = sampleWaterShore(terrain, 3, 0);

    assert.equal(deep[1], 0);
    assert.ok(shallow[1] > 0.99);
    assert.ok(wetSand[1] > 0.99);
    assert.ok(dryLand[1] > 0 && dryLand[1] < 1);
    assert.ok(Math.abs(shallow[1] - wetSand[1]) < 0.01);
});

test('shore sampling does not substitute a radial island boundary', () => {
    const terrain = { generator: { island: { radius: 1 } }, getHeight: () => -0.15 };
    const [depth, shore] = sampleWaterShore(terrain, 40, 0);
    assert.ok(depth > 0);
    assert.ok(shore > 0.9);
    assert.equal(sampleWaterShore({ getHeight: () => -1.3 }, 40, 0)[1], 0);
});
