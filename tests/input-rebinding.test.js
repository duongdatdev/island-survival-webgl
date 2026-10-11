import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager, DEFAULT_KEY_BINDINGS, getKeyDisplayName } from '../src/core/InputManager.js';
import { SettingsManager } from '../src/systems/SettingsManager.js';

test('InputManager initializes with default action key bindings', () => {
    const input = new InputManager(null);
    assert.deepEqual(input.getBindings(), DEFAULT_KEY_BINDINGS);
    assert.equal(input.getBindingKey('moveForward'), 'KeyW');
    assert.equal(input.getBindingKey('jump'), 'Space');
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

test('physical taps between frames survive release once, obey rebinding and can be consumed', () => {
    const originalWindow = globalThis.window, originalDocument = globalThis.document, listeners = new Map();
    globalThis.window = { addEventListener(type, callback) { listeners.set(type, callback); } };
    globalThis.document = { addEventListener() {}, getElementById() { return null; } };
    try {
        const input = new InputManager(null); input.setBinding('interact', 'KeyF', 0);
        const event = code => ({ code, preventDefault() {} });
        listeners.get('keydown')(event('KeyF')); listeners.get('keyup')(event('KeyF'));
        assert.equal(input.isActionDown('interact'), false);
        assert.equal(input.isActionPressed('interact'), true); assert.equal(input.isKeyPressed('KeyF'), true);
        input.consumeAction('interact', { keepHeld: true }); assert.equal(input.isActionPressed('interact'), false);
        listeners.get('keydown')(event('KeyF')); listeners.get('keyup')(event('KeyF'));
        assert.equal(input.isActionPressed('interact'), true); input.resetDeltas(); assert.equal(input.isActionPressed('interact'), false);
        listeners.get('keydown')(event('KeyE')); listeners.get('keyup')(event('KeyE'));
        assert.equal(input.isActionPressed('interact'), false); assert.equal(input.isKeyPressed('KeyE'), true);
        input.consumeKey('KeyE'); assert.equal(input.isKeyPressed('KeyE'), false);
        listeners.get('keydown')(event('KeyF')); input.consumeAction('interact');
        input.resetDeltas();
        listeners.get('keydown')({ ...event('KeyF'), repeat: true });
        assert.equal(input.isActionPressed('interact'), false);
        assert.equal(input.isActionDown('interact'), false);
    } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
});

test('debug toggles only on a new matching key press, without repeats or unrelated buffered taps', () => {
    const originalWindow = globalThis.window, originalDocument = globalThis.document, listeners = new Map(); let toggles = 0;
    globalThis.window = { addEventListener(type, callback) { listeners.set(type, callback); } };
    globalThis.document = { addEventListener() {}, getElementById(id) { return id === 'debug-panel' ? { classList: { toggle() { toggles++; } } } : null; } };
    try {
        const input = new InputManager(null), event = code => ({ code, preventDefault() {} });
        listeners.get('keydown')(event('F3')); listeners.get('keydown')({ ...event('F3'), repeat: true });
        listeners.get('keydown')(event('KeyW')); assert.equal(toggles, 1);
        listeners.get('keyup')(event('F3')); listeners.get('keydown')(event('F3')); assert.equal(toggles, 2);
        input.resetDeltas(); input.setBinding('toggleDebug', 'KeyG', 0);
        listeners.get('keydown')(event('KeyG')); assert.equal(toggles, 3);
    } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
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

test('held interactions consume the press once while preserving a rebound physical key until release', () => {
    const input = new InputManager(null); input.setBinding('interact', 'KeyF', 0); input.keys.KeyF = true;
    assert.equal(input.isActionPressed('interact'), true); input.consumeAction('interact', { keepHeld: true });
    assert.equal(input.isActionPressed('interact'), false); assert.equal(input.isActionDown('interact'), true);
    input.resetDeltas(); assert.equal(input.isActionPressed('interact'), false); assert.equal(input.isActionDown('interact'), true);
    input.keys.KeyF = false; input.resetDeltas(); input.keys.KeyF = true; assert.equal(input.isActionPressed('interact'), true);
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

test('gameplay captures browser keyboard shortcuts but menus and text fields do not', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const windowListeners = new Map();

    globalThis.window = {
        addEventListener(type, listener) { windowListeners.set(type, listener); },
    };
    globalThis.document = {
        addEventListener() {},
        getElementById() { return null; },
    };

    const makeEvent = (code, overrides = {}) => {
        let prevented = false;
        return {
            code,
            target: null,
            preventDefault() { prevented = true; },
            wasPrevented() { return prevented; },
            ...overrides,
        };
    };

    try {
        const input = new InputManager(null);
        const keydown = windowListeners.get('keydown');

        const menuShortcut = makeEvent('KeyR', { ctrlKey: true });
        keydown(menuShortcut);
        assert.equal(menuShortcut.wasPrevented(), false);

        input.setPointerLockEnabled(true);
        for (const event of [
            makeEvent('Tab'),
            makeEvent('F5'),
            makeEvent('KeyR', { ctrlKey: true }),
            makeEvent('ArrowLeft', { altKey: true }),
            makeEvent('Equal', { ctrlKey: true }),
        ]) {
            keydown(event);
            assert.equal(event.wasPrevented(), true, `${event.code} should be captured during gameplay`);
        }

        const typing = makeEvent('KeyA', { target: { tagName: 'INPUT', type: 'text' } });
        keydown(typing);
        assert.equal(typing.wasPrevented(), false);
        assert.equal(input.isKeyDown('KeyA'), false);
        assert.equal(input.isKeyPressed('KeyA'), false);
    } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
    }
});

test('lost window focus or hidden tab clears held controls and buffered presses without a release attack', () => {
    const originalWindow = globalThis.window, originalDocument = globalThis.document;
    const windowListeners = new Map(), documentListeners = new Map();
    globalThis.window = { addEventListener(type, callback) { windowListeners.set(type, callback); } };
    globalThis.document = { hidden: false, addEventListener(type, callback) { documentListeners.set(type, callback); }, getElementById() { return null; } };
    try {
        const input = new InputManager(null);
        input.setBinding('interact', 'KeyF');
        for (const loseFocus of [() => windowListeners.get('blur')(), () => {
            document.hidden = true; documentListeners.get('visibilitychange')();
        }]) {
            for (const code of ['KeyW', 'KeyF']) windowListeners.get('keydown')({ code, preventDefault() {} });
            input.mouse.buttons[0] = true; input.mouse.deltaX = 12; input.mouse.wheelDelta = 1;
            input.resetDeltas(); input.mouse.deltaY = -4;
            windowListeners.get('keydown')({ code: 'KeyJ', preventDefault() {} });
            loseFocus();
            assert.equal(input.isActionDown('moveForward'), false);
            assert.equal(input.isActionDown('interact'), false);
            assert.equal(input.isKeyPressed('KeyJ'), false);
            assert.equal(input.mouse.buttons[0], false);
            assert.equal(input.isMouseReleased(0), false);
            assert.equal(input.mouse.deltaY, 0);
            document.hidden = false; documentListeners.get('visibilitychange')();
            windowListeners.get('keydown')({ code: 'KeyF', repeat: true, preventDefault() {} });
            assert.equal(input.isActionDown('interact'), false);
            windowListeners.get('keydown')({ code: 'KeyF', preventDefault() {} });
            assert.equal(input.isActionPressed('interact'), true);
        }
    } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
});

test('gameplay wheel input cannot scroll or zoom the browser', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const canvasListeners = new Map();

    globalThis.window = { addEventListener() {} };
    globalThis.document = {
        addEventListener() {},
        getElementById() { return null; },
    };
    const canvas = {
        addEventListener(type, listener) { canvasListeners.set(type, listener); },
    };

    try {
        const input = new InputManager(canvas);
        input.setPointerLockEnabled(true);
        let prevented = false;
        canvasListeners.get('wheel')({
            deltaY: 10,
            preventDefault() { prevented = true; },
        });

        assert.equal(prevented, true);
        assert.equal(input.mouse.wheelDelta, 1);
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
