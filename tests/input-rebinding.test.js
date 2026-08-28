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

test('mouse movement accumulates all events until the frame resets', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const windowListeners = new Map();
    const canvasListeners = new Map();

    globalThis.window = {
        addEventListener(type, listener) { windowListeners.set(type, listener); },
    };
    globalThis.document = {
        addEventListener() {},
        getElementById() { return null; },
    };
    const canvas = {
        addEventListener(type, listener) { canvasListeners.set(type, listener); },
    };

    try {
        const input = new InputManager(canvas);
        input.mouse.isLocked = true;

        windowListeners.get('mousemove')({ movementX: 4, movementY: -3 });
        windowListeners.get('mousemove')({ movementX: -1, movementY: 5 });

        assert.equal(input.mouse.deltaX, 3);
        assert.equal(input.mouse.deltaY, 2);

        input.resetDeltas();
        assert.equal(input.mouse.deltaX, 0);
        assert.equal(input.mouse.deltaY, 0);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test('mouse release is reported for one frame', () => {
    const input = new InputManager(null);
    input.mouse.buttons[0] = true;
    assert.equal(input.isMousePressed(0), true);
    assert.equal(input.isMouseReleased(0), false);

    input.resetDeltas();
    input.mouse.buttons[0] = false;
    assert.equal(input.isMousePressed(0), false);
    assert.equal(input.isMouseReleased(0), true);

    input.resetDeltas();
    assert.equal(input.isMouseReleased(0), false);
});

test('pointer lock capture click is consumed and unlock clears mouse state', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const windowListeners = new Map();
    const documentListeners = new Map();
    const canvasListeners = new Map();
    let lockRequests = 0;
    let prevented = false;

    const canvas = {
        addEventListener(type, listener) { canvasListeners.set(type, listener); },
        requestPointerLock() { lockRequests++; },
    };
    const fakeDocument = {
        pointerLockElement: null,
        addEventListener(type, listener) { documentListeners.set(type, listener); },
        getElementById() { return null; },
        exitPointerLock() { this.pointerLockElement = null; },
    };
    globalThis.window = {
        addEventListener(type, listener) { windowListeners.set(type, listener); },
    };
    globalThis.document = fakeDocument;

    try {
        const input = new InputManager(canvas);
        const lockStates = [];
        input.setPointerLockEnabled(true);
        input.onPointerLockChange = (locked, wasLocked) => lockStates.push([locked, wasLocked]);

        canvasListeners.get('mousedown')({
            button: 0,
            clientX: 10,
            clientY: 20,
            preventDefault() { prevented = true; },
        });
        assert.equal(lockRequests, 1);
        assert.equal(prevented, true);
        assert.equal(input.mouse.buttons[0], false);

        fakeDocument.pointerLockElement = canvas;
        documentListeners.get('pointerlockchange')();
        canvasListeners.get('mousedown')({ button: 0, clientX: 10, clientY: 20 });
        windowListeners.get('mousemove')({ movementX: 6, movementY: -2 });
        assert.equal(input.mouse.buttons[0], true);
        assert.equal(input.mouse.deltaX, 6);

        fakeDocument.pointerLockElement = null;
        documentListeners.get('pointerlockchange')();
        assert.equal(input.mouse.buttons[0], false);
        assert.equal(input.mouse.deltaX, 0);
        assert.deepEqual(lockStates, [[true, false], [false, true]]);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
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
