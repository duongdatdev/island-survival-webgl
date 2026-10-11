import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { CampaignWorldEvents, STORM_CARGO } from '../src/systems/CampaignWorldEvents.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';
import { FishingSystem } from '../src/systems/FishingSystem.js';
import { GameEvents } from '../src/systems/GameEvents.js';

const world = seed => new CampaignWorldGenerator().generate(seed, {}, false, { mesh: false, props: false });
const system = seed => new CampaignWorldEvents(world(seed), { nearby: () => [] }, new GameEvents());

test('cargo spawns only after a storm, avoids POIs/base, and grants its complete reward once', () => {
    const events = system('events'), bag = new ItemContainer(1);
    events.update(1, { isStorm: false }); assert.equal(events.cargo.length, 0);
    events.update(1, { isStorm: true }); events.update(1, { isStorm: true }); assert.equal(events.cargo.length, 0);
    events.update(1, { isStorm: false }); assert.equal(events.cargo.length, 1);
    const cargo = events.cargo[0];
    assert.ok(events.world.pois.every(p => Math.hypot(p.position[0] - cargo.position[0], p.position[2] - cargo.position[2]) >= p.radius + 6));
    const saved = events.snapshot();
    assert.equal(events.claimCargo(cargo.id, bag).ok, false); assert.deepEqual(bag.snapshot(), [null]);
    assert.equal(events.cargo.length, 1);
    const loaded = system('events'); loaded.restore(saved);
    const roomy = new ItemContainer(8); assert.equal(loaded.claimCargo(cargo.id, roomy).ok, true);
    for (const [id, count] of Object.entries(STORM_CARGO)) assert.equal(roomy.getCount(id), count);
    assert.equal(loaded.claimCargo(cargo.id, roomy).ok, false);
    const blocked = system('events'); blocked.registry.nearby = () => [{}]; assert.equal(blocked.spawnCargo(), null);
});

test('shoals expire in simulated time, preserve RNG and doubled landed catches across reload', () => {
    const events = system('shoals'); events.update(601); assert.equal(events.shoals.length, 1);
    const shoal = events.shoals[0], fishing = new FishingSystem({ random: () => 0 }), full = new ItemContainer(1);
    full.addItem('wood', 99); fishing.cast(shoal.position, 5, shoal); fishing.update(1.6, {}, full);
    fishing.update(0.05, { strike: true, reel: true }, full);
    for (let i = 0; fishing.state.phase === 'reeling' && i < 3000; i++) fishing.update(0.05, { reel: fishing.state.tension < 0.65 }, full);
    assert.equal(fishing.state.phase, 'landed'); assert.equal(shoal.remaining, 6);
    const loaded = system('shoals'); loaded.restore(events.snapshot());
    const restoredFishing = new FishingSystem({ onCaught: (id, count, shoalId) => { assert.equal(count, 2); loaded.caughtAtShoal(shoalId); } });
    restoredFishing.restore(fishing.snapshot()); const bag = new ItemContainer(2);
    assert.equal(restoredFishing.claim(bag), true); assert.equal(restoredFishing.claim(bag), false);
    assert.equal(bag.getCount('reef_fish'), 2); assert.equal(loaded.shoals[0].remaining, 5);
    assert.deepEqual(loaded.spawnShoal(), events.spawnShoal());
    loaded.update(481); assert.equal(loaded.shoals.length, 0);
});

test('shortcut requires an axe and inventory capacity; partial cuts and open state persist', () => {
    const events = system('shortcut'), bag = new ItemContainer(1);
    assert.equal(events.cutShortcut(bag).ok, false); bag.addItem('stone_axe', 1);
    events.cutShortcut(bag); events.cutShortcut(bag);
    const loaded = system('shortcut'); loaded.restore(events.snapshot()); assert.equal(loaded.cutProgress, 2);
    assert.equal(loaded.cutShortcut(bag).ok, false); assert.equal(loaded.shortcutOpen, false);
    const roomy = new ItemContainer(2); roomy.addItem('stone_axe', 1);
    assert.equal(loaded.cutShortcut(roomy).ok, true); assert.equal(roomy.getCount('wood'), 6);
    assert.equal(loaded.cutShortcut(roomy).ok, false);
    events.restore(loaded.snapshot()); assert.equal(events.shortcutOpen, true);
    for (const bad of [{ shoals: {} }, { cargo: [{ id: 'storm-cargo-1', position: [NaN, 0, 0] }] }, { time: -1 }, { cutProgress: 4 }]) assert.throws(() => events.restore(bad));
});
