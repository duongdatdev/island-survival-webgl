import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignController } from '../src/systems/CampaignController.js';
import { CampaignProgression } from '../src/systems/CampaignProgression.js';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';
import { ProductionSystem } from '../src/systems/ProductionSystem.js';
import { Inventory } from '../src/systems/InventoryV2.js';
import { GameEvents } from '../src/systems/GameEvents.js';
import { ExposureSystem } from '../src/systems/ExposureSystem.js';
import { VitalsSystem } from '../src/systems/VitalsSystem.js';
import { DayNightCycle } from '../src/systems/DayNightCycle.js';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { SpatialGrid } from '../src/systems/SpatialGrid.js';
import { getSleepPlan } from '../src/systems/SleepSystem.js';
import { CAMPAIGN_BALANCE, CAMPAIGN_DIFFICULTY } from '../src/gameplay/CampaignDatabase.js';
import { WreckSalvage } from '../src/systems/WreckSalvage.js';

function fixture(difficulty = 'standard') {
    const c = Object.create(CampaignController.prototype); c.events = new GameEvents(); c.progress = new CampaignProgression(c.events);
    c.registry = new StructureRegistry({ level: () => 3 }); c.production = new ProductionSystem(c.registry);
    c.collision = new TriangleCollision(); c.environmentIndex = new SpatialGrid();
    c.refreshCollision = () => {}; c.saveMilestone = () => {}; c.deaths = 0; c.deathBags = []; c.nextBag = 1; c.playSeconds = 123;
    c.difficulty = CAMPAIGN_DIFFICULTY[difficulty]; c.fishing = { cancel() {} }; c.hook = { cancel() {} }; c.wreckSalvage = new WreckSalvage();
    c.islandEvents = { time: 0, update(dt) { this.time += dt; } };
    const inventory = new Inventory();
    for (const id of ['wood', 'stone', 'rope', 'fiber', 'iron_ore', 'carrot_seed', 'fresh_water', 'barrel']) inventory.addItem(id, 50);
    const dayNight = new DayNightCycle(); dayNight.daySpeed = 1 / CAMPAIGN_BALANCE.daySeconds; dayNight.timeOfDay = 0.9;
    c.scene = { inventory, vitals: new VitalsSystem(), exposure: new ExposureSystem(), dayNight,
        player: { position: new Float32Array([0, 1.9, 0]), velocity: new Float32Array(3), collider: { radius: 0.28, height: 1.8 }, updateModelMatrix() {} },
        creatures: [], camera: {}, terrain: { getHeight: () => 1 }, world: { spawnPosition: [20, 1, 0] }, removedEnvironmentObjectIds: new Set(),
        inventoryController: { renderInventory() {} }, stats: { nightsSurvived: 0 }, survivalSeconds: 100,
        _isPlayerInExposureWater: () => false, _updateExposureStatus() {}, _showNotification() {},
        weather: { elapsed: 0, currentWeather: 'rain', update(dt) { this.elapsed += dt; }, getGameplayEffects: () => ({ rainFactor: 1 }) },
        shelter: { covers: point => c.registry.sheltered(point) } };
    c.scene.vitals.hungerDrainRate = CAMPAIGN_BALANCE.hungerDrainPerSecond * c.difficulty.metabolism;
    c.scene.vitals.thirstDrainRate = CAMPAIGN_BALANCE.thirstDrainPerSecond * c.difficulty.metabolism;
    c.scene.vitals.onGameOver = () => c.onDeath();
    const { structure: foundation } = c.registry.place('foundation', [0, 0, 0], 0, inventory);
    c.registry.place('roof', [0, 0, 0], 0, inventory, { parentId: foundation.id });
    return c;
}
test('oxygen recharges on dry land, respects equipment capacity and is reset after drowning/respawn', () => {
    const c = fixture(); c.oxygen = 0;
    c.afterMovement(1); assert.equal(c.oxygen, 15); c.afterMovement(2); assert.equal(c.oxygen, 45);
    c.scene.inventory.addItem('dive_kit', 1); c.afterMovement(5); assert.equal(c.oxygen, 120);
    c.scene.terrain.getHeight = () => -5; c.scene.engine = { input: { isKeyDown: () => false } }; c.ui = { hint() {} }; c.swimY = -2;
    c.afterMovement(30); assert.equal(c.oxygen, 90);
    c.scene.terrain.getHeight = () => 1; c.oxygen = 0; c.onDeath(); assert.equal(c.oxygen, 45);
});

