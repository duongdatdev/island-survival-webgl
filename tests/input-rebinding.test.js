import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager, DEFAULT_KEY_BINDINGS, getKeyDisplayName } from '../src/core/InputManager.js';
import { SettingsManager } from '../src/systems/SettingsManager.js';

test('InputManager initializes with default action key bindings', () => {
    const input = new InputManager(null);
    assert.deepEqual(input.getBindings(), DEFAULT_KEY_BINDINGS);
    assert.equal(input.getBindingKey('moveForward'), 'KeyW');
    assert.equal(input.getBindingKey('interact'), 'KeyE');
    assert.equal(input.getBindingKey('inventory'), 'KeyC');
    assert.equal(input.getBindingKey('useItem'), 'KeyQ');
    assert.equal(input.getBindingKey('toggleDebug'), 'F3');
    assert.equal(input.getBindingKey('hotbar1'), 'Digit1');
    assert.equal(input.getBindingKey('hotbar8'), 'Digit8');
});

test('getKeyDisplayName formats raw codes to friendly labels', () => {
    assert.equal(getKeyDisplayName('KeyW'), 'W');
    assert.equal(getKeyDisplayName('KeyE'), 'E');
    assert.equal(getKeyDisplayName('Digit1'), '1');
    assert.equal(getKeyDisplayName('Numpad1'), 'Num 1');
    assert.equal(getKeyDisplayName('ArrowUp'), '↑');
    assert.equal(getKeyDisplayName('ShiftLeft'), 'Shift Trái');
    assert.equal(getKeyDisplayName('Space'), 'Space');
    assert.equal(getKeyDisplayName('F3'), 'F3');
});

test('isActionDown and isActionPressed detect bound keys', () => {
    const input = new InputManager(null);

    assert.equal(input.isActionDown('moveForward'), false);
    assert.equal(input.isActionPressed('moveForward'), false);

    input.keys['KeyW'] = true;
    assert.equal(input.isActionDown('moveForward'), true);
    assert.equal(input.isActionPressed('moveForward'), true);
    assert.equal(input.isKeyDown('moveForward'), true);
    assert.equal(input.isKeyPressed('moveForward'), true);

    input.resetDeltas();
    assert.equal(input.isActionDown('moveForward'), true);
    assert.equal(input.isActionPressed('moveForward'), false);

    input.keys['KeyW'] = false;
    assert.equal(input.isActionDown('moveForward'), false);
    assert.equal(input.isActionPressed('moveForward'), false);
});

test('Hotbar selection 1-8 is supported via primary and secondary bindings', () => {
    const input = new InputManager(null);

    input.keys['Digit1'] = true;
    assert.equal(input.isActionPressed('hotbar1'), true);
    input.resetDeltas();
    input.keys['Digit1'] = false;
    input.resetDeltas();

    input.keys['Numpad5'] = true;
    assert.equal(input.isActionPressed('hotbar5'), true);
    input.resetDeltas();
    input.keys['Numpad5'] = false;
});

test('Key rebinding allows modifying actions and resetting to default', () => {
    const input = new InputManager(null);

    input.setBinding('interact', 'KeyF', 0);
    assert.equal(input.getBindingKey('interact'), 'KeyF');
    assert.equal(input.getBindingDisplayName('interact'), 'F');

    input.keys['KeyE'] = true;
    assert.equal(input.isActionPressed('interact'), false);
    input.keys['KeyE'] = false;

    input.keys['KeyF'] = true;
    assert.equal(input.isActionPressed('interact'), true);
    input.keys['KeyF'] = false;

    input.resetBindings();
    assert.equal(input.getBindingKey('interact'), 'KeyE');
    assert.equal(input.getBindingDisplayName('interact'), 'E');
});

test('consumeAction consumes all keys bound to action', () => {
    const input = new InputManager(null);
    input.keys['KeyE'] = true;
    assert.equal(input.isActionPressed('interact'), true);

    input.consumeAction('interact');
    assert.equal(input.isActionPressed('interact'), false);
    assert.equal(input.isActionDown('interact'), false);
});

test('SettingsManager persists and resets keyBindings', () => {
    const storage = {};
    globalThis.localStorage = {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = v; },
        removeItem: (k) => { delete storage[k]; }
    };

    const settings = new SettingsManager();
    assert.ok(settings.get('keyBindings'));
    assert.equal(settings.get('keyBindings').moveForward[0], 'KeyW');

    const custom = JSON.parse(JSON.stringify(settings.get('keyBindings')));
    custom.moveForward = ['KeyI', 'ArrowUp'];
    settings.set('keyBindings', custom);

    assert.equal(settings.get('keyBindings').moveForward[0], 'KeyI');

    const reloaded = new SettingsManager();
    assert.equal(reloaded.get('keyBindings').moveForward[0], 'KeyI');

    reloaded.resetKeyBindings();
    assert.equal(reloaded.get('keyBindings').moveForward[0], 'KeyW');
});
