export const PLAYER_BALANCE = Object.freeze({
    walkSpeed: 3.2,
    sprintSpeed: 4.4,
    groundAcceleration: 18,
    groundDeceleration: 24,
    staminaDrainPerSecond: 18,
    staminaRegenPerSecond: 14,
    sprintRecoveryThreshold: 20,
});

export const SURVIVAL_BALANCE = Object.freeze({
    hungerDrainPerSecond: 0.10,
    thirstDrainPerSecond: 0.14,
    depletedHealthDrainPerSecond: 1.5,
});

export const ENVIRONMENT_BALANCE = Object.freeze({
    dayDurationSeconds: 600,
    weatherDurationMinSeconds: 120,
    weatherDurationMaxSeconds: 240,
    weatherTransitionSeconds: 12,
});

export const MOVEMENT_FEEL = Object.freeze({
    walkStepDistance: 1.25,
    sprintStepDistance: 1.35,
    sprintFovBoostDegrees: 4,
    fovResponse: 9,
    motionResponse: 8,
    walkBobHorizontal: 0.008,
    walkBobVertical: 0.014,
    sprintBobMultiplier: 1.4,
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
