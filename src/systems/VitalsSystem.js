import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';


export class VitalsSystem {
    constructor() {
        this.hunger = 100;
        this.thirst = 100;
        this.stamina = 100;
        this.health = 100;

        this._hungerTimer = 0;
        this._thirstTimer = 0;
        this._healthDrainTimer = 0;

        this.hungerDrainInterval = 30;
        this.thirstDrainInterval = 20;
        this.healthDrainInterval = 5;

        this.staminaDrainRate = PLAYER_BALANCE.staminaDrainPerSecond;
        this.staminaRegenRate = PLAYER_BALANCE.staminaRegenPerSecond;
        this.sprintRecoveryThreshold = PLAYER_BALANCE.sprintRecoveryThreshold;
        this._sprintLocked = false;

        this.onChange = null;

        this.onGameOver = null;

        this._isGameOver = false;
    }

    update(deltaTime, isSprinting) {
        if (this._isGameOver) return;

        this._hungerTimer += deltaTime;
        if (this._hungerTimer >= this.hungerDrainInterval) {
            this._hungerTimer -= this.hungerDrainInterval;
            this._setVital('hunger', this.hunger - 1);
        }

        this._thirstTimer += deltaTime;
        if (this._thirstTimer >= this.thirstDrainInterval) {
            this._thirstTimer -= this.thirstDrainInterval;
            this._setVital('thirst', this.thirst - 1);
        }

        if (this.stamina <= 0) this._sprintLocked = true;

        if (isSprinting && !this._sprintLocked) {
            this._setVital('stamina', this.stamina - this.staminaDrainRate * deltaTime);
            if (this.stamina <= 0) this._sprintLocked = true;
        } else {
            if (this.stamina < 100) {
                this._setVital('stamina', this.stamina + this.staminaRegenRate * deltaTime);
            }
            if (this._sprintLocked && this.stamina >= this.sprintRecoveryThreshold) {
                this._sprintLocked = false;
            }
        }

        if (this.hunger <= 0 || this.thirst <= 0) {
            this._healthDrainTimer += deltaTime;
            if (this._healthDrainTimer >= this.healthDrainInterval) {
                this._healthDrainTimer -= this.healthDrainInterval;
                this._setVital('health', this.health - 1);
            }
        } else {
            this._healthDrainTimer = 0;
        }

        if (this.health <= 0 && !this._isGameOver) {
            this._isGameOver = true;
            if (this.onGameOver) {
                this.onGameOver();
            }
        }
    }

    eat(amount = 40) {
        this._setVital('hunger', this.hunger + amount);
    }

    drink(amount = 50) {
        this._setVital('thirst', this.thirst + amount);
    }

    heal(amount = 20) {
        this._setVital('health', this.health + amount);
    }

    canSprint() {
        return !this._sprintLocked && this.stamina > 0;
    }

    getAll() {
        return {
            hunger: this.hunger,
            thirst: this.thirst,
            stamina: this.stamina,
            health: this.health
        };
    }

    reset() {
        this._isGameOver = false;
        this._sprintLocked = false;
        this._hungerTimer = 0;
        this._thirstTimer = 0;
        this._healthDrainTimer = 0;
        this._setVital('hunger', 100);
        this._setVital('thirst', 100);
        this._setVital('stamina', 100);
        this._setVital('health', 100);
    }

    _setVital(id, value) {
        const clamped = Math.max(0, Math.min(100, value));
        this[id] = clamped;
        if (this.onChange) {
            this.onChange(id, clamped, 100);
        }
    }
}
