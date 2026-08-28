import test from 'node:test';
import assert from 'node:assert/strict';

import { ExposureSystem } from '../src/systems/ExposureSystem.js';

function closeTo(actual, expected, tolerance = 1e-6) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test('exposure starts dry and warm with normal modifiers', () => {
    const exposure = new ExposureSystem();
    assert.deepEqual(exposure.getSnapshot(), { warmth: 100, wetness: 0 });
    assert.deepEqual(exposure.getModifiers(), {
        state: 'normal', staminaRegenMultiplier: 1, speedMultiplier: 1,
    });
});

test('exposure thresholds apply moderate cold penalties', () => {
    const cold = new ExposureSystem({ warmth: 30 });
    closeTo(cold.getModifiers().staminaRegenMultiplier, 0.75);
    assert.equal(cold.getModifiers().speedMultiplier, 1);

    const freezing = new ExposureSystem({ warmth: 10 });
    assert.deepEqual(freezing.getModifiers(), {
        state: 'freezing', staminaRegenMultiplier: 0.5, speedMultiplier: 0.85,
    });
    const result = freezing.update(1, { isNight: true });
    assert.ok(result.damage > 0.24 && result.damage < 0.26);
});

test('exposure update is stable across different frame sizes', () => {
    const largeFrames = new ExposureSystem({ warmth: 32, wetness: 40 });
    const smallFrames = new ExposureSystem({ warmth: 32, wetness: 40 });
    const context = { rainFactor: 0.8, inWater: false, isNight: true };
    let largeDamage = 0;
    let smallDamage = 0;

    for (let frame = 0; frame < 40; frame++) {
        largeDamage += largeFrames.update(0.5, context).damage;
    }
    for (let frame = 0; frame < 1000; frame++) {
        smallDamage += smallFrames.update(0.02, context).damage;
    }

    closeTo(largeFrames.wetness, smallFrames.wetness, 1e-5);
    closeTo(largeFrames.warmth, smallFrames.warmth, 1e-5);
    closeTo(largeDamage, smallDamage, 1e-5);
});

test('exposure state loading clamps invalid values', () => {
    const exposure = new ExposureSystem();
    exposure.setState({ warmth: -5, wetness: 140 });
    assert.deepEqual(exposure.getSnapshot(), { warmth: 0, wetness: 100 });
});
