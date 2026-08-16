
export const DEFAULT_KEY_BINDINGS = {
    moveForward: ['KeyW', 'ArrowUp'],
    moveBackward: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
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
        return !!this.keys[keyOrAction] && !this._prevKeys[keyOrAction];
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
        return keys.some(k => !!this.keys[k] && !this._prevKeys[k]);
    }

    consumeAction(action) {
        const bound = this.bindings[action];
        if (!bound) return;
        const keys = Array.isArray(bound) ? bound : [bound];
        for (const k of keys) {
            this.keys[k] = false;
            this._prevKeys[k] = true;
        }
    }

    consumeKey(key) {
        this.keys[key] = false;
        this._prevKeys[key] = true;
    }

    isMousePressed(button = 0) {
        return !!this.mouse.buttons[button] && !this._prevMouseButtons[button];
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

        this._prevMouseButtons = { ...this.mouse.buttons };
    }

    _setupListeners() {
        if (typeof window === 'undefined') return;

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

            const isTextInput = e.target && (
                e.target.tagName === 'INPUT' && e.target.type === 'text' ||
                e.target.tagName === 'TEXTAREA'
            );

            if (!isTextInput) {
                if ([
                    'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'PageUp', 'PageDown', 'Home', 'End'
                ].includes(e.code)) {
                    e.preventDefault();
                }

                if (['F1', 'F3', 'F7'].includes(e.code)) {
                    e.preventDefault();
                }

                if (e.ctrlKey || e.metaKey) {
                    if (['KeyS', 'KeyP', 'KeyF', 'KeyG', 'KeyD', 'KeyH', 'KeyJ', 'KeyU'].includes(e.code)) {
                        e.preventDefault();
                    }
                }

                if (e.code === 'Escape') {
                    e.preventDefault();
                }
            }

            this.keys[e.code] = true;
            this._updateDebugKeyUI();

            if (e.code === 'KeyL' && !isTextInput) {
                this.togglePointerLock();
            }

            if (!isTextInput && (this.isActionPressed('toggleDebug') || e.code === 'F3')) {
                e.preventDefault();
                if (typeof document !== 'undefined') {
                    const debugPanel = document.getElementById('debug-panel');
                    if (debugPanel) {
                        debugPanel.classList.toggle('hidden');
                    }
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this._updateDebugKeyUI();
        });

        if (this.canvas) {
            this.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            this.canvas.addEventListener('mousedown', (e) => {
                this.mouse.buttons[e.button] = true;
                this.mouse.lastX = e.clientX;
                this.mouse.lastY = e.clientY;
            });

            window.addEventListener('mouseup', (e) => {
                this.mouse.buttons[e.button] = false;
            });

            window.addEventListener('mousemove', (e) => {
                if (this.mouse.isLocked) {
                    this.mouse.deltaX = e.movementX;
                    this.mouse.deltaY = e.movementY;
                } else {
                    this.mouse.x = e.clientX;
                    this.mouse.y = e.clientY;

                    if (this.mouse.buttons[0]) {
                        this.mouse.deltaX = e.clientX - this.mouse.lastX;
                        this.mouse.deltaY = e.clientY - this.mouse.lastY;
                    }

                    this.mouse.lastX = e.clientX;
                    this.mouse.lastY = e.clientY;
                }
            });

            this.canvas.addEventListener('wheel', (e) => {
                this.mouse.wheelDelta = Math.sign(e.deltaY);
            }, { passive: true });
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('pointerlockchange', () => {
                this.mouse.isLocked = (document.pointerLockElement === this.canvas);
            });
        }
    }

    togglePointerLock() {
        if (!this.canvas || typeof document === 'undefined') return;
        if (this.mouse.isLocked) {
            document.exitPointerLock();
        } else {
            this.canvas.requestPointerLock();
        }
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
