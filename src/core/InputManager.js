/**
 * Input Manager to handle Keyboard and Mouse events, Key Rebinding, and Browser Shortcut Suppression.
 */

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

/**
 * Formats a raw KeyboardEvent.code into a human-friendly string.
 * @param {string} code
 * @returns {string}
 */
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
        this._prevKeys = {}; // Previous frame key states for one-shot detection
        this._prevMouseButtons = {}; // Previous frame mouse button states
        this.mouse = {
            x: 0,
            y: 0,
            lastX: 0,
            lastY: 0,
            deltaX: 0,
            deltaY: 0,
            isLocked: false,
            buttons: {
                0: false, // Left click
                1: false, // Middle click
                2: false  // Right click
            },
            wheelDelta: 0
        };

        // Active key bindings
        this.bindings = JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS));

        // Rebinding listener callback
        this._rebindCallback = null;

        this._setupListeners();
    }

    // ── Action / Key Queries ──────────────────────────────────────────

    /**
     * Checks if a raw key code OR an action is currently held down.
     * @param {string} keyOrAction - e.g. 'KeyW' or 'moveForward'
     * @returns {boolean}
     */
    isKeyDown(keyOrAction) {
        if (this.bindings[keyOrAction]) {
            return this.isActionDown(keyOrAction);
        }
        return !!this.keys[keyOrAction];
    }

    /**
     * Checks if a raw key code OR an action was pressed this frame (one-shot).
     * @param {string} keyOrAction - e.g. 'KeyE' or 'interact'
     * @returns {boolean}
     */
    isKeyPressed(keyOrAction) {
        if (this.bindings[keyOrAction]) {
            return this.isActionPressed(keyOrAction);
        }
        return !!this.keys[keyOrAction] && !this._prevKeys[keyOrAction];
    }

    /**
     * Checks if any key bound to the action is currently held down.
     * @param {string} action
     * @returns {boolean}
     */
    isActionDown(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        const keys = Array.isArray(bound) ? bound : [bound];
        return keys.some(k => !!this.keys[k]);
    }

    /**
     * Checks if any key bound to the action was pressed this frame (one-shot).
     * @param {string} action
     * @returns {boolean}
     */
    isActionPressed(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        const keys = Array.isArray(bound) ? bound : [bound];
        return keys.some(k => !!this.keys[k] && !this._prevKeys[k]);
    }

    /**
     * Consumes an action so it won't fire again this frame.
     * @param {string} action
     */
    consumeAction(action) {
        const bound = this.bindings[action];
        if (!bound) return;
        const keys = Array.isArray(bound) ? bound : [bound];
        for (const k of keys) {
            this.keys[k] = false;
            this._prevKeys[k] = true;
        }
    }

    /**
     * Consumes a specific key code so it won't fire again this frame.
     * @param {string} key
     */
    consumeKey(key) {
        this.keys[key] = false;
        this._prevKeys[key] = true;
    }

    /**
     * Returns true only on the first frame a mouse button is pressed.
     * @param {number} button - 0 = left, 1 = middle, 2 = right
     * @returns {boolean}
     */
    isMousePressed(button = 0) {
        return !!this.mouse.buttons[button] && !this._prevMouseButtons[button];
    }

    // ── Key Rebinding API ──────────────────────────────────────────

    /**
     * Get all active key bindings.
     * @returns {object}
     */
    getBindings() {
        return JSON.parse(JSON.stringify(this.bindings));
    }

    /**
     * Set multiple key bindings at once.
     * @param {object} newBindings
     */
    setBindings(newBindings) {
        if (!newBindings || typeof newBindings !== 'object') return;
        for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
            if (newBindings[action]) {
                const val = newBindings[action];
                this.bindings[action] = Array.isArray(val) ? [...val] : [val];
            }
        }
    }

    /**
     * Set the primary (or secondary) key for an action.
     * @param {string} action
     * @param {string} keyCode
     * @param {number} slot - 0 for primary, 1 for secondary
     */
    setBinding(action, keyCode, slot = 0) {
        if (!this.bindings[action]) {
            this.bindings[action] = [];
        }
        if (!Array.isArray(this.bindings[action])) {
            this.bindings[action] = [this.bindings[action]];
        }
        this.bindings[action][slot] = keyCode;
    }

    /**
     * Get the primary bound key code for an action.
     * @param {string} action
     * @param {number} slot
     * @returns {string}
     */
    getBindingKey(action, slot = 0) {
        const bound = this.bindings[action];
        if (!bound) return '';
        if (Array.isArray(bound)) return bound[slot] || bound[0] || '';
        return bound;
    }

    /**
     * Get the human-friendly display name of the primary key bound to an action.
     * @param {string} action
     * @param {number} slot
     * @returns {string}
     */
    getBindingDisplayName(action, slot = 0) {
        const code = this.getBindingKey(action, slot);
        return getKeyDisplayName(code);
    }

    /**
     * Reset all bindings to defaults.
     */
    resetBindings() {
        this.bindings = JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS));
    }

    /**
     * Starts listening for the next key press for rebinding.
     * @param {(keyCode: string|null) => void} callback - Called with keyCode or null if cancelled.
     */
    startListeningForRebind(callback) {
        this._rebindCallback = callback;
    }

    /**
     * Cancels any pending rebind listening.
     */
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

        // Snapshot current key states for next frame's one-shot detection
        this._prevKeys = { ...this.keys };

        // Snapshot mouse button states for one-shot click detection (v0.5 combat)
        this._prevMouseButtons = { ...this.mouse.buttons };
    }

    _setupListeners() {
        if (typeof window === 'undefined') return;

        // Keyboard Events
        window.addEventListener('keydown', (e) => {
            // Rebinding listening mode: intercept next key
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

            // Check if typing in a text input or textarea
            const isTextInput = e.target && (
                e.target.tagName === 'INPUT' && e.target.type === 'text' ||
                e.target.tagName === 'TEXTAREA'
            );

            // Prevent default browser actions for game control keys & browser shortcuts
            if (!isTextInput) {
                // Prevent scrolling / navigation keys
                if ([
                    'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'PageUp', 'PageDown', 'Home', 'End'
                ].includes(e.code)) {
                    e.preventDefault();
                }

                // Prevent common disruptive browser function keys (Help, Find, Caret Browsing)
                if (['F1', 'F3', 'F7'].includes(e.code)) {
                    e.preventDefault();
                }

                // Prevent browser shortcut combos: Save, Print, Find, Bookmark, History, Downloads, View Source
                if (e.ctrlKey || e.metaKey) {
                    if (['KeyS', 'KeyP', 'KeyF', 'KeyG', 'KeyD', 'KeyH', 'KeyJ', 'KeyU'].includes(e.code)) {
                        e.preventDefault();
                    }
                }

                // Prevent default for Escape (prevent exiting browser fullscreen unexpectedly)
                if (e.code === 'Escape') {
                    e.preventDefault();
                }
            }

            this.keys[e.code] = true;
            this._updateDebugKeyUI();

            // Toggle Pointer Lock with 'L' key
            if (e.code === 'KeyL' && !isTextInput) {
                this.togglePointerLock();
            }

            // Toggle Debug Panel with toggleDebug action or F3
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

        // Mouse Events on Canvas
        if (this.canvas) {
            // Prevent default context menu on right click during gameplay
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
                    // In Pointer Lock, e.movementX and e.movementY give direct deltas
                    this.mouse.deltaX = e.movementX;
                    this.mouse.deltaY = e.movementY;
                } else {
                    this.mouse.x = e.clientX;
                    this.mouse.y = e.clientY;

                    // Drag to rotate: Only calculate delta if left mouse button is pressed
                    if (this.mouse.buttons[0]) {
                        this.mouse.deltaX = e.clientX - this.mouse.lastX;
                        this.mouse.deltaY = e.clientY - this.mouse.lastY;
                    }

                    this.mouse.lastX = e.clientX;
                    this.mouse.lastY = e.clientY;
                }
            });

            // Mouse scroll is consumed by the gameplay hotbar.
            this.canvas.addEventListener('wheel', (e) => {
                // Normalized zoom delta (-1 or 1)
                this.mouse.wheelDelta = Math.sign(e.deltaY);
            }, { passive: true });
        }

        // Pointer Lock State Changes
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
