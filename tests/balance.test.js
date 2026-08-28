import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    PLAYER_BALANCE,
    SURVIVAL_BALANCE,
    ENVIRONMENT_BALANCE,
    CREATURE_BALANCE,
} from '../src/gameplay/BalanceConfig.js';
import { VitalsSystem } from '../src/systems/VitalsSystem.js';
import { DayNightCycle } from '../src/systems/DayNightCycle.js';
import { WeatherSystem } from '../src/systems/WeatherSystem.js';
import { CreatureState } from '../src/entities/Creature.js';
import { Crab } from '../src/entities/Crab.js';
import { Seagull } from '../src/entities/Seagull.js';
import { Boar } from '../src/entities/Boar.js';
import { Shark } from '../src/entities/Shark.js';
import { Player } from '../src/entities/Player.js';
import { AssetManager } from '../src/core/AssetManager.js';
import { ModelAsset } from '../src/renderer/ModelAsset.js';

test('movement match-ups preserve an escape option', () => {
    assert.ok(PLAYER_BALANCE.walkSpeed > CREATURE_BALANCE.boar.baseSpeed);
    assert.ok(PLAYER_BALANCE.sprintSpeed > CREATURE_BALANCE.shark.baseSpeed);
    assert.ok(CREATURE_BALANCE.boar.chargeSpeed > PLAYER_BALANCE.sprintSpeed);
    assert.ok(CREATURE_BALANCE.shark.rushSpeed > PLAYER_BALANCE.sprintSpeed);
});

test('passive wildlife keeps zero attack stats', () => {
    const crab = new Crab(null, [0, 0, 0]);
    const gull = new Seagull(null, [0, 10, 0]);

    assert.equal(crab.attackRange, 0);
    assert.equal(crab.attackDamage, 0);
    assert.equal(crab.attackCooldown, 0);
    assert.equal(gull.attackRange, 0);
    assert.equal(gull.attackDamage, 0);
    assert.equal(gull.attackCooldown, 0);
});

test('creatures do not dispose shared model assets', () => {
    const sharedModel = {
        deleteCalls: 0,
        delete() { this.deleteCalls++; },
    };
    const first = new Crab(null, [0, 0, 0], sharedModel);
    const second = new Crab(null, [1, 0, 0], sharedModel);

    assert.equal(first.modelAsset, second.modelAsset);
    assert.deepEqual(Array.from(first.scale), [1, 1, 1]);

    first.delete();
    assert.equal(sharedModel.deleteCalls, 0);
    assert.equal(second.modelAsset, sharedModel);
});

test('creature manifest maps canonical ids to renamed GLB files', async () => {
    const manifestUrl = new URL('../assets/creatures/manifest.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const paths = Object.fromEntries(manifest.models.map(model => [model.id, model.path]));

    assert.deepEqual(paths, {
        boar: 'assets/creatures/boar.glb',
        crab: 'assets/creatures/crab.glb',
        seagull: 'assets/creatures/seagull.glb',
        shark: 'assets/creatures/shark.glb',
    });

    assert.ok(manifest.models.every(model => model.preserveAspect === true));
    const boar = manifest.models.find(model => model.id === 'boar');
    assert.deepEqual(boar.targetSize, [0.433, 0.7, 1.247]);
});

test('aspect-preserving model normalization uses one scale on every axis', () => {
    const matrix = ModelAsset._createNormalizationMatrix(
        { min: [-29, -47, -84], max: [29, 47, 84] },
        [0.31, 0.5, 0.89],
        0,
        true
    );

    assert.ok(Math.abs(matrix[0] - matrix[5]) < 1e-9);
    assert.ok(Math.abs(matrix[5] - matrix[10]) < 1e-9);
    assert.ok(Math.abs(94 * matrix[5] - 0.5) < 1e-6);
});

test('a failed GLB load resolves to the procedural fallback path', async () => {
    const assets = new AssetManager(null);
    assets.gltfIO = {
        read: async () => { throw new Error('missing test model'); },
    };

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const model = await assets.loadGLTFModel(
            'creature:missing',
            'assets/creatures/missing.glb',
            { targetSize: [1, 1, 1] }
        );
        assert.equal(model, null);
    } finally {
        console.error = originalConsoleError;
    }

    assert.equal(assets.getModel('creature:missing'), null);
    assert.equal(assets.totalAssets, 1);
    assert.equal(assets.loadedAssets, 1);
});

