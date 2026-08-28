import { MOVEMENT_FEEL, PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

export class MovementFeedback {
    constructor(options = {}) {
        this.reducedMotion = !!options.reducedMotion;
        this.distanceSinceStep = 0;
        this.phase = 0;
        this.motionAmount = 0;
        this.fovBoostDegrees = 0;
        this.combatKick = 0;
    }

    triggerCombatKick(amount = 0.012) {
        if (this.reducedMotion) return;
        this.combatKick = Math.max(this.combatKick, Math.max(0, amount));
    }

    update(deltaTime, distanceMoved, currentSpeed, isSprinting) {
        const running = isSprinting && currentSpeed > PLAYER_BALANCE.walkSpeed + 0.1;
        const moving = distanceMoved > 0.0001 && currentSpeed > 0.1;
        const stepDistance = running
            ? MOVEMENT_FEEL.sprintStepDistance
            : MOVEMENT_FEEL.walkStepDistance;

        let stepCount = 0;
        if (moving) {
            this.distanceSinceStep += distanceMoved;
            while (this.distanceSinceStep >= stepDistance) {
                this.distanceSinceStep -= stepDistance;
                stepCount++;
            }
            this.phase += distanceMoved * Math.PI * 2 / stepDistance;
        }

        const response = 1 - Math.exp(-MOVEMENT_FEEL.motionResponse * deltaTime);
        this.motionAmount += ((moving ? 1 : 0) - this.motionAmount) * response;

        const targetFovBoost = isSprinting && moving
            ? MOVEMENT_FEEL.sprintFovBoostDegrees
            : 0;
        const fovResponse = 1 - Math.exp(-MOVEMENT_FEEL.fovResponse * deltaTime);
        this.fovBoostDegrees += (targetFovBoost - this.fovBoostDegrees) * fovResponse;
        const kickOffset = this.combatKick;
        this.combatKick *= Math.exp(-18 * deltaTime);
        if (this.combatKick < 0.0001) this.combatKick = 0;

        if (this.reducedMotion) {
            this.fovBoostDegrees = 0;
            this.combatKick = 0;
            return {
                stepCount,
                running,
                fovBoostDegrees: 0,
                horizontalOffset: 0,
                verticalOffset: 0,
            };
        }

        const bobMultiplier = running ? MOVEMENT_FEEL.sprintBobMultiplier : 1;
        return {
            stepCount,
            running,
            fovBoostDegrees: this.fovBoostDegrees,
            horizontalOffset: Math.sin(this.phase) * MOVEMENT_FEEL.walkBobHorizontal
                * bobMultiplier * this.motionAmount,
            verticalOffset: (Math.abs(Math.cos(this.phase)) - 0.5)
                * MOVEMENT_FEEL.walkBobVertical * bobMultiplier * this.motionAmount
                - kickOffset,
        };
    }
}
