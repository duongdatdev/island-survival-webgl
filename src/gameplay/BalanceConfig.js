export const PLAYER_BALANCE = Object.freeze({
    walkSpeed: 3.2,
    sprintSpeed: 4.8,
    groundAcceleration: 18,
    groundDeceleration: 24,
    maxSlopeDegrees: 50,
    maxStepHeight: 0.55,
    groundSnapDistance: 0.08,
    gravity: 18,
    jumpHeight: 0.9,
    terminalFallSpeed: 30,
    staminaDrainPerSecond: 12,
    staminaRegenPerSecond: 16,
    sprintRecoveryThreshold: 20,
});

export const SURVIVAL_BALANCE = Object.freeze({
    hungerDrainPerSecond: 0.08,
    thirstDrainPerSecond: 0.12,
    depletedHealthDrainPerSecond: 0.6,
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

export const WEATHER_GAMEPLAY_BALANCE = Object.freeze({
    waterCollectorSecondsPerUnitAtFullRain: 45,
    maxDebrisWindWeight: 0.4,
    maxDebrisSpeedBoost: 0.35,
    maxSharkDetectionBoost: 0.4,
    maxSharkSpeedBoost: 0.2,
    minimumCampfireIntensity: 0.4,
});

export const COMBAT_BALANCE = Object.freeze({
    fist: Object.freeze({
        id: 'fist',
        type: 'melee',
        attackKind: 'arc',
        damage: 5,
        range: 1.4,
        cooldown: 0.42,
        duration: 0.42,
        impactTime: 0.16,
        halfArc: Math.PI * 0.35,
    }),
    stone_axe: Object.freeze({
        id: 'stone_axe',
        type: 'melee',
        attackKind: 'arc',
        damage: 14,
        range: 2.0,
        cooldown: 0.54,
        duration: 0.54,
        impactTime: 0.24,
        halfArc: Math.PI * 0.35,
    }),
    spear: Object.freeze({
        id: 'spear',
        type: 'melee',
        attackKind: 'thrust',
        damage: 22,
        range: 2.6,
        cooldown: 0.8,
        duration: 0.68,
        impactTime: 0.28,
        hitRadius: 0.25,
    }),
    bow: Object.freeze({
        id: 'bow',
        type: 'ranged',
        attackKind: 'projectile',
        damage: 28,
        minDamage: 10,
        maxDamage: 28,
        range: 70,
        cooldown: 0.35,
        minimumCharge: 0.25,
        fullChargeSeconds: 1.0,
        minProjectileSpeed: 14,
        maxProjectileSpeed: 28,
        projectileGravity: 9.8,
        projectileLifetime: 2.5,
        projectileRadius: 0.08,
    }),
});

export const EXPOSURE_BALANCE = Object.freeze({
    maximum: 100,
    maximumSubstep: 0.1,
    wetness: Object.freeze({
        waterGainPerSecond: 10,
        rainGainPerSecond: 0.6,
        dayDryPerSecond: 0.25,
        nightDryPerSecond: 0.18,
        campfireDryPerSecond: 4,
    }),
    warmth: Object.freeze({
        nightLossPerSecond: 0.08,
        rainLossPerSecond: 0.12,
        wetnessLossPerSecond: 0.25,
        waterLossPerSecond: 0.20,
        dayRecoveryPerSecond: 0.18,
        campfireRecoveryPerSecond: 2.5,
    }),
    coldThreshold: 40,
    freezingThreshold: 20,
    minimumStaminaRegenMultiplier: 0.5,
    freezingSpeedMultiplier: 0.85,
    maximumHealthLossPerSecond: 0.35,
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
        attackRange: 1.2,
        attackDamage: 12,
        attackCooldown: 2.4,
        fleeThreshold: 15,
        chargeTriggerRange: 5.5,
        chargeSpeed: 5.2,
        chargeWindup: 0.7,
        chargeDuration: 0.65,
        chargeRecovery: 1.0,
        chargeCooldown: 4.0,
    }),
    shark: Object.freeze({
        maxHealth: 70,
        baseSpeed: 3.6,
        detectionRadius: 7.0,
        attackRange: 1.7,
        attackDamage: 16,
        attackCooldown: 3.0,
        fleeThreshold: 18,
        rushTriggerRange: 5.0,
        rushSpeed: 5.2,
    }),
});