test('seagull orbit respects its configured linear speed', () => {
    const gull = new Seagull(null, [0, 10, 0]);
    gull._circleCenterX = 0;
    gull._circleCenterZ = 0;
    gull._circleRadius = 10;
    gull._circleAngle = 0;
    gull.position[0] = 10;
    gull.position[2] = 0;

    gull._circle(0.1);
    const travelled = Math.hypot(gull.position[0] - 10, gull.position[2]);
    assert.ok(Math.abs(travelled - CREATURE_BALANCE.seagull.baseSpeed * 0.1) < 0.001);
});

test('walking is free and exhausted sprint recovers without flicker', () => {
    const vitals = new VitalsSystem();

    vitals.update(5, false);
    assert.equal(vitals.stamina, 100);

    vitals.update(10, true);
    assert.equal(vitals.stamina, 0);
    assert.equal(vitals.canSprint(), false);

    vitals.update(1, false);
    assert.equal(vitals.stamina, PLAYER_BALANCE.staminaRegenPerSecond);
    assert.equal(vitals.canSprint(), false);

    vitals.update(0.5, false);
    assert.equal(vitals.canSprint(), true);
});

test('player movement accelerates, decelerates, and normalizes diagonals', () => {
    const player = new Player();
    const pressed = new Set(['moveForward']);
    const input = { isKeyDown: action => pressed.has(action) };
    const camera = { position: [0, 1, 0], target: [0, 1, 1] };
    const terrain = { getHeight: () => 0, generator: null };

    player.update(0.1, input, camera, terrain);
    assert.ok(Math.abs(player.currentSpeed - 1.8) < 1e-6);

    player.update(0.1, input, camera, terrain);
    assert.ok(Math.abs(player.currentSpeed - PLAYER_BALANCE.walkSpeed) < 1e-6);

    pressed.add('moveRight');
    player.update(1, input, camera, terrain);
    assert.ok(Math.abs(player.currentSpeed - PLAYER_BALANCE.walkSpeed) < 1e-6);

    pressed.clear();
    player.update(0.1, input, camera, terrain);
    assert.ok(player.currentSpeed < PLAYER_BALANCE.walkSpeed);
    player.update(0.1, input, camera, terrain);
    assert.equal(player.currentSpeed, 0);
});

test('survival vitals reach the intended five minute pressure point', () => {
    const vitals = new VitalsSystem();

    vitals.update(300, false);

    assert.ok(Math.abs(vitals.hunger - 70) < 1e-9);
    assert.ok(Math.abs(vitals.thirst - 58) < 1e-9);
    assert.equal(vitals.health, 100);
    assert.equal(vitals.hungerDrainRate, SURVIVAL_BALANCE.hungerDrainPerSecond);
    assert.equal(vitals.thirstDrainRate, SURVIVAL_BALANCE.thirstDrainPerSecond);
});

test('depletion damage is stable across different update sizes', () => {
    const singleStep = new VitalsSystem();
    const smallSteps = new VitalsSystem();

    singleStep.update(720, false);
    for (let elapsed = 0; elapsed < 720; elapsed += 0.1) {
        smallSteps.update(0.1, false);
    }

    assert.ok(Math.abs(singleStep.hunger - smallSteps.hunger) < 0.001);
    assert.ok(Math.abs(singleStep.thirst - smallSteps.thirst) < 0.001);
    assert.ok(Math.abs(singleStep.health - smallSteps.health) < 0.01);
});

