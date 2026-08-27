import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionController } from '../src/systems/InteractionController.js';

function createClassList(...initialClasses) {
    const classes = new Set(initialClasses);
    return {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
    };
}

function createScene() {
    let interactPressed = false;
    let inventoryCount = 0;
    const items = new Map();
    const events = [];
    const pickupHint = { innerHTML: '', classList: createClassList('hidden') };

    const scene = {
        engine: {
            input: {
                getBindingDisplayName: () => 'E',
                isKeyPressed: action => action === 'interact' && interactPressed,
                consumeAction: action => {
                    if (action === 'interact') interactPressed = false;
                },
            },
            audio: {
                playCraft: () => events.push('craft-audio'),
                playDrink: () => events.push('drink-audio'),
                playSplash: () => events.push('splash-audio'),
                playRaftBuild: () => events.push('raft-audio'),
                playPickup: () => events.push('pickup-audio'),
            },
        },
        player: { position: new Float32Array([0, 1, 0]), scaleFactor: 1 },
        campfire: {
            position: new Float32Array([0, 0, 0]),
            isPlayerNear: () => false,
        },
        waterCollector: {
            waterStored: 0,
            maxWater: 3,
            isPlayerNear: () => false,
            collectWater: () => false,
        },
        raftAssembly: {
            position: new Float32Array([0, 0, 0]),
            framePlaced: true,
            floatsPlaced: true,
            paddlePlaced: true,
            sailPlaced: true,
            motorPlaced: true,
            distanceTo: () => 10,
            isComplete: () => true,
        },
        waterfall: null,
        terrain: { getHeight: () => 1 },
        inventory: {
            slots: Array(28).fill(null),
            selectedHotbarIndex: 0,
            hasItem: id => (items.get(id) || 0) > 0,
            addItem: (id, count) => {
                items.set(id, (items.get(id) || 0) + count);
                inventoryCount += count;
            },
            removeItem: (id, count) => {
                const current = items.get(id) || 0;
                if (current < count) return false;
                items.set(id, current - count);
                inventoryCount -= count;
                return true;
            },
        },
        resourceManager: {
            nearestPickable: null,
            update: () => {},
        },
        debrisManager: { update: () => {} },
        stats: { mealsCooked: 0, resourcesPicked: 0 },
        particleSystem: { emit: () => events.push('particle') },
        tutorial: { notifyPickup: () => events.push('tutorial-pickup') },
        vitals: { drink: () => events.push('drink') },
        _domCache: { pickupHint },
        _getTotalInventoryCount: () => inventoryCount,
        _showNotification: message => events.push(message),
        _openTreasureChest: () => events.push('open-chest'),
        escapeHud: null,
        isFishing: false,
        isEscaping: false,
        gl: null,
    };

    return {
        scene,
        events,
        items,
        pickupHint,
        pressInteract() { interactPressed = true; },
        addInventory(count) { inventoryCount += count; },
    };
}

test('waterfall interaction consumes the action before an overlapping chest', () => {
    const fixture = createScene();
    fixture.scene.waterfall = { isPlayerInPond: () => true };
    fixture.scene.resourceManager.nearestPickable = { resourceId: 'treasure_chest' };
    fixture.pressInteract();

    new InteractionController(fixture.scene).update(1 / 60);

    assert.equal(fixture.events.filter(event => event === 'drink').length, 1);
    assert.equal(fixture.events.includes('open-chest'), false);
    assert.equal(fixture.pickupHint.classList.contains('hidden'), false);
    assert.match(fixture.pickupHint.innerHTML, /hint-key/);
});

test('raft modules install in order and consume one inventory item', () => {
    const fixture = createScene();
    fixture.scene.raftAssembly.distanceTo = () => 2;
    fixture.scene.raftAssembly.framePlaced = false;
    fixture.scene.raftAssembly.floatsPlaced = false;
    fixture.items.set('raft_frame', 1);
    fixture.addInventory(1);
    fixture.pressInteract();

    new InteractionController(fixture.scene).update(1 / 60);

    assert.equal(fixture.scene.raftAssembly.framePlaced, true);
    assert.equal(fixture.scene.raftAssembly.floatsPlaced, false);
    assert.equal(fixture.items.get('raft_frame'), 0);
    assert.equal(fixture.events.includes('raft-audio'), true);
});

test('resource and debris pickups update stats and tutorial feedback independently', () => {
    const fixture = createScene();
    fixture.scene.resourceManager.update = () => fixture.addInventory(1);
    fixture.scene.debrisManager.update = () => fixture.addInventory(1);

    new InteractionController(fixture.scene).update(1 / 60);

    assert.equal(fixture.scene.stats.resourcesPicked, 2);
    assert.equal(fixture.events.filter(event => event === 'pickup-audio').length, 2);
    assert.equal(fixture.events.filter(event => event === 'tutorial-pickup').length, 2);
});

test('water collector prompt distinguishes dry, collecting, and full states', () => {
    const fixture = createScene();
    fixture.scene.waterCollector.isPlayerNear = () => true;
    fixture.scene.weather = {
        getGameplayEffects: () => ({ rainFactor: 0 }),
    };
    const controller = new InteractionController(fixture.scene);

    assert.match(controller._updateWaterCollector('E'), /Cần trời mưa/);
    fixture.scene.weather.getGameplayEffects = () => ({ rainFactor: 0.6 });
    assert.match(controller._updateWaterCollector('E'), /Đang hứng nước/);
    fixture.scene.waterCollector.waterStored = fixture.scene.waterCollector.maxWater;
    assert.match(controller._updateWaterCollector('E'), /Đã đầy/);
});

test('rain-weakened campfires still cook and report their status', () => {
    const fixture = createScene();
    fixture.scene.campfire.isPlayerNear = () => true;
    fixture.scene.campfire.fireIntensityMultiplier = 0.4;
    const controller = new InteractionController(fixture.scene);

    assert.match(controller._updateCampfire('E'), /Lửa đang yếu vì mưa/);

    fixture.items.set('raw_fish', 1);
    fixture.addInventory(1);
    fixture.pressInteract();
    const prompt = controller._updateCampfire('E');
    assert.match(prompt, /Lửa yếu vì mưa/);
    assert.equal(fixture.items.get('raw_fish'), 0);
    assert.equal(fixture.items.get('cooked_meal'), 1);
});
