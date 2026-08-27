import test from 'node:test';
import assert from 'node:assert/strict';

import { WaterCollector } from '../src/entities/WaterCollector.js';
import { blendDriftDirection, DriftingDebris } from '../src/entities/DriftingDebris.js';
import { WeatherSystem } from '../src/systems/WeatherSystem.js';

class TestWaterCollector extends WaterCollector {
    _buildMeshes() {}
}

test('weather gameplay effects are clamped at clear and storm limits', () => {
    const weather = new WeatherSystem();
    weather.rainIntensity = -1;
    weather.windSpeed = 0.5;
    const clear = weather.getGameplayEffects();
    assert.equal(clear.rainFactor, 0);
    assert.equal(clear.windFactor, 0);
    assert.equal(clear.debrisSpeedMultiplier, 1);
    assert.equal(clear.sharkDetectionMultiplier, 1);
    assert.equal(clear.sharkSpeedMultiplier, 1);
    assert.equal(clear.campfireIntensityMultiplier, 1);

    weather.rainIntensity = 10;
    weather.windSpeed = 20;
    const storm = weather.getGameplayEffects();
    assert.equal(storm.rainFactor, 1);
    assert.equal(storm.windFactor, 1);
    assert.equal(storm.debrisWindWeight, 0.4);
    assert.equal(storm.debrisSpeedMultiplier, 1.35);
    assert.equal(storm.sharkDetectionMultiplier, 1.4);
    assert.equal(storm.sharkSpeedMultiplier, 1.2);
    assert.equal(storm.campfireIntensityMultiplier, 0.4);
});

test('water collector only progresses with rain and retains fractions', () => {
    const collector = new TestWaterCollector(null, [0, 0, 0]);
    collector.isBuilt = true;

    collector.update(120, 0);
    assert.equal(collector.waterStored, 0);
    assert.equal(collector.rainProgress, 0);

    collector.update(37.5, 0.6);
    assert.ok(Math.abs(collector.rainProgress - 0.5) < 1e-9);
    collector.update(37.5, 0.6);
    assert.equal(collector.waterStored, 1);
    assert.ok(collector.rainProgress < 1e-9);
});

test('full water collectors stop accumulating rain progress', () => {
    const collector = new TestWaterCollector(null, [0, 0, 0]);
    collector.isBuilt = true;
    collector.waterStored = collector.maxWater;
    collector.rainProgress = 0.25;
    collector.update(90, 1);

    assert.equal(collector.waterStored, collector.maxWater);
    assert.equal(collector.rainProgress, 0.25);
});

test('wind blends debris drift without reversing its island bias', () => {
    const out = new Float32Array(3);
    const baseDirection = new Float32Array([1, 0, 0]);

    blendDriftDirection(out, baseDirection, [-1, 0, 0], 0.4);
    assert.ok(out[0] > 0);
    assert.ok(Math.abs(out[2]) < 1e-6);

    blendDriftDirection(out, baseDirection, [0, 0, 1], 0.4);
    assert.ok(out[0] > out[2]);
    assert.ok(Math.abs(Math.hypot(out[0], out[2]) - 1) < 1e-6);
});

test('strong wind caps debris drift speed at a thirty five percent boost', () => {
    const definition = {
        id: 'test_debris',
        meshScale: [1, 1, 1],
        color: [1, 1, 1],
        driftSpeed: [1, 1],
        lifetime: [100, 100],
        pickupRadius: 1,
    };
    const debris = new DriftingDebris(null, definition, [10, 0.15, 0], {}, 1);
    debris.driftDirection.set([1, 0, 0]);

    debris.update(1, null, {
        windDirection: [1, 0, 0],
        debrisWindWeight: 1,
        debrisSpeedMultiplier: 10,
    });

    assert.ok(Math.abs(debris.position[0] - 11.35) < 1e-6);
});
