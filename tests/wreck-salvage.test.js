import test from 'node:test';
import assert from 'node:assert/strict';
import { WreckSalvage, WRECK_PARTS, assertWreckSalvageSnapshot } from '../src/systems/WreckSalvage.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';
import { CampaignController } from '../src/systems/CampaignController.js';
import { validateSnapshot } from '../src/systems/SnapshotCodec.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';

test('salvage advances only while held at an eligible site; release and reload retain work without offline progress', () => {
    const salvage = new WreckSalvage(), inventory = new ItemContainer(4);
    salvage.start('cargo', inventory); salvage.update(2, inventory, { held: true, eligible: true });
    assert.equal(salvage.parts.cargo.progress, 2);
    salvage.update(10, inventory, { held: false, eligible: true }); assert.equal(salvage.active, null);
    salvage.update(100, inventory, { held: true, eligible: true }); assert.equal(salvage.parts.cargo.progress, 2);
    salvage.start('cargo', inventory); salvage.update(3, inventory, { held: true, eligible: false });
    assert.equal(salvage.parts.cargo.progress, 2); assert.equal(salvage.active, null);
    salvage.start('cargo', inventory); const saved = salvage.snapshot(), loaded = new WreckSalvage(); loaded.restore(saved);
    assert.equal(loaded.active, null); assert.deepEqual(loaded.snapshot(), saved);
    for (const seconds of [NaN, Infinity, -1]) assert.throws(() => loaded.update(seconds, inventory));
    loaded.start('cargo', inventory); assert.equal(loaded.update(4, inventory, { held: true, eligible: true }).claimed, 'cargo');
    assert.equal(inventory.getCount('scrap'), 8); assert.equal(loaded.start('cargo', inventory).ok, false);
});

test('full bag keeps all wiring rewards pending atomically and permits exactly one later claim', () => {
    const salvage = new WreckSalvage(), bag = new ItemContainer(1); bag.addItem('scrap', 90);
    salvage.start('wiring', bag);
    assert.equal(salvage.update(5, bag, { held: true, eligible: true }).waiting, true);
    assert.equal(bag.getCount('scrap'), 90); assert.equal(bag.getCount('copper_ingot'), 0);
    assert.equal(salvage.parts.wiring.progress, 5); assert.equal(salvage.parts.wiring.claimed, false);
    const loaded = new WreckSalvage(); loaded.restore(salvage.snapshot());
    const roomy = new ItemContainer(4);
    assert.equal(loaded.start('wiring', roomy).claimed, 'wiring'); assert.equal(loaded.start('wiring', roomy).ok, false);
    assert.equal(roomy.getCount('scrap'), 6); assert.equal(roomy.getCount('copper_ingot'), 4);
    for (const def of WRECK_PARTS.filter(def => def.id !== 'wiring')) {
        loaded.start(def.id, roomy); loaded.update(def.seconds, roomy, { held: true, eligible: true });
    }
    assert.equal(loaded.allClaimed(), true); assert.equal(roomy.getCount('scrap'), 20);
    const legacy = new WreckSalvage(); legacy.restore(null, true);
    assert.equal(legacy.allClaimed(), true); for (const def of WRECK_PARTS) assert.equal(legacy.start(def.id, roomy).ok, false);
});

test('salvage restore rejects invalid parts without replacing current progress and codec enforces completion facts', () => {
    const salvage = new WreckSalvage(), bag = new ItemContainer(4);
    salvage.start('cargo', bag); salvage.update(2, bag, { held: true, eligible: true }); const saved = salvage.snapshot();
    for (const mutate of [s => delete s.parts.wiring, s => { s.parts.cargo.progress = 7; }, s => { s.parts.cargo.claimed = true; }, s => { s.parts.extra = {}; }]) {
        const bad = structuredClone(saved); mutate(bad); assert.throws(() => salvage.restore(bad)); assert.deepEqual(salvage.snapshot(), saved);
    }
    assertWreckSalvageSnapshot(saved);
    const snapshot = worldSnapshot({ mode: 'campaign', generatorVersion: 2, seed: 'salvage' }); snapshot.campaign.wreckSalvage = saved;
    assert.equal(validateSnapshot(snapshot), true);
    snapshot.campaign.claimedCaches = ['wreck_salvage']; assert.equal(validateSnapshot(snapshot), false);
    salvage.restore(null, true); snapshot.campaign.wreckSalvage = salvage.snapshot(); assert.equal(validateSnapshot(snapshot), false);
    snapshot.campaign.facts['deviceRepaired:wreck_salvage'] = 1; assert.equal(validateSnapshot(snapshot), true);
});

test('controller requires underwater kit, range, tools and unblocked access before starting work', () => {
    const c = Object.create(CampaignController.prototype), inventory = new ItemContainer(8), notices = [];
    c.wreckSalvage = new WreckSalvage(); c.scene = { inventory, player: { position: [0, -2, 0] }, _showNotification: text => notices.push(text) };
    let blocked = false; c.collision = { segmentBlocked: (a, b, options) => {
        assert.deepEqual([...options.ignoreInstances], ['wreck-part-cargo']); return blocked;
    } };
    const node = { ...WRECK_PARTS[0], modelId: 'wreck-part-cargo', position: [0, -2, 1] };
    c.startSalvage(node); assert.equal(c.wreckSalvage.active, null);
    inventory.addItem('dive_kit', 1); c.startSalvage(node); assert.equal(c.wreckSalvage.active, null);
    inventory.addItem('stone_axe', 1); c.scene.player.position[1] = 0; c.startSalvage(node); assert.equal(c.wreckSalvage.active, null);
    c.scene.player.position = [0, -2, -3]; c.startSalvage(node); assert.equal(c.wreckSalvage.active, null);
    c.scene.player.position = [0, -2, 0]; blocked = true; c.startSalvage(node); assert.equal(c.wreckSalvage.active, null);
    blocked = false; c.startSalvage(node); assert.equal(c.wreckSalvage.active, 'cargo'); assert.equal(notices.length, 6);
});