test('grounding a raised step cannot push the head through its low ceiling', () => {
    const c = fixture(), s = c.scene;
    const plane = new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    c.collision.add('step', plane, [0, 1.4, 0]); c.collision.add('roof', plane, [0, 2.95, 0]);
    s.player.position.set([0, 1.9, -2]);
    for (let i = 0; i < 100; i++) {
        const previous = Array.from(s.player.position); s.player.position[2] += 0.04; s.player.position[1] = 1.9;
        c.afterMovement(0.02, previous);
        assert.equal(c.collision.capsuleClear(s.player.position), true);
    }
    assert.ok(s.player.position[2] < -1.27);
});

test('death interrupts held salvage without losing completed work or awarding its pending materials', () => {
    const c = fixture(); c.wreckSalvage.start('cargo', c.scene.inventory);
    c.wreckSalvage.update(2, c.scene.inventory, { held: true, eligible: true }); c.onDeath();
    assert.equal(c.wreckSalvage.active, null); assert.equal(c.wreckSalvage.parts.cargo.progress, 2);
    assert.equal(c.wreckSalvage.parts.cargo.claimed, false); assert.equal(c.scene.inventory.getCount('scrap'), 0);
});

test('a wreck ceiling blocks surfacing, keeps consuming oxygen, and drowning does not drag the respawn back underwater', () => {
    const c = fixture(), s = c.scene;
    s.terrain.getHeight = () => -8; s.player.position.set([0, -2.2, 0]); c.swimY = -2.2; c.oxygen = 20;
    s.engine = { input: { isKeyDown: key => key === 'Space' } }; c.ui = { hint() {} };
    const plane = new Float32Array([-2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2]);
    c.collision.add('deck', plane, [0, -1.2, 0]);
    c.afterMovement(1, [0, -2.2, 0]); assert.ok(s.player.position[1] < -2.099); assert.equal(c.oxygen, 19);
    const previous = Array.from(s.player.position); c.afterMovement(1, previous);
    assert.ok(s.player.position[1] < -2.099); assert.equal(c.oxygen, 18); assert.equal(c.swimY, s.player.position[1]);
    s.terrain.getHeight = (x) => x > 10 ? 1 : -8; c.oxygen = 0; s.vitals.health = 1;
    c.afterMovement(1, Array.from(s.player.position));
    assert.equal(c.deaths, 1); assert.ok(s.player.position[0] > 10); assert.ok(s.player.position[1] > 1);
    assert.equal(c.swimY, undefined); assert.equal(c.oxygen, 45);
});
test('Campaign sleep preserves actual play time while advancing production, watered crops, weather and event time', () => {
    const c = fixture(), s = c.scene;
    const fire = c.registry.place('campfire', [3, 0, 0], 0, s.inventory).structure;
    const smelter = c.registry.place('smelter', [6, 0, 0], 0, s.inventory).structure;
    const planter = c.registry.place('planter', [10, 0, 0], 0, s.inventory).structure;
    c.production.addFuel(fire, s.inventory, 'wood', 10); c.production.addFuel(smelter, s.inventory, 'wood', 10);
    c.production.craft('iron_ingot', s.inventory, smelter.position); c.production.craft('iron_ingot', s.inventory, smelter.position);
    c.production.plant(planter, 'carrot', s.inventory);
    const plan = getSleepPlan(s); assert.equal(plan.allowed, true); c.sleep();
    assert.equal(c.playSeconds, 123); assert.equal(s.dayNight.timeOfDay, s.dayNight.dawnTime);
    assert.ok(Math.abs(s.vitals.hunger - (100 - plan.hungerCost)) < 1e-6);
    assert.ok(Math.abs(s.vitals.thirst - (100 - plan.thirstCost)) < 1e-6);
    assert.ok(Math.abs(s.weather.elapsed - plan.seconds) < 1e-6); assert.ok(Math.abs(c.islandEvents.time - plan.seconds) < 1e-6);
    assert.ok(Math.abs(planter.crop.progress - plan.seconds) < 1e-6);
    assert.equal(smelter.container.getCount('iron_ingot'), 2); assert.equal(c.production.isBurning(smelter), false);
    assert.ok(Math.abs(fire.fuelSeconds - (1200 - plan.seconds)) < 1e-6); assert.equal(s.stats.nightsSurvived, 1);
});

