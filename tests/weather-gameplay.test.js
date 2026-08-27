import test from 'node:test';
import assert from 'node:assert/strict';

import { WaterCollector } from '../src/entities/WaterCollector.js';
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
