import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignEndings } from '../src/systems/CampaignEndings.js';
import { EndingChallenge } from '../src/systems/EndingChallenge.js';
import { Inventory } from '../src/systems/InventoryV2.js';
import { WaveField } from '../src/shaders/WaterWaves.js';

function fixture({ checkpoint = true, save = async () => true } = {}) {
    const ending = Object.create(CampaignEndings.prototype), inventory = new Inventory(), reports = [];
    for (const [id, count] of Object.entries({ fresh_water: 20, smoked_meal: 10, repair_kit: 10, wood: 40, compass: 1 })) inventory.addItem(id, count);
    let checkpointWrites = 0, saves = 0, closed = 0, cancelled = 0;
    ending.challenge = new EndingChallenge(); ending.busy = false; ending.towerRepaired = true;
    ending.scene = { inventory, activeWorldId: 'world', worldSeed: 'departure',
        raftAssembly: { framePlaced: true, floatsPlaced: true, paddlePlaced: true, sailPlaced: true, motorPlaced: false },
        saveController: { capture: () => ({ beforeDeparture: true }), save: async () => { saves++; return save(); } },
        engine: { worldRepository: { saveWorld: async () => { checkpointWrites++; return checkpoint; } }, input: { setPointerLockEnabled() {} } },
        inventoryController: { renderInventory() {} } };
    ending.controller = { progress: { chapter: 6, questItems: new Set(['island_coordinates']) },
        ui: { report: message => reports.push(message), close: () => { closed++; }, hint() {} },
        fishing: { cancel: () => { cancelled++; } }, hook: { cancel: () => { cancelled++; } } };
    return { ending, inventory, reports, counts: () => ({ checkpointWrites, saves, closed, cancelled }) };
}

test('a failed pre-departure checkpoint leaves supplies, activities and challenge untouched', async () => {
    const f = fixture({ checkpoint: false }), before = f.inventory.snapshot();
    await f.ending.start('raft');
    assert.deepEqual(f.inventory.snapshot(), before); assert.equal(f.ending.state, null); assert.equal(f.ending.busy, false);
    assert.deepEqual(f.counts(), { checkpointWrites: 1, saves: 0, closed: 0, cancelled: 0 });
    assert.match(f.reports.at(-1), /checkpoint/);
});

test('each missing ending prerequisite prevents departure without writing or consuming supplies; motor stays optional', async () => {
    for (const route of ['raft', 'rescue']) {
        const changes = [f => { f.ending.controller.progress.chapter = 5; }, f => { f.ending.controller.progress.questItems.clear(); }];
        if (route === 'raft') {
            for (const flag of ['framePlaced', 'floatsPlaced', 'paddlePlaced', 'sailPlaced']) changes.push(f => { f.ending.scene.raftAssembly[flag] = false; });
            changes.push(f => { f.inventory.removeItem('compass', 1); });
        } else changes.push(f => { f.ending.towerRepaired = false; });
        for (const id of route === 'raft' ? ['fresh_water', 'smoked_meal', 'repair_kit'] : ['fresh_water', 'smoked_meal', 'repair_kit', 'wood']) {
            changes.push(f => { f.inventory.removeItem(id, f.inventory.getCount(id)); });
        }
        for (const change of changes) {
            const f = fixture(); change(f); const before = f.inventory.snapshot();
            assert.equal(f.ending.requirements(route).length, 1); await f.ending.start(route);
            assert.deepEqual(f.inventory.snapshot(), before); assert.equal(f.ending.state, null);
            assert.deepEqual(f.counts(), { checkpointWrites: 0, saves: 0, closed: 0, cancelled: 0 });
        }
    }
    const f = fixture(); assert.deepEqual(f.ending.requirements('raft'), []); await f.ending.start('raft');
    assert.equal(f.ending.state.motor, false); assert.equal(f.ending.state.status, 'active');
});

