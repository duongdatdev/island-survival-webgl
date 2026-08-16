export class TutorialSystem {
    constructor() {
        this.currentStep = -1;

        this.isComplete = false;

        this._stepTimer = 0;

        this._startDelay = 1.5;

        this._started = false;

        this._playerHasMoved = false;
        this._cameraHasRotated = false;
        this._hasPickedUp = false;
        this._hasOpenedCrafting = false;
        this._hasCrafted = false;

        try {
            if (localStorage.getItem('island_survival_tutorial_done') === 'true') {
                this.isComplete = true;
            }
        } catch (e) { }

        this._overlayEl = null;
        this._textEl = null;
        this._stepEl = null;
        this._skipBtn = null;

        this._steps = [
            {
                id: 'move',
                text: '🎮 Dùng <b>W A S D</b> để di chuyển, giữ <b>Shift</b> để chạy nước rút',
                autoDismiss: 10,
                triggerCheck: () => this._playerHasMoved,
            },
            {
                id: 'camera',
                text: '🖱️ Di <b>chuột</b> để nhìn xung quanh. <b>Cuộn chuột</b> để đổi ô trang bị.',
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
                triggerCheck: () => false,
            },
        ];
    }

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

    start() {
        if (this.isComplete) return;
        this._started = true;
        this._startDelay = 1.5;
    }

    update(deltaTime, inputManager, player) {
        if (this.isComplete) return;

        if (this._started && this.currentStep === -1) {
            this._startDelay -= deltaTime;
            if (this._startDelay <= 0) {
                this._advanceStep();
            }
            return;
        }

        if (this.currentStep < 0 || this.currentStep >= this._steps.length) return;

        const step = this._steps[this.currentStep];

        if (inputManager) {
            if (inputManager.isActionDown && (
                inputManager.isActionDown('moveForward') ||
                inputManager.isActionDown('moveBackward') ||
                inputManager.isActionDown('moveLeft') ||
                inputManager.isActionDown('moveRight')
            )) {
                this._playerHasMoved = true;
            } else {
                const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD',
                    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
                if (moveKeys.some(k => inputManager.isKeyDown(k))) {
                    this._playerHasMoved = true;
                }
            }
            if (inputManager.mouse.deltaX !== 0 || inputManager.mouse.deltaY !== 0) {
                if (inputManager.mouse.buttons[0] || inputManager.mouse.isLocked) {
                    this._cameraHasRotated = true;
                }
            }
        }

        if (step.triggerCheck()) {
            this._advanceStep();
            return;
        }

        this._stepTimer -= deltaTime;
        if (this._stepTimer <= 0) {
            this._advanceStep();
        }
    }

    notifyPickup() {
        this._hasPickedUp = true;
    }

    notifyCraftingOpened() {
        this._hasOpenedCrafting = true;
    }

    notifyCrafted() {
        this._hasCrafted = true;
    }

    skip() {
        this.isComplete = true;
        this._hide();
        this._persist();
    }

    _advanceStep() {
        this.currentStep++;

        if (this.currentStep >= this._steps.length) {
            this.isComplete = true;
            this._hide();
            this._persist();
            return;
        }

        const step = this._steps[this.currentStep];
        this._stepTimer = step.autoDismiss;
        this._show(step);
    }

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

    _hide() {
        if (this._overlayEl) {
            this._overlayEl.classList.add('hidden');
        }
    }

    _persist() {
        try {
            localStorage.setItem('island_survival_tutorial_done', 'true');
        } catch (e) { }
    }

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
        } catch (e) { }
    }

    destroy() {
        this._hide();
        this._overlayEl = null;
        this._textEl = null;
        this._stepEl = null;
        this._skipBtn = null;
    }
}
