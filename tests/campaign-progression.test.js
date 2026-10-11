import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEvents } from '../src/systems/GameEvents.js';
import { CampaignProgression } from '../src/systems/CampaignProgression.js';
import { CAMPAIGN_CHAPTERS } from '../src/gameplay/CampaignStory.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

function chapter(progress, index) {
    for (const entry of CAMPAIGN_CHAPTERS[index].objectives) {
        const objective = entry.anyOf?.[0] || entry;
        if (objective.event === 'journalRead') progress.readJournal(objective.id);
        else progress.record(objective.event, { id: objective.id, type: objective.id, count: objective.count });
    }
}

test('a modular roof fulfills the prologue shelter objective without requiring a second prefab shelter', () => {
    const progress = new CampaignProgression(new GameEvents());
    progress.record('drank', { id: 'fresh_water' }); progress.readJournal('wreck_log');
    progress.record('structurePlaced', { type: 'campfire' }); progress.record('structurePlaced', { type: 'roof' });
    assert.equal(progress.chapter, 2); assert.equal(progress.completedChapters.has(1), true);
    assert.equal(progress.facts['structurePlaced:shelter'], undefined); assert.equal(progress.pendingRewards.length, 1);
});

test('campaign facts count early discoveries and unlock metal/mechanical tiers in order', () => {
    const progress = new CampaignProgression(new GameEvents());
    progress.readJournal('camp_log');
    progress.record('poiVisited', { id: 'abandoned_camp' });
    chapter(progress, 0);
    assert.equal(progress.chapter, 2);
    progress.record('structurePlaced', { type: 'workbench' });
    progress.record('structurePlaced', { type: 'chest' });
    assert.equal(progress.chapter, 3);
    assert.equal(progress.tier, 2);
    assert.ok(progress.blueprints.has('fishing_rod_blueprint'));
    chapter(progress, 2);
    chapter(progress, 3);
    assert.equal(progress.chapter, 5);
    assert.equal(progress.tier, 3);
    assert.ok(progress.questItems.has('island_coordinates'));
});

test('chapter rewards remain pending in a full bag and cannot be received twice', () => {
    const progress = new CampaignProgression(new GameEvents());
    chapter(progress, 0);
    const full = new ItemContainer(1);
    full.addItem('wood', 99);
    assert.equal(progress.claimRewards(full), 0);
    assert.equal(progress.pendingRewards.length, 1);
    const bag = new ItemContainer(10);
    assert.equal(progress.claimRewards(bag), 1);
    chapter(progress, 0);
    assert.equal(progress.claimRewards(bag), 0);
    assert.equal(bag.getCount('carrot_seed'), 2);
});

test('rereading a journal does not duplicate optional quest progress', () => {
    const progress = new CampaignProgression(new GameEvents());
    for (let i = 0; i < 10; i++) progress.readJournal('optional_1');
    assert.equal(progress.facts['optionalJournalRead:'], 1);
    assert.equal(progress.journals.size, 1);
});

test('both endings share the completed campaign and survive reload', () => {
    const events = new GameEvents();
    const progress = new CampaignProgression(events);
    for (let i = 0; i < 6; i++) chapter(progress, i);
    assert.equal(progress.completedChapters.size, 6);
    events.emit('endingCompleted', { id: 'rescue' });
    const resumed = new CampaignProgression(new GameEvents());
    resumed.restore(progress.snapshot());
    assert.equal(resumed.facts['endingCompleted:raft'], 1);
    assert.equal(resumed.facts['endingCompleted:rescue'], 1);
    assert.equal(resumed.completedChapters.size, 6);
    assert.equal(resumed.pendingRewards.length, progress.pendingRewards.length);
});

test('wildcard event subscriptions preserve payload types and detach cleanly', () => {
    const events = new GameEvents();
    const progress = new CampaignProgression(events);
    events.emit('structurePlaced', { id: 'structure-1', type: 'shelter' });
    assert.equal(progress.facts['structurePlaced:shelter'], 1);
    progress.dispose();
    assert.equal(events.listeners.size, 0);
    events.emit('structurePlaced', { type: 'campfire' });
    assert.equal(progress.facts['structurePlaced:campfire'], undefined);
});
