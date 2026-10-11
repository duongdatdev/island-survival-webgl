import test from 'node:test';
import assert from 'node:assert/strict';
import { RepairCircuit, assertCircuitSnapshot } from '../src/systems/RepairCircuit.js';
import { CampaignController } from '../src/systems/CampaignController.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';
import { GameEvents } from '../src/systems/GameEvents.js';
import { CampaignProgression } from '../src/systems/CampaignProgression.js';
import { validateSnapshot } from '../src/systems/SnapshotCodec.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';

test('100 circuit seeds produce different solvable routes through three sensors, and never start solved', () => {
    const paths = new Set();
    for (let seed = 0; seed < 100; seed++) {
        const circuit = new RepairCircuit('circuit-' + seed);
        paths.add(circuit.layout.path.join(',')); assert.equal(circuit.status().complete, false);
        assert.equal(circuit.layout.sensors.length, 3); assert.ok(circuit.layout.path.length >= 15);
        assert.equal(circuit.test().ok, false); circuit.installed = true;
        assert.equal(circuit.test().ok, false); circuit.rotations.fill(0);
        assert.equal(circuit.status().complete, true); assert.equal(circuit.test().ok, true);
        const attempts = circuit.attempts; assert.equal(circuit.test().ok, false); assert.equal(circuit.attempts, attempts);
        assert.equal(circuit.rotate(0), false); assert.equal(circuit.reset(), false);
    }
    assert.ok(paths.size > 50);
});

test('partial circuit state restores precisely; reset retains materials and corrupt solved states cannot enter a world', () => {
    const circuit = new RepairCircuit('resume'); circuit.installed = true; circuit.rotate(7); circuit.rotate(8); circuit.test();
    const restored = new RepairCircuit('resume'); restored.restore(circuit.snapshot()); assert.deepEqual(restored.snapshot(), circuit.snapshot());
    restored.reset(); assert.equal(restored.installed, true);
    const snapshot = worldSnapshot({ mode: 'campaign', generatorVersion: 2, seed: 'resume' }); snapshot.campaign.stationCircuit = restored.snapshot();
    assert.equal(validateSnapshot(snapshot), false);
    snapshot.campaign.facts['deviceRepaired:station_gate'] = 1;
    assert.equal(validateSnapshot(snapshot), true);
    for (const mutate of [s => { s.rotations = [0]; }, s => { s.rotations[0] = 99; }, s => { s.solved = true; }, s => { s.installed = 'yes'; }]) {
        const bad = structuredClone(restored.snapshot()); mutate(bad); assert.throws(() => assertCircuitSnapshot(bad, 'resume'));
        snapshot.campaign.stationCircuit = bad; assert.equal(validateSnapshot(snapshot), false);
    }
    restored.rotations.fill(0); restored.test(); snapshot.campaign.stationCircuit = restored.snapshot();
    assert.equal(validateSnapshot(snapshot), false);
    snapshot.campaign.facts['deviceRepaired:station_console'] = 1; assert.equal(validateSnapshot(snapshot), true);
    // Completed pre-puzzle worlds retain their old console fact and need no extra materials.
    delete snapshot.campaign.stationCircuit; assert.equal(validateSnapshot(snapshot), true);
    circuit.restore(null); assert.equal(circuit.installed, false);
});

test('station installation consumes exact materials once, persists independently of the bag, and repair unlocks only on a complete circuit', () => {
    const c = Object.create(CampaignController.prototype); c.scene = { inventory: new ItemContainer(28), player: { position: [0, 1, 0] }, engine: { audio: { playCraft() {} } } };
    c.journals = { station_coordinates: { position: [0, 1, 0] } }; c.events = new GameEvents(); c.progress = new CampaignProgression(c.events);
    c.stationCircuit = new RepairCircuit('station'); c.saveMilestone = () => {};
    c.scene.inventory.addItem('iron_ingot', 4); c.scene.inventory.addItem('copper_ingot', 2);
    assert.equal(c.installStationCircuit().ok, false); assert.equal(c.scene.inventory.getCount('iron_ingot'), 4);
    c.events.emit('deviceRepaired', { id: 'station_gate' }); assert.equal(c.installStationCircuit().ok, true);
    assert.equal(c.scene.inventory.getCount('iron_ingot'), 0); assert.equal(c.scene.inventory.getCount('copper_ingot'), 0);
    assert.equal(c.installStationCircuit().ok, true); assert.equal(c.testStationCircuit().ok, false);
    assert.equal(c.progress.facts['deviceRepaired:station_console'], undefined);
    c.stationCircuit.rotations.fill(0); assert.equal(c.testStationCircuit().ok, true);
    assert.equal(c.progress.facts['deviceRepaired:station_console'], 1); assert.equal(c.testStationCircuit().ok, false);
});
