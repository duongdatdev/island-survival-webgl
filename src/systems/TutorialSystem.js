/**
 * TutorialSystem — Step-by-step interactive tutorial for first-time players.
 * Each step has a trigger condition, message, and auto-dismiss timer.
 * State is persisted via localStorage so the tutorial only shows once.
 */
export class TutorialSystem {
    constructor() {
        /** @type {number} Current step index (-1 = not started, steps.length = completed) */
        this.currentStep = -1;

        /** @type {boolean} Whether tutorial has been completed or skipped */
        this.isComplete = false;

        /** @type {number} Timer for auto-dismiss current step */
        this._stepTimer = 0;

        /** @type {number} Delay before activating the first step */
        this._startDelay = 1.5;

        /** @type {boolean} Whether the tutorial has been started */
        this._started = false;

        // Internal tracking for trigger conditions
        this._playerHasMoved = false;
        this._cameraHasRotated = false;
        this._hasPickedUp = false;
        this._hasOpenedCrafting = false;
        this._hasCrafted = false;

        // Check localStorage for prior completion
        try {
            if (localStorage.getItem('island_survival_tutorial_done') === 'true') {
                this.isComplete = true;
            }
        } catch (e) { /* ignore */ }

        // DOM references
        this._overlayEl = null;
        this._textEl = null;
        this._stepEl = null;
        this._skipBtn = null;

        this._steps = [
            {
                id: 'move',
                text: '🎮 Dùng phím <b>W A S D</b> để di chuyển nhân vật',
                autoDismiss: 10,
                triggerCheck: () => this._playerHasMoved,
            },
            {
                id: 'camera',
                text: '🖱️ Giữ <b>chuột trái + kéo</b> để xoay camera. Cuộn chuột để zoom.',
                autoDismiss: 10,
                triggerCheck: () => this._cameraHasRotated,
            },
            {
                id: 'pickup',
                text: '📦 Đến gần tài nguyên và bấm <b>E</b> để nhặt',
                autoDismiss: 15,
                triggerCheck: () => this._hasPickedUp,
            },
            {
                id: 'crafting',
                text: '🔨 Bấm <b>C</b> để mở bảng chế tạo',
                autoDismiss: 12,
                triggerCheck: () => this._hasOpenedCrafting,
            },
            {
                id: 'craft_item',
                text: '⚒️ Chế tạo đồ vật để xây bè thoát khỏi đảo hoang!',
                autoDismiss: 8,
                triggerCheck: () => this._hasCrafted,
            },
            {
                id: 'raft',
                text: '⛵ Tìm <b>bãi bè ở bờ biển</b> và lắp ráp các bộ phận để thoát đảo!',
                autoDismiss: 10,
                triggerCheck: () => false, // Always auto-dismiss
            },
        ];
    }

    /**
     * Initialize DOM references. Called when game scene is ready.
     */
    init() {
        this._overlayEl = document.getElementById('tutorial-overlay');
        this._textEl = document.getElementById('tutorial-text');
        this._stepEl = document.getElementById('tutorial-step');
        this._skipBtn = document.getElementById('tutorial-skip');

        if (this._skipBtn) {
            this._skipBtn.addEventListener('click', () => this.skip());
        }

        if (this.isComplete) {
            this._hide();
        }
    }

    /**
     * Start the tutorial sequence
     */
    start() {
        if (this.isComplete) return;
        this._started = true;
        this._startDelay = 1.5;
    }

    /**
     * Per-frame update — advance steps based on triggers
     * @param {number} deltaTime
     * @param {object} inputManager
     * @param {object} player
     */
    update(deltaTime, inputManager, player) {
        if (this.isComplete) return;

        // Wait for start delay
        if (this._started && this.currentStep === -1) {
            this._startDelay -= deltaTime;
            if (this._startDelay <= 0) {
                this._advanceStep();
            }
            return;
        }

        if (this.currentStep < 0 || this.currentStep >= this._steps.length) return;

        const step = this._steps[this.currentStep];

        // Track player actions for triggers
        if (inputManager) {
            if (inputManager.isKeyDown('KeyW') || inputManager.isKeyDown('KeyA') ||
                inputManager.isKeyDown('KeyS') || inputManager.isKeyDown('KeyD')) {
                this._playerHasMoved = true;
            }
            if (inputManager.mouse.deltaX !== 0 || inputManager.mouse.deltaY !== 0) {
                if (inputManager.mouse.buttons[0] || inputManager.mouse.isLocked) {
                    this._cameraHasRotated = true;
                }
            }
        }

        // Check if step trigger condition is met
        if (step.triggerCheck()) {
            this._advanceStep();
            return;
        }

        // Auto-dismiss timer
        this._stepTimer -= deltaTime;
        if (this._stepTimer <= 0) {
            this._advanceStep();
        }
    }

    /**
     * Notify that player picked up a resource
     */
    notifyPickup() {
        this._hasPickedUp = true;
    }

    /**
     * Notify that crafting panel was opened
     */
    notifyCraftingOpened() {
        this._hasOpenedCrafting = true;
    }

    /**
     * Notify that an item was crafted
     */
    notifyCrafted() {
        this._hasCrafted = true;
    }

    /**
     * Skip the entire tutorial
     */
    skip() {
        this.isComplete = true;
        this._hide();
        this._persist();
    }

    /**
     * Advance to the next step or complete
     */
    _advanceStep() {
        this.currentStep++;

        if (this.currentStep >= this._steps.length) {
            // Tutorial complete
            this.isComplete = true;
            this._hide();
            this._persist();
            return;
        }

        const step = this._steps[this.currentStep];
        this._stepTimer = step.autoDismiss;
        this._show(step);
    }

    /**
     * Display a tutorial step
     */
    _show(step) {
        if (this._overlayEl) {
            this._overlayEl.classList.remove('hidden');
        }
        if (this._textEl) {
            this._textEl.innerHTML = step.text;
        }
        if (this._stepEl) {
            this._stepEl.textContent = `${this.currentStep + 1} / ${this._steps.length}`;
        }
    }

    /**
     * Hide tutorial overlay
     */
    _hide() {
        if (this._overlayEl) {
            this._overlayEl.classList.add('hidden');
        }
    }

    /**
     * Save completion state
     */
    _persist() {
        try {
            localStorage.setItem('island_survival_tutorial_done', 'true');
        } catch (e) { /* ignore */ }
    }

    /**
     * Reset tutorial (for testing / replay)
     */
    reset() {
        this.currentStep = -1;
        this.isComplete = false;
        this._started = false;
        this._playerHasMoved = false;
        this._cameraHasRotated = false;
        this._hasPickedUp = false;
        this._hasOpenedCrafting = false;
        this._hasCrafted = false;
        try {
            localStorage.removeItem('island_survival_tutorial_done');
        } catch (e) { /* ignore */ }
    }

    destroy() {
        this._hide();
        this._overlayEl = null;
        this._textEl = null;
        this._stepEl = null;
        this._skipBtn = null;
    }
}
