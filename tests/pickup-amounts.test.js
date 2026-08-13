import test from 'node:test';
import assert from 'node:assert/strict';

import { ResourceManager } from '../src/systems/ResourceManager.js';
import { DebrisManager } from '../src/systems/DebrisManager.js';

function axeEquippedInventory(addCalls) {
    return {
        getEquippedItem() {
            return { id: 'stone_axe', count: 1 };
        },
        addItem(id, amount) {
            addCalls.push({ id, amount });
            return true;
        },
    };
}

test('equipping the stone axe does not duplicate world-resource pickups', () => {
    const manager = new ResourceManager();
    const addCalls = [];
    let collected = false;
    let notificationArgs = null;
    const resourceDef = { id: 'stone', name: 'Đá', nameEn: 'Stone', icon: '🪨' };
    const resource = {
        resourceId: 'stone',
        resourceDef,
        collect() { collected = true; },
    };
    manager._showNotification = (...args) => { notificationArgs = args; };

    manager._pickupResource(resource, axeEquippedInventory(addCalls));

    assert.deepEqual(addCalls, [{ id: 'stone', amount: 1 }]);
    assert.equal(collected, true);
    assert.deepEqual(notificationArgs, [resourceDef]);
});

test('equipping the stone axe does not duplicate drifting-debris rewards', () => {
    const manager = new DebrisManager();
    const addCalls = [];
    let collected = false;
    let notificationArgs = null;
    const gives = { resourceId: 'wood', amount: 2 };
    const debrisDef = { id: 'crate', name: 'Thùng trôi', icon: '📦', gives };
    const debris = {
        debrisDef,
        collect() { collected = true; },
    };
    manager._showNotification = (...args) => { notificationArgs = args; };

    manager._pickupDebris(debris, axeEquippedInventory(addCalls));

    assert.deepEqual(addCalls, [{ id: 'wood', amount: 2 }]);
    assert.equal(collected, true);
    assert.deepEqual(notificationArgs, [debrisDef, gives]);
});