test('chosen incomplete objectives override the automatic tracker and completed or older pins safely fall back', () => {
    const c = fixture();
    assert.equal(c.trackedObjective().label, c.progress.objectives()[0].label);
    assert.equal(c.pinObjective(2).ok, true); assert.equal(c.trackedObjective().label, c.progress.objectives()[2].label);
    c.events.emit('structurePlaced', { type: 'campfire' });
    assert.equal(c.trackedObjective().label, c.progress.objectives()[0].label);
    assert.equal(c.pinObjective(2).ok, true); assert.equal(c.pinnedObjective, null, 'a completed pin can be cleared');
    assert.equal(c.pinObjective(2).ok, false); assert.equal(c.pinObjective(-1).ok, false); assert.equal(c.pinObjective(1.5).ok, false);
    assert.equal(c.pinObjective(1).ok, true); c.progress.chapter = 2;
    assert.equal(c.trackedObjective().label, c.progress.objectives()[0].label, 'old chapter pin is not applied to a new chapter');
});

test('real play time includes gameplay panels and their opening frame, while pause and ending result screens do not advance it', () => {
    const c = fixture(); let pressed = null;
    c.scene.engine = { input: { isKeyPressed: key => key === pressed, consumeKey() {} } };
    c.ui = { isOpen: true, kind: 'field-survey', open(kind) { this.isOpen = true; this.kind = kind; } };
    for (const kind of ['field-survey', 'repair-circuit', 'journal', 'craft', 'structure', 'map', 'note']) {
        c.ui.kind = kind; const before = c.playSeconds; assert.equal(c.handleInput(2), true); assert.equal(c.playSeconds, before + 2);
    }
    const before = c.playSeconds;
    for (const kind of ['ending-result', 'ending-save-error', 'ending-abandon']) { c.ui.kind = kind; c.handleInput(4); assert.equal(c.playSeconds, before); }
    c.ui.isOpen = false; c.scene.isPaused = true; assert.equal(c.handleInput(4), false); assert.equal(c.playSeconds, before);
    c.scene.isPaused = false; c.ending = { state: { route: 'raft' } }; assert.equal(c.handleInput(4), false); assert.equal(c.playSeconds, before);
    c.ending.state = null; c.placement = null; c.fishing.state = c.hook.state = null;
    assert.equal(c.handleInput(4), false); assert.equal(c.playSeconds, before, 'ordinary simulation and endings own their existing time increments');
    pressed = 'KeyJ'; assert.equal(c.handleInput(0.1), true); assert.equal(c.playSeconds, before + 0.1);
});
test('Campaign sleep stops on death and does not award a completed night; daytime rejection advances nothing', () => {
    const c = fixture(), s = c.scene; s.dayNight.timeOfDay = 0.5; c.sleep(); assert.equal(s.weather.elapsed, 0);
    s.dayNight.timeOfDay = 0.9; s.vitals.health = 0.001; s.exposure.warmth = 40; s.exposure.wetness = 40;
    c.sleep(); assert.equal(c.deaths, 1); assert.equal(s.stats.nightsSurvived, 0); assert.equal(c.playSeconds, 123);
    assert.ok(s.weather.elapsed < 540); assert.equal(s.vitals._isGameOver, false);
});
test('difficulty death rules retain protected progress and produce exactly the expected persistent bag contents', () => {
    for (const difficulty of ['relaxed', 'standard', 'harsh']) {
        const c = fixture(difficulty), s = c.scene; s.inventory.slots.fill(null);
        s.inventory.slots[0] = { id: 'stone', count: 3 }; s.inventory.slots[20] = { id: 'iron_axe', count: 1 };
        c.progress.questItems.add('island_coordinates'); s.vitals._isGameOver = true; c.onDeath();
        assert.equal(c.progress.questItems.has('island_coordinates'), true); assert.equal(s.vitals._isGameOver, false);
        assert.equal(c.deaths, 1); assert.equal(c.respawnProtection, 4);
        assert.equal(s.inventory.getCount('stone'), difficulty === 'relaxed' ? 3 : 0);
        assert.equal(s.inventory.getCount('iron_axe'), difficulty === 'harsh' ? 0 : 1);
        assert.equal(c.deathBags.length, difficulty === 'relaxed' ? 0 : 1);
        if (c.deathBags[0]) { assert.equal(c.deathBags[0].container.getCount('stone'), 3); assert.equal(c.deathBags[0].container.getCount('iron_axe'), difficulty === 'harsh' ? 1 : 0); }
        s.inventory.slots.fill(null); const bags = c.deathBags.length; c.onDeath(); assert.equal(c.deathBags.length, bags);
    }
});