test('tower repair requires tier and coordinates, consumes its complete bill once and cannot charge twice', () => {
    const f = fixture(), c = f.ending.controller; f.ending.towerRepaired = false;
    for (const [id, count] of Object.entries({ radio: 1, battery: 2, copper_wire: 6, iron_ingot: 3 })) f.inventory.addItem(id, count);
    let events = 0, saves = 0; c.events = { emit: () => { events++; } }; c.saveMilestone = () => { saves++; };
    c.progress.tier = 2; const before = f.inventory.snapshot();
    assert.equal(f.ending.repairTower().ok, false); assert.deepEqual(f.inventory.snapshot(), before);
    c.progress.tier = 3; c.progress.questItems.clear();
    assert.equal(f.ending.repairTower().ok, false); assert.deepEqual(f.inventory.snapshot(), before);
    c.progress.questItems.add('island_coordinates'); assert.equal(f.ending.repairTower().ok, true);
    for (const id of ['radio', 'battery', 'copper_wire', 'iron_ingot']) assert.equal(f.inventory.getCount(id), 0);
    const after = f.inventory.snapshot(); assert.equal(f.ending.repairTower().ok, false);
    assert.deepEqual(f.inventory.snapshot(), after); assert.equal(events, 1); assert.equal(saves, 1);
});

test('both routes refund exact reserved supplies if the active departure save fails or throws', async () => {
    for (const route of ['raft', 'rescue']) for (const throws of [false, true]) {
        const f = fixture({ save: async () => { if (throws) throw new Error('storage interrupted'); return false; } });
        const before = f.inventory.snapshot(); await f.ending.start(route);
        assert.deepEqual(f.inventory.snapshot(), before); assert.equal(f.ending.state, null); assert.equal(f.ending.busy, false);
        assert.deepEqual(f.counts(), { checkpointWrites: 1, saves: 1, closed: 0, cancelled: 0 });
        assert.ok(f.reports.at(-1).length > 0);
    }
});

test('departure cannot advance or launch twice while its save is pending; retry consumes supplies once', async () => {
    let finish, entered;
    const saving = new Promise(resolve => { entered = resolve; });
    const f = fixture({ save: () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
    const before = f.inventory.snapshot(), start = f.ending.start('raft'); await saving;
    assert.equal(f.ending.busy, true); assert.equal(f.ending.update(10), true); assert.equal(f.ending.state.elapsed, 0);
    await f.ending.start('raft'); assert.equal(f.counts().checkpointWrites, 1);
    finish(false); await start; assert.deepEqual(f.inventory.snapshot(), before);
    f.ending.scene.saveController.save = async () => true;
    await f.ending.start('raft');
    assert.equal(f.ending.state.status, 'active'); assert.equal(f.ending.busy, false);
    assert.equal(f.inventory.getCount('fresh_water'), 14); assert.equal(f.inventory.getCount('smoked_meal'), 7);
    assert.equal(f.inventory.getCount('repair_kit'), 7); assert.equal(f.counts().closed, 1); assert.equal(f.counts().cancelled, 2);
});

test('all raft modules and the player share the current world-space wave height, including disabled waves', () => {
    const f = fixture(); f.ending.challenge.start('raft', { seed: 'floating' });
    f.ending.oceanOrigin = [150, 0.15, 200]; f.ending.oceanYaw = 0.7; f.ending.state.along = 400;
    for (const enabled of [true, false]) for (const time of [0, 1, 5, 9]) {
        WaveField.sync(time, 4, 1, [1, 0, 1], 20, 80, enabled);
        const position = f.ending.raftPosition();
        assert.ok(Math.abs(position[1] - 0.15 - WaveField.heightAt(position[0], position[2])) < 1e-8);
        assert.equal(position[0], 150 + Math.sin(0.7) * 400); assert.equal(position[2], 200 + Math.cos(0.7) * 400);
        if (!enabled) assert.equal(position[1], 0.15);
    }
});
