
export const DEFAULT_KEY_BINDINGS = {
    moveForward: ['KeyW', 'ArrowUp'],
    moveBackward: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    interact: ['KeyE'],
    inventory: ['KeyC', 'Tab'],
    useItem: ['KeyQ'],
    toggleDebug: ['F3'],
    hotbar1: ['Digit1', 'Numpad1'],
    hotbar2: ['Digit2', 'Numpad2'],
    hotbar3: ['Digit3', 'Numpad3'],
    hotbar4: ['Digit4', 'Numpad4'],
    hotbar5: ['Digit5', 'Numpad5'],
    hotbar6: ['Digit6', 'Numpad6'],
    hotbar7: ['Digit7', 'Numpad7'],
    hotbar8: ['Digit8', 'Numpad8'],
};

export const ACTION_LABELS = {
    moveForward: 'Tiến lên',
    moveBackward: 'Lùi lại',
    moveLeft: 'Sang trái',
    moveRight: 'Sang phải',
    sprint: 'Chạy nhanh (Sprint)',
    jump: 'Nhảy',
    interact: 'Tương tác / Nhặt đồ',
    inventory: 'Túi đồ & Chế tạo',
    useItem: 'Sử dụng / Đặt vật phẩm',
    toggleDebug: 'Bật/Tắt Debug Panel',
    hotbar1: 'Ô Hotbar 1',
    hotbar2: 'Ô Hotbar 2',
    hotbar3: 'Ô Hotbar 3',
    hotbar4: 'Ô Hotbar 4',
    hotbar5: 'Ô Hotbar 5',
    hotbar6: 'Ô Hotbar 6',
    hotbar7: 'Ô Hotbar 7',
    hotbar8: 'Ô Hotbar 8',
};

const KEY_DISPLAY_NAMES = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ShiftLeft': 'Shift Trái',
    'ShiftRight': 'Shift Phải',
    'ControlLeft': 'Ctrl Trái',
    'ControlRight': 'Ctrl Phải',
    'AltLeft': 'Alt Trái',
    'AltRight': 'Alt Phải',
    'Space': 'Space',
    'Tab': 'Tab',
    'Escape': 'Esc',
    'Enter': 'Enter',
    'Backspace': 'Backspace',
    'Delete': 'Del',
    'Insert': 'Ins',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PgUp',
    'PageDown': 'PgDn',
    'CapsLock': 'Caps',
    'Backquote': '`',
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': '\'',
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
};

