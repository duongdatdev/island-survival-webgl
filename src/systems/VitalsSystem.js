import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

/**
 * VitalsSystem — Manages player survival vitals (Hunger, Thirst, Stamina, Health)
 * 
 * Each vital ranges 0–100, starting at 100.
 * - Hunger drains 1 every 30s. Eating Cooked Meal restores +40.
 * - Thirst drains 1 every 20s. Drinking Fresh Water restores +50.
 * - Stamina drains only while sprinting and regenerates otherwise.
 *   Empty stamina locks sprint until a small recovery threshold is reached.
 * - Health drains 1 every 5s when hunger OR thirst = 0.
 *   When health = 0, game over.
 */

export class VitalsSystem {
    constructor() {
        this.hunger = 100;
        this.thirst = 100;
        this.stamina = 100;
        this.health = 100;

        // Drain accumulators (seconds since last drain tick)
        this._hungerTimer = 0;
        this._thirstTimer = 0;
        this._healthDrainTimer = 0;

        // Drain rates (seconds per 1 unit drain) — matches ROADMAP spec
        this.hungerDrainInterval = 30;
        this.thirstDrainInterval = 20;
        this.healthDrainInterval = 5;

        // Stamina rates (units per second)
        this.staminaDrainRate = PLAYER_BALANCE.staminaDrainPerSecond;
        this.staminaRegenRate = PLAYER_BALANCE.staminaRegenPerSecond;
        this.sprintRecoveryThreshold = PLAYER_BALANCE.sprintRecoveryThreshold;
        this._sprintLocked = false;

        /** @type {Function|null} Callback fired when any vital changes: (vitalId, newValue, maxValue) */
        this.onChange = null;

        /** @type {Function|null} Callback fired on game over (health reached 0) */
        this.onGameOver = null;

        this._isGameOver = false;
    }

    /**
     * Update vitals based on elapsed time and player state
     * @param {number} deltaTime - Seconds since last frame
     * @param {boolean} isSprinting - Whether the player is sprinting this frame
     */
    update(deltaTime, isSprinting) {
        if (this._isGameOver) return;

        // --- Hunger drain ---
        this._hungerTimer += deltaTime;
        if (this._hungerTimer >= this.hungerDrainInterval) {
            this._hungerTimer -= this.hungerDrainInterval;
            this._setVital('hunger', this.hunger - 1);
        }

        // --- Thirst drain ---
        this._thirstTimer += deltaTime;
        if (this._thirstTimer >= this.thirstDrainInterval) {
            this._thirstTimer -= this.thirstDrainInterval;
            this._setVital('thirst', this.thirst - 1);
        }

        // --- Stamina ---
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

        // --- Health drain when starving or dehydrated ---
        if (this.hunger <= 0 || this.thirst <= 0) {
            this._healthDrainTimer += deltaTime;
            if (this._healthDrainTimer >= this.healthDrainInterval) {
                this._healthDrainTimer -= this.healthDrainInterval;
                this._setVital('health', this.health - 1);
            }
        } else {
            this._healthDrainTimer = 0;
        }

        // --- Game over check ---
        if (this.health <= 0 && !this._isGameOver) {
            this._isGameOver = true;
            if (this.onGameOver) {
                this.onGameOver();
            }
        }
    }

    /**
     * Restore hunger by eating food
     * @param {number} amount
     */
    eat(amount = 40) {
        this._setVital('hunger', this.hunger + amount);
    }

    /**
     * Restore thirst by drinking water
     * @param {number} amount
     */
    drink(amount = 50) {
        this._setVital('thirst', this.thirst + amount);
    }

    /**
     * Restore health directly
     * @param {number} amount
     */
    heal(amount = 20) {
        this._setVital('health', this.health + amount);
    }

    /**
     * Whether sprinting is currently available.
     * A recovery threshold avoids rapid walk/sprint flicker while Shift is held.
     * @returns {boolean}
     */
    canSprint() {
        return !this._sprintLocked && this.stamina > 0;
    }

    /**
     * Get all vitals as an object
     * @returns {{ hunger: number, thirst: number, stamina: number, health: number }}
     */
    getAll() {
        return {
            hunger: this.hunger,
            thirst: this.thirst,
            stamina: this.stamina,
            health: this.health
        };
    }

    /**
     * Reset all vitals to full
     */
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

    /**
     * Internal helper to clamp and set a vital value, fire callback
     * @param {string} id
     * @param {number} value
     */
    _setVital(id, value) {
        const clamped = Math.max(0, Math.min(100, value));
        this[id] = clamped;
        if (this.onChange) {
            this.onChange(id, clamped, 100);
        }
    }
}