test('day night cycle completes one day in ten minutes', () => {
    const cycle = new DayNightCycle();
    const initialTime = cycle.timeOfDay;

    cycle.update(ENVIRONMENT_BALANCE.dayDurationSeconds);

    assert.ok(Math.abs(cycle.timeOfDay - initialTime) < 1e-9);
    assert.equal(cycle.daySpeed, 1 / 600);
});

test('celestial orbit keeps the sun above the horizon during daytime', () => {
    const cycle = new DayNightCycle();
    cycle.timeOfDay = (13 * 60 + 28) / (24 * 60);

    const sunDirection = cycle.getSunDirection();
    const moonDirection = cycle.getMoonDirection();
    assert.ok(sunDirection[1] > 0);
    assert.ok(moonDirection[1] < 0);
    for (let index = 0; index < 3; index++) {
        assert.ok(Math.abs(sunDirection[index] + moonDirection[index]) < 1e-9);
    }
});

test('celestial orbit raises the moon at midnight', () => {
    const cycle = new DayNightCycle();
    cycle.timeOfDay = 0;

    assert.ok(cycle.getSunDirection()[1] < 0);
    assert.ok(cycle.getMoonDirection()[1] > 0);
});

test('weather states last two to four minutes with a twelve second transition', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const weather = new WeatherSystem();
        weather._pickNextWeather();

        assert.equal(weather.transitionDuration, 12);
        assert.equal(weather.weatherDuration, 180);
        assert.ok(weather.weatherDuration >= ENVIRONMENT_BALANCE.weatherDurationMinSeconds);
        assert.ok(weather.weatherDuration <= ENVIRONMENT_BALANCE.weatherDurationMaxSeconds);
    } finally {
        Math.random = originalRandom;
    }
});

test('boar charge has a wind-up and locks its direction', () => {
    const boar = new Boar(null, [0, 0, 0]);
    boar.state = CreatureState.CHASE;

    boar._updateChase(0.016, 4, [4, 0, 0]);
    assert.equal(boar._chargePhase, 'windup');
    assert.equal(boar.position[0], 0);

    boar._updateChase(CREATURE_BALANCE.boar.chargeWindup, 4, [4, 0, 0]);
    assert.equal(boar._chargePhase, 'charging');

    boar._updateChase(0.1, 4, [0, 0, 4]);
    assert.ok(boar.position[0] > 0);
    assert.equal(boar.position[2], 0);
});

test('shark rush uses one capped movement step', () => {
    const shark = new Shark(null, [0, 0.1, 0]);
    shark.state = CreatureState.CHASE;
    shark.update(0.1, [4, 0.1, 0], null, 0);

    assert.ok(Math.abs(shark.position[0] - CREATURE_BALANCE.shark.rushSpeed * 0.1) < 1e-6);
    assert.ok(Math.abs(shark.position[2]) < 1e-6);
});

test('storms increase shark detection without changing clear behavior', () => {
    const clearShark = new Shark(null, [0, 0.1, 0]);
    clearShark.update(0.01, [9, 0.1, 0], null, 0, {
        sharkDetectionMultiplier: 1,
        sharkSpeedMultiplier: 1,
    });
    assert.notEqual(clearShark.state, CreatureState.CHASE);

    const stormShark = new Shark(null, [0, 0.1, 0]);
    stormShark.update(0.01, [9, 0.1, 0], null, 0, {
        sharkDetectionMultiplier: 10,
        sharkSpeedMultiplier: 1,
    });
    assert.equal(stormShark.state, CreatureState.CHASE);
});

test('storms cap shark chase and rush speed at a twenty percent boost', () => {
    const shark = new Shark(null, [0, 0.1, 0]);
    shark.state = CreatureState.CHASE;
    shark.update(0.1, [4, 0.1, 0], null, 0, {
        sharkDetectionMultiplier: 1,
        sharkSpeedMultiplier: 10,
    });

    const expectedDistance = CREATURE_BALANCE.shark.rushSpeed * 1.2 * 0.1;
    assert.ok(Math.abs(shark.position[0] - expectedDistance) < 1e-6);
    assert.ok(Math.abs(shark.position[2]) < 1e-6);
});
