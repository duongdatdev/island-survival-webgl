import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialSystem } from '../src/systems/TutorialSystem.js';

test('reusing tutorial controls invokes only the current session and destroying twice leaves no skip listener', () => {
    const previousDocument = globalThis.document, button = new EventTarget(), overlay = { classList: { add() {} } };
    globalThis.document = { getElementById: id => id === 'tutorial-skip' ? button : id === 'tutorial-overlay' ? overlay : {} };
    try {
        for (let index = 0; index < 10; index++) {
            const tutorial = new TutorialSystem(); let calls = 0; tutorial.skip = () => calls++;
            tutorial.init(); tutorial.init(); button.dispatchEvent(new Event('click')); assert.equal(calls, 1);
            tutorial.destroy(); tutorial.destroy(); button.dispatchEvent(new Event('click')); assert.equal(calls, 1);
        }
    } finally { globalThis.document = previousDocument; }
});

test('Classic completion does not skip Campaign guidance, and reset/skip persist only their own mode', () => {
    const previous = globalThis.localStorage, values = new Map([['island_survival_tutorial_done', 'true']]);
    globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    try {
        assert.equal(new TutorialSystem().isComplete, true);
        const campaign = new TutorialSystem({ mode: 'campaign' }); assert.equal(campaign.isComplete, false);
        campaign.skip(); assert.equal(new TutorialSystem({ mode: 'campaign' }).isComplete, true);
        campaign.reset(); assert.equal(values.get('island_survival_tutorial_done'), 'true'); assert.equal(new TutorialSystem({ mode: 'campaign' }).isComplete, false);
        new TutorialSystem().reset(); assert.equal(values.has('island_survival_tutorial_done'), false);
    } finally { globalThis.localStorage = previous; }
});

test('Campaign hints use current bindings and completed interactions count before their step is shown', () => {
    const tutorial = new TutorialSystem({ mode: 'campaign', input: { getBindingDisplayName: action => action === 'interact' ? '<F>' : 'I' } });
    const step = id => tutorial._steps.find(step => step.id === id);
    assert.match(step('pickup').text(), /&lt;F&gt;/);
    assert.equal(step('pickup').triggerCheck(), false); tutorial.notifyPickup(); assert.equal(step('pickup').triggerCheck(), true);
    tutorial.notifyPanel('journal'); tutorial.notifyPanel('craft'); tutorial.notifyBuilt(); tutorial.notifyCrafted();
    for (const id of ['journal', 'build', 'crafting', 'craft_item']) assert.equal(step(id).triggerCheck(), true, id);
    tutorial.reset(); for (const id of ['pickup', 'journal', 'build', 'crafting', 'craft_item']) assert.equal(step(id).triggerCheck(), false, id);
});
