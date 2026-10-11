import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, decodeSnapshot } from '../src/systems/SnapshotCodec.js';
import { assertRegistrySnapshot } from '../src/systems/CampaignSnapshotSchema.js';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';
import { ProductionSystem } from '../src/systems/ProductionSystem.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';
import { EndingChallenge } from '../src/systems/EndingChallenge.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';
import { MineExtraction } from '../src/systems/MineExtraction.js';

const fresh = () => worldSnapshot({ mode: 'campaign', generatorVersion: 2, seed: 'schema' });

test('objective pins remain optional for older snapshots and reject invalid chapter/index references', () => {
    const snapshot = fresh(); assert.equal(validateSnapshot(snapshot), true);
    snapshot.campaign.pinnedObjective = { chapter: 1, index: 2 }; assert.equal(validateSnapshot(snapshot), true);
    snapshot.campaign.pinnedObjective = null; assert.equal(validateSnapshot(snapshot), true);
    for (const pin of [{ chapter: 0, index: 0 }, { chapter: 7, index: 0 }, { chapter: 1, index: 4 },
        { chapter: 6, index: 1 }, { chapter: 1, index: .5 }, { chapter: '1', index: 0 }, '1:0']) {
        snapshot.campaign.pinnedObjective = pin; assert.equal(validateSnapshot(snapshot), false);
    }
});

test('mining work is optional for legacy worlds and validated before loading/importing current worlds', () => {
    const snapshot = fresh(); delete snapshot.campaign.mineExtraction; assert.equal(validateSnapshot(snapshot), true);
    snapshot.campaign.mineExtraction = new MineExtraction().snapshot();
    snapshot.campaign.mineExtraction.faces.iron.progress = 2.5; assert.equal(validateSnapshot(snapshot), true);
    for (const mutate of [s => s.faces.iron.progress = 6.01, s => s.faces.copper.batches = -1, s => s.version = 2]) {
        const bad = structuredClone(snapshot); mutate(bad.campaign.mineExtraction); assert.equal(validateSnapshot(bad), false);
    }
});

test('malformed nested saves cannot reach inventory, construction, quest rewards or ending restore', () => {
    const mutations = [
        s => { s.raft = null; }, s => { s.structures.campfire.position = [NaN, 0, 0]; },
        s => { s.inventory.slots[0] = { id: 'constructor', count: 1 }; },
        s => { s.inventory.slots[0] = { id: 'iron_axe', count: 99 }; },
        s => { s.resources.push({ id: 'wood', position: 'bad' }); },
        s => { s.campaign.registry.structures[0].slots = []; },
        s => { s.campaign.registry.structures[0].parentId = 'structure-1'; },
        s => { s.campaign.registry.structures[0].jobs = [{}]; },
        s => { s.campaign.registry.structures[0].fuelSeconds = -10; },
        s => { s.campaign.registry.structures[0].crop = { type: 'unknown', progress: 10, waterSeconds: 10 }; },
        s => { s.campaign.pendingRewards[0].items[0].count = 99; },
        s => { s.campaign.completedChapters = {}; }, s => { s.campaign.facts = []; },
        s => { s.campaign.deathBags = [{ id: 'death-bag-1', position: [0, 0, 0], slots: [] }]; },
        s => { s.campaign.markers = [{ position: [0, 0, 0], label: {} }]; },
        s => { s.campaign.ending = { challenge: {}, towerRepaired: true, pendingRoute: null }; },
    ];
    assert.equal(validateSnapshot(fresh()), true);
    for (const mutate of mutations) { const snapshot = fresh(); mutate(snapshot); assert.equal(validateSnapshot(snapshot), false); }
    const bad = fresh(); bad.campaign.registry.structures[0].jobs = [{}];
    const json = JSON.stringify(bad); let hash = 2166136261;
    for (let i = 0; i < json.length; i++) { hash ^= json.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    assert.equal(decodeSnapshot({ json, checksum: (hash >>> 0).toString(16) }), null, 'a correct checksum does not excuse invalid nested data');
});

test('real queued production and connected doors/roof restore; recipe tampering and displaced dependencies fail atomically', () => {
    const registry = new StructureRegistry({ level: () => 3 }), production = new ProductionSystem(registry), inventory = new ItemContainer(12);
    for (const id of ['wood', 'stone', 'rope', 'fiber', 'iron_ore', 'charcoal']) inventory.addItem(id, 99);
    const { structure: smelter } = registry.place('smelter', [6, 0, 0], 0, inventory);
    production.craft('iron_ingot', inventory, smelter.position); production.addFuel(smelter, inventory); production.update(10);
    const { structure: foundation } = registry.place('foundation', [0, 0, 0], 0, inventory);
    const { structure: doorway } = registry.place('doorway', [0, 0, 0], 0, inventory, { parentId: foundation.id });
    registry.place('door', [0, 0, 0], 0, inventory, { parentId: doorway.id });
    registry.place('roof', [0, 0, 0], 0, inventory, { parentId: foundation.id });
    const saved = registry.snapshot(); assertRegistrySnapshot(saved);
    const loaded = new StructureRegistry(); loaded.restore(saved); assert.equal(loaded.structures.size, 5);
    for (const change of [s => { s.structures[0].jobs[0].ingredients.wood = 50; },
        s => { s.structures[0].jobs[0].output.count = 99; },
        s => { s.structures.find(r => r.type === 'door').position[0] += 10; },
        s => { s.structures.find(r => r.type === 'doorway').parentId = s.structures.find(r => r.type === 'door').id; }]) {
        const invalid = structuredClone(saved); change(invalid);
        assert.throws(() => loaded.restore(invalid)); assert.deepEqual(loaded.snapshot(), saved);
    }
});

test('ending guards reject impossible fuel, power, rocks and hull without replacing a valid active challenge', () => {
    for (const route of ['raft', 'rescue']) {
        const ending = new EndingChallenge(); ending.start(route); const valid = ending.snapshot();
        const invalid = structuredClone(valid); if (route === 'raft') invalid.hull = 1000; else invalid.fuel = 999;
        assert.throws(() => ending.restore(invalid)); assert.deepEqual(ending.snapshot(), valid);
    }
});
