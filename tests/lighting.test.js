import test from 'node:test';
import assert from 'node:assert/strict';
import { DayNightCycle } from '../src/systems/DayNightCycle.js';

test('direct sunlight cannot illuminate terrain from below the horizon', () => {
    const cycle = new DayNightCycle();
    for (let i = 0; i <= 1000; i++) {
        cycle.timeOfDay = i / 1000;
        if (cycle.getSunDirection()[1] < 0) assert.equal(cycle.getSunIntensity(), 0);
        assert.ok(cycle.getAmbientIntensity() > 0);
    }
    cycle.timeOfDay = 0.5;
    assert.ok(cycle.getSunIntensity() > 0.8);
});

test('lighting and sky remain continuous across dawn, dusk and midnight', () => {
    const cycle = new DayNightCycle();
    const sample = time => {
        cycle.timeOfDay = (time + 1) % 1;
        const sky = cycle.getSkyColors();
        return [...cycle.getSunDirection(), ...cycle.getSunColor(),
            cycle.getSunIntensity(), ...cycle.getAmbientColor(),
            cycle.getAmbientIntensity(), ...cycle.getMoonColor(),
            ...sky.top, ...sky.bottom, ...sky.horizon, cycle.getSunsetAmount()];
    };
    for (const boundary of [0, cycle.dawnTime, cycle.duskTime]) {
        const before = sample(boundary - 0.000001);
        const after = sample(boundary + 0.000001);
        before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < 0.001));
    }
});
