import test from 'node:test';
import assert from 'node:assert/strict';
import { Shelter } from '../src/entities/Shelter.js';
import { ExposureSystem } from '../src/systems/ExposureSystem.js';
import { VitalsSystem } from '../src/systems/VitalsSystem.js';
import { DayNightCycle } from '../src/systems/DayNightCycle.js';
import { getSleepPlan, sleepUntilDawn } from '../src/systems/SleepSystem.js';
import { Inventory } from '../src/systems/InventoryV2.js';
import { InventoryController } from '../src/systems/InventoryController.js';
import { CraftingSystem } from '../src/systems/CraftingSystem.js';

function sleepScene() {
    const shelter = new Shelter(null);
    shelter.isBuilt = true;
    shelter.position.set([0, 1, 0]);
    const dayNight = new DayNightCycle();
    dayNight.timeOfDay = 0.75;
    return {
        shelter, dayNight, player: { position: [0, 2, 0] },
        vitals: new VitalsSystem(), exposure: new ExposureSystem(), creatures: [],
        weather: { elapsed: 0, update(dt) { this.elapsed += dt; },
            getGameplayEffects: () => ({ rainFactor: 1, campfireIntensityMultiplier: 0.4 }) },
        campfire: { position: [0, 1, 0], update(dt, effects) { this.effects = effects; },
            isPlayerInWarmthRange: () => true },
        waterCollector: { elapsed: 0, update(dt, rain) { this.elapsed += dt * rain; } },
        survivalSeconds: 10, stats: { nightsSurvived: 0 },
        saveController: { save() {} }, _isPlayerInExposureWater: () => false,
        _updateExposureStatus() {}, _showNotification() {},
    };
}

test('shelter coverage excludes outside, above roof and unbuilt structure', () => {
    const { shelter } = sleepScene();
    assert.equal(shelter.covers([0, 2, 0]), true);
    assert.equal(shelter.covers([2, 2, 0]), false);
    assert.equal(shelter.covers([0, 4, 0]), false);
    shelter.isBuilt = false;
    assert.equal(shelter.covers([0, 2, 0]), false);
});

test('shelter blocks rain and reduces night cooling, but cannot block immersion', () => {
    const sheltered = new ExposureSystem();
    const outside = new ExposureSystem();
    const swimming = new ExposureSystem();
    sheltered.update(60, { rainFactor: 1, isNight: true, sheltered: true });
    outside.update(60, { rainFactor: 1, isNight: true });
    swimming.update(60, { inWater: true, sheltered: true });
    assert.equal(sheltered.wetness, 0);
    assert.ok(outside.wetness > 0);
    assert.ok(swimming.wetness > 0);
    assert.ok(sheltered.warmth > outside.warmth);
});

test('sleep advances across midnight, charges displayed costs and protects fire', () => {
    const scene = sleepScene();
    scene.vitals.stamina = 5;
    const plan = getSleepPlan(scene);
    assert.equal(plan.allowed, true);
    sleepUntilDawn(scene);
    assert.equal(scene.dayNight.timeOfDay, scene.dayNight.dawnTime);
    assert.ok(Math.abs(scene.vitals.hunger - (100 - plan.hungerCost)) < 1e-7);
    assert.ok(Math.abs(scene.vitals.thirst - (100 - plan.thirstCost)) < 1e-7);
    assert.equal(scene.vitals.stamina, 100);
    assert.equal(scene.vitals.health, 100);
    assert.ok(Math.abs(scene.weather.elapsed - plan.seconds) < 1e-7);
    assert.ok(Math.abs(scene.waterCollector.elapsed - plan.seconds) < 1e-7);
    assert.equal(scene.campfire.effects.campfireIntensityMultiplier, 1);
    assert.equal(scene.stats.nightsSurvived, 1);
    assert.equal(getSleepPlan(scene).allowed, false);
});

test('sleep rejects daytime, danger, wetness and insufficient food without advancing', () => {
    const changes = [
        s => { s.dayNight.timeOfDay = 0.5; },
        s => { s.vitals.thirst = 5; },
        s => { s.vitals.hunger = 5; },
        s => { s.exposure.wetness = 60; },
        s => { s.exposure.warmth = 20; },
        s => { s.creatures.push({ health: 50, attackDamage: 10, position: [5, 1, 0] }); },
        s => { s.shelter.isBuilt = false; },
    ];
    for (const change of changes) {
        const scene = sleepScene();
        change(scene);
        const time = scene.dayNight.timeOfDay;
        assert.equal(sleepUntilDawn(scene).allowed, false);
        assert.equal(scene.dayNight.timeOfDay, time);
        assert.equal(scene.weather.elapsed, 0);
    }
});

test('sleep after midnight advances only to the upcoming dawn', () => {
    const scene = sleepScene();
    scene.dayNight.timeOfDay = 0.1;
    const plan = getSleepPlan(scene);
    assert.ok(Math.abs(plan.seconds - 60) < 1e-7);
});

test('shelter is craftable and placement rejects water without consuming it', () => {
    const inventory = new Inventory(20);
    inventory.addItem('wood', 6);
    inventory.addItem('rope', 2);
    assert.equal(CraftingSystem.craft('shelter', inventory), true);
    assert.equal(inventory.getCount('shelter'), 1);
    assert.equal(inventory.getCount('wood'), 0);
    const slot = inventory.slots.findIndex(item => item?.id === 'shelter');
    inventory.slots[slot] = null;
    inventory.slots[20] = { id: 'shelter', count: 1 };
    const scene = { inventory, shelter: new Shelter(null),
        player: { position: [0, 1, 0], rotation: [0, 0, 0] },
        terrain: { getHeight: () => -1 },
        engine: { audio: { playRaftBuild() {} } }, particleSystem: { emit() {} },
        _showNotification() {},
    };
    const controller = new InventoryController(scene, { document: null });
    assert.equal(controller.placeStructure('shelter'), false);
    assert.ok(inventory.slots[20]);
    scene.terrain.getHeight = () => 1;
    assert.equal(controller.placeStructure('shelter'), true);
    assert.equal(scene.shelter.isBuilt, true);
    assert.equal(inventory.slots[20], null);
    assert.equal(controller.placeStructure('shelter'), false);
});
