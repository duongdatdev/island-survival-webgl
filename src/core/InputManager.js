/**
 * Input Manager to handle Keyboard and Mouse events
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
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

        this._setupListeners();
    }

    isKeyDown(key) {
        // key can be 'KeyW', 'KeyA', 'Space', 'ArrowUp', etc.
        return !!this.keys[key];
    }

    resetDeltas() {
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.wheelDelta = 0;
    }

    _setupListeners() {
        // Keyboard Events
        window.addEventListener('keydown', (e) => {
            // Prevent default actions for gameplay keys (like space bar page-scrolling)
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            this.keys[e.code] = true;
            this._updateDebugKeyUI(e.code, true);

            // Toggle Pointer Lock with 'L' key
            if (e.code === 'KeyL') {
                this.togglePointerLock();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this._updateDebugKeyUI(e.code, false);
        });

        // Mouse Events on Canvas
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

        // Mouse Scroll for Camera Zooming
        this.canvas.addEventListener('wheel', (e) => {
            // Normalized zoom delta (-1 or 1)
            this.mouse.wheelDelta = Math.sign(e.deltaY);
        }, { passive: true });

        // Pointer Lock State Changes
        document.addEventListener('pointerlockchange', () => {
            this.mouse.isLocked = (document.pointerLockElement === this.canvas);
        });
    }

    togglePointerLock() {
        if (this.mouse.isLocked) {
            document.exitPointerLock();
        } else {
            this.canvas.requestPointerLock();
        }
    }

    _updateDebugKeyUI(code, isActive) {
        let elId = null;
        switch (code) {
            case 'KeyW': elId = 'key-w'; break;
            case 'KeyA': elId = 'key-a'; break;
            case 'KeyS': elId = 'key-s'; break;
            case 'KeyD': elId = 'key-d'; break;
            case 'Space': elId = 'key-space'; break;
        }

        if (elId) {
            const el = document.getElementById(elId);
            if (el) {
                if (isActive) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        }
    }
}