export function getKeyDisplayName(code) {
    if (!code) return 'None';
    if (KEY_DISPLAY_NAMES[code]) return KEY_DISPLAY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
}

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this._prevKeys = {};
        this._pressedKeys = new Set();
        this._prevMouseButtons = {};
        this.mouse = {
            x: 0,
            y: 0,
            lastX: 0,
            lastY: 0,
            deltaX: 0,
            deltaY: 0,
            isLocked: false,
            buttons: {
                0: false,
                1: false,
                2: false
            },
            wheelDelta: 0
        };

        this.bindings = JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS));

        this._rebindCallback = null;
        this.pointerLockEnabled = false;
        this.onPointerLockChange = null;

        this._setupListeners();
    }


    isKeyDown(keyOrAction) {
        if (this.bindings[keyOrAction]) {
            return this.isActionDown(keyOrAction);
        }
        return !!this.keys[keyOrAction];
    }

    isKeyPressed(keyOrAction) {
        if (this.bindings[keyOrAction]) {
            return this.isActionPressed(keyOrAction);
        }
        return this._pressedKeys.has(keyOrAction) || !!this.keys[keyOrAction] && !this._prevKeys[keyOrAction];
    }

    isActionDown(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        const keys = Array.isArray(bound) ? bound : [bound];
        return keys.some(k => !!this.keys[k]);
    }

    isActionPressed(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        const keys = Array.isArray(bound) ? bound : [bound];
        return keys.some(k => this._pressedKeys.has(k) || !!this.keys[k] && !this._prevKeys[k]);
    }

    consumeAction(action, { keepHeld = false } = {}) {
        const bound = this.bindings[action];
        if (!bound) return;
        const keys = Array.isArray(bound) ? bound : [bound];
        for (const k of keys) {
            if (!keepHeld) this.keys[k] = false;
            this._prevKeys[k] = true;
            this._pressedKeys.delete(k);
        }
    }

    consumeKey(key) {
        this.keys[key] = false;
        this._prevKeys[key] = true;
        this._pressedKeys.delete(key);
    }

    isMousePressed(button = 0) {
        return !!this.mouse.buttons[button] && !this._prevMouseButtons[button];
    }

    isMouseReleased(button = 0) {
        return !this.mouse.buttons[button] && !!this._prevMouseButtons[button];
    }


    getBindings() {
        return JSON.parse(JSON.stringify(this.bindings));
    }

    setBindings(newBindings) {
        if (!newBindings || typeof newBindings !== 'object') return;
        for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
            if (newBindings[action]) {
                const val = newBindings[action];
                this.bindings[action] = Array.isArray(val) ? [...val] : [val];
            }
        }
    }

    setBinding(action, keyCode, slot = 0) {
        if (!this.bindings[action]) {
            this.bindings[action] = [];
        }
        if (!Array.isArray(this.bindings[action])) {
            this.bindings[action] = [this.bindings[action]];
        }
        this.bindings[action][slot] = keyCode;
    }

    getBindingKey(action, slot = 0) {
        const bound = this.bindings[action];
        if (!bound) return '';
        if (Array.isArray(bound)) return bound[slot] || bound[0] || '';
        return bound;
    }

    getBindingDisplayName(action, slot = 0) {
        const code = this.getBindingKey(action, slot);
        return getKeyDisplayName(code);
    }

    resetBindings() {
        this.bindings = JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS));
    }

    startListeningForRebind(callback) {
        this._rebindCallback = callback;
    }

    cancelListeningForRebind() {
        if (this._rebindCallback) {
            const cb = this._rebindCallback;
            this._rebindCallback = null;
            cb(null);
        }
    }

    isListeningForRebind() {
        return this._rebindCallback !== null;
    }

    resetDeltas() {
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.wheelDelta = 0;

        this._prevKeys = { ...this.keys };
        this._pressedKeys.clear();

        this._prevMouseButtons = { ...this.mouse.buttons };
    }

    clearHeldInput() {
        this.keys = {};
        this._prevKeys = {};
        this._pressedKeys.clear();
        for (const button of Object.keys(this.mouse.buttons)) this.mouse.buttons[button] = false;
        this._prevMouseButtons = { ...this.mouse.buttons };
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.wheelDelta = 0;
        this._updateDebugKeyUI();
    }

    setPointerLockEnabled(enabled) {
        this.pointerLockEnabled = !!enabled;
        if (!this.pointerLockEnabled) {
            this.mouse.deltaX = 0;
            this.mouse.deltaY = 0;
            for (const button of Object.keys(this.mouse.buttons)) {
                this.mouse.buttons[button] = false;
            }
        }
    }

    requestPointerLock() {
        if (!this.pointerLockEnabled || !this.canvas || typeof document === 'undefined') return false;
        if (document.pointerLockElement === this.canvas) return true;
        try {
            const request = this.canvas.requestPointerLock();
            if (request && typeof request.catch === 'function') {
                request.catch(error => console.warn('InputManager: requestPointerLock failed', error));
            }
            return true;
        } catch (error) {
            console.warn('InputManager: requestPointerLock failed', error);
            return false;
        }
    }

    releasePointerLock() {
        if (typeof document === 'undefined' || document.pointerLockElement !== this.canvas) return false;
        try {
            document.exitPointerLock();
            return true;
        } catch (error) {
            console.warn('InputManager: exitPointerLock failed', error);
            return false;
        }
    }

    _setupListeners() {
        if (typeof window === 'undefined') return;

        // A release outside this window may never produce a keyup/mouseup here.
        window.addEventListener('blur', () => this.clearHeldInput());

        window.addEventListener('keydown', (e) => {
            if (this._rebindCallback) {
                e.preventDefault();
                e.stopPropagation();
                const cb = this._rebindCallback;
                this._rebindCallback = null;
                if (e.code === 'Escape') {
                    cb(null);
                } else {
                    cb(e.code);
                }
                return;
            }

            const isTextInput = this._isEditableTarget(e.target);
            if (isTextInput) return;

            if (this.pointerLockEnabled && !isTextInput) {
                e.preventDefault();
            }

            const newPress = !e.repeat && !this.keys[e.code];
            if (newPress && !isTextInput) this._pressedKeys.add(e.code);
            // Auto-repeat must not resurrect a press consumed by gameplay/UI.
            if (!e.repeat) this.keys[e.code] = true;
            this._updateDebugKeyUI();

            if (!isTextInput && newPress && (this.bindings.toggleDebug?.includes(e.code) || e.code === 'F3')) {
                e.preventDefault();
                if (typeof document !== 'undefined') {
                    const debugPanel = document.getElementById('debug-panel');
                    if (debugPanel) {
                        debugPanel.classList.toggle('hidden');
                    }
                }
            }
        }, { capture: true });

        window.addEventListener('keyup', (e) => {
            if (this.pointerLockEnabled && !this._isEditableTarget(e.target)) {
                e.preventDefault();
            }
            this.keys[e.code] = false;
            this._updateDebugKeyUI();
        }, { capture: true });

        if (this.canvas) {
            this.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            this.canvas.addEventListener('mousedown', (e) => {
                if (this.pointerLockEnabled && !this.mouse.isLocked) {
                    if (e.preventDefault) e.preventDefault();
                    this.requestPointerLock();
                    return;
                }
                this.mouse.buttons[e.button] = true;
                this.mouse.lastX = e.clientX;
                this.mouse.lastY = e.clientY;
            });

            window.addEventListener('mouseup', (e) => {
                this.mouse.buttons[e.button] = false;
            });

            window.addEventListener('mousemove', (e) => {
                if (this.mouse.isLocked) {
                    this.mouse.deltaX += e.movementX;
                    this.mouse.deltaY += e.movementY;
                } else {
                    this.mouse.x = e.clientX;
                    this.mouse.y = e.clientY;
                    this.mouse.lastX = e.clientX;
                    this.mouse.lastY = e.clientY;
                }
            });

            this.canvas.addEventListener('wheel', (e) => {
                if (this.pointerLockEnabled) e.preventDefault();
                this.mouse.wheelDelta = Math.sign(e.deltaY);
            }, { passive: false });
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.clearHeldInput();
            });
            document.addEventListener('pointerlockchange', () => {
                const wasLocked = this.mouse.isLocked;
                const isLocked = document.pointerLockElement === this.canvas;
                this.mouse.isLocked = isLocked;
                if (!isLocked) {
                    this.mouse.deltaX = 0;
                    this.mouse.deltaY = 0;
                    for (const button of Object.keys(this.mouse.buttons)) {
                        this.mouse.buttons[button] = false;
                        this._prevMouseButtons[button] = false;
                    }
                }
                if (this.onPointerLockChange) this.onPointerLockChange(isLocked, wasLocked);
            });
        }
    }

    _isEditableTarget(target) {
        if (!target) return false;
        if (target.isContentEditable) return true;

        const tagName = target.tagName?.toUpperCase();
        if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
        if (tagName !== 'INPUT') return false;

        const type = (target.type || 'text').toLowerCase();
        return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit'].includes(type);
    }

    _updateDebugKeyUI() {
        if (typeof document === 'undefined') return;

        const actionMap = [
            ['moveForward', 'key-w'],
            ['moveLeft', 'key-a'],
            ['moveBackward', 'key-s'],
            ['moveRight', 'key-d'],
            ['interact', 'key-e'],
        ];

        for (const [action, elId] of actionMap) {
            const el = document.getElementById(elId);
            if (el) {
                if (this.isActionDown(action)) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        }
    }
}
