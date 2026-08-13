/**
 * Shared movement and wildlife tuning.
 *
 * Keeping these values together makes the important match-ups visible: a
 * walking player can disengage from a boar, sprinting creates a short escape
 * window from a shark, and burst attacks are faster than sprinting without
 * becoming unavoidable homing missiles.
 */
export const PLAYER_BALANCE = Object.freeze({
    walkSpeed: 3.2,
    sprintSpeed: 4.4,
    staminaDrainPerSecond: 18,
    staminaRegenPerSecond: 14,
    sprintRecoveryThreshold: 20,
});

export const CREATURE_BALANCE = Object.freeze({
    crab: Object.freeze({
        maxHealth: 10,
        baseSpeed: 1.5,
        detectionRadius: 2.5,
        fleeSpeedMultiplier: 1.3,
    }),
    seagull: Object.freeze({
        maxHealth: 15,
        baseSpeed: 4.0,
        detectionRadius: 6.0,
    }),
    boar: Object.freeze({
        maxHealth: 55,
        baseSpeed: 2.6,
        detectionRadius: 6.5,
        attackRange: 1.5,
        attackDamage: 12,
        attackCooldown: 2.4,
        fleeThreshold: 15,
        chargeTriggerRange: 5.5,
        chargeSpeed: 5.2,
        chargeWindup: 0.5,
        chargeDuration: 0.65,
        chargeRecovery: 0.75,
        chargeCooldown: 3.5,
    }),
    shark: Object.freeze({
        maxHealth: 60,
        baseSpeed: 3.6,
        detectionRadius: 7.0,
        attackRange: 2.2,
        attackDamage: 14,
        attackCooldown: 3.0,
        fleeThreshold: 18,
        rushTriggerRange: 5.0,
        rushSpeed: 5.2,
    }),
});
