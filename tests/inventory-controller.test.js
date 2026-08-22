import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryController } from '../src/systems/InventoryController.js';
import { Inventory } from '../src/systems/InventoryV2.js';

function createClassList(...initial) {
    const values = new Set(initial);
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name),
    };
}

function createEventTarget() {
    const listeners = new Map();
    return {
        classList: createClassList('hidden'),
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        listenerCount(type) {
            return listeners.get(type)?.size || 0;
        },
    };
}

function createDocument(elements = {}) {
    return {
        pointerLockElement: null,
        getElementById: id => elements[id] || null,
        querySelectorAll: () => [],
    };
}

test('inventory UI listeners attach once and are removed on dispose', () => {
    const closeButton = createEventTarget();
    const trash = createEventTarget();
    const menu = createEventTarget();
    const inventory = new Inventory(20);
    const scene = {
        inventory,
        engine: { audio: { playClick() {} } },
    };
    const controller = new InventoryController(scene, {
        document: createDocument({
            'inventory-menu': menu,
            'inventory-menu-close': closeButton,
            'trash-slot': trash,
        }),
    });

    controller.init();
    controller.init();

    assert.equal(closeButton.listenerCount('click'), 1);
    assert.equal(trash.listenerCount('drop'), 1);
    assert.equal(trash.listenerCount('dragover'), 1);
    assert.equal(typeof inventory.onChange, 'function');

    controller.dispose();

    assert.equal(closeButton.listenerCount('click'), 0);
    assert.equal(trash.listenerCount('drop'), 0);
    assert.equal(trash.listenerCount('dragover'), 0);
    assert.equal(inventory.onChange, null);
});

test('consuming a hotbar meal applies its vital effect and removes one item', () => {
    const inventory = new Inventory(20);
    inventory.slots[20] = { id: 'cooked_meal', count: 1 };
    const events = [];
    const vitals = {
        health: 80,
        hunger: 20,
        eat(amount) { this.hunger += amount; },
    };
    const scene = {
        inventory,
        vitals,
        engine: {
            audio: {
                playEat: () => events.push('eat'),
                playDrink() {},
                playHeal() {},
                setHealthFraction: value => events.push(value),
            },
        },
        _showNotification: message => events.push(message),
    };
    const controller = new InventoryController(scene, { document: createDocument() });

    assert.equal(controller.consumeItemAt(20), true);
    assert.equal(vitals.hunger, 60);
    assert.equal(inventory.slots[20], null);
    assert.equal(events.includes('eat'), true);
    assert.equal(controller.consumeItemAt(20), false);
});

test('structure placement clamps to the island and consumes the active item', () => {
    const inventory = new Inventory(20);
    inventory.slots[20] = { id: 'water_collector', count: 1 };
    const events = [];
    const waterCollector = {
        position: new Float32Array(3),
        isBuilt: false,
        updateModelMatrix: () => events.push('matrix'),
    };
    const scene = {
        inventory,
        waterCollector,
        campfire: { isBuilt: false },
        player: { position: new Float32Array([30, 1, 0]), rotation: [0, 0, 0] },
        worldGenerator: {},
        world: { terrainGenerator: { island: { radius: 10 } } },
        terrain: { getHeight: () => 3 },
        engine: {
            audio: {
                playError() {},
                playRaftBuild: () => events.push('build-audio'),
            },
        },
        particleSystem: { emit: () => events.push('particle') },
        _showNotification: message => events.push(message),
    };
    const controller = new InventoryController(scene, { document: createDocument() });

    assert.equal(controller.placeStructure('water_collector'), true);
    assert.equal(waterCollector.isBuilt, true);
    assert.ok(Math.abs(Math.hypot(waterCollector.position[0], waterCollector.position[2]) - 8) < 0.0001);
    assert.equal(waterCollector.position[1], 3);
    assert.equal(inventory.slots[20], null);
    assert.equal(events.includes('build-audio'), true);
    assert.equal(events.includes('particle'), true);
});
