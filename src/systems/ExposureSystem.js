import { EXPOSURE_BALANCE } from '../gameplay/BalanceConfig.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class ExposureSystem {
    constructor(initialState = {}) {
        this.wetness = clamp(initialState.wetness ?? 0, 0, EXPOSURE_BALANCE.maximum);
        this.warmth = clamp(initialState.warmth ?? 100, 0, EXPOSURE_BALANCE.maximum);
    }

    update(deltaTime, context = {}) {
        const duration = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
        const rainFactor = clamp(context.rainFactor ?? 0, 0, 1);
        const fireIntensityMultiplier = clamp(context.fireIntensityMultiplier ?? 0, 0, 1);
        const inWater = !!context.inWater;
        const isNight = !!context.isNight;
        const nearCampfire = !!context.nearCampfire;
        let remaining = duration;
        let damage = 0;

        while (remaining > 0.000001) {
            const step = Math.min(EXPOSURE_BALANCE.maximumSubstep, remaining);
            const previousWetness = this.wetness;
            const wetnessRate = this._getWetnessRate({
                rainFactor,
                fireIntensityMultiplier,
                inWater,
                isNight,
                nearCampfire,
            });
            this.wetness = clamp(
                previousWetness + wetnessRate * step,
                0,
                EXPOSURE_BALANCE.maximum
            );
            const averageWetness = (previousWetness + this.wetness) * 0.5;
            const previousWarmth = this.warmth;
            const warmthRate = this._getWarmthRate({
                rainFactor,
                fireIntensityMultiplier,
                inWater,
                isNight,
                nearCampfire,
                wetness: averageWetness,
            });
            this.warmth = clamp(
                previousWarmth + warmthRate * step,
                0,
                EXPOSURE_BALANCE.maximum
            );
            damage += (this._getDamageRate(previousWarmth) + this._getDamageRate(this.warmth))
                * 0.5 * step;
            remaining -= step;
        }

        return { ...this.getModifiers(), damage };
    }

    _getWetnessRate({ rainFactor, fireIntensityMultiplier, inWater, isNight, nearCampfire }) {
        const rates = EXPOSURE_BALANCE.wetness;
        let rate = 0;
        if (inWater) rate += rates.waterGainPerSecond;
        rate += rates.rainGainPerSecond * rainFactor;
        if (!inWater && rainFactor <= 0.0001) {
            rate -= isNight ? rates.nightDryPerSecond : rates.dayDryPerSecond;
        }
        if (nearCampfire) rate -= rates.campfireDryPerSecond * fireIntensityMultiplier;
        return rate;
    }

    _getWarmthRate({
        rainFactor,
        fireIntensityMultiplier,
        inWater,
        isNight,
        nearCampfire,
        wetness,
    }) {
        const rates = EXPOSURE_BALANCE.warmth;
        let rate = 0;
        if (isNight) rate -= rates.nightLossPerSecond;
        rate -= rates.rainLossPerSecond * rainFactor;
        rate -= rates.wetnessLossPerSecond * (wetness / EXPOSURE_BALANCE.maximum);
        if (inWater) rate -= rates.waterLossPerSecond;
        if (!isNight && !inWater && rainFactor <= 0.0001 && wetness < 10) {
            rate += rates.dayRecoveryPerSecond;
        }
        if (nearCampfire) {
            rate += rates.campfireRecoveryPerSecond * fireIntensityMultiplier;
        }
        return rate;
    }

    _getDamageRate(warmth) {
        if (warmth >= EXPOSURE_BALANCE.freezingThreshold) return 0;
        const severity = 1 - warmth / EXPOSURE_BALANCE.freezingThreshold;
        return EXPOSURE_BALANCE.maximumHealthLossPerSecond * clamp(severity, 0, 1);
    }

    getModifiers() {
        let state = 'normal';
        let staminaRegenMultiplier = 1;
        let speedMultiplier = 1;

        if (this.warmth < EXPOSURE_BALANCE.freezingThreshold) {
            state = 'freezing';
            staminaRegenMultiplier = EXPOSURE_BALANCE.minimumStaminaRegenMultiplier;
            speedMultiplier = EXPOSURE_BALANCE.freezingSpeedMultiplier;
        } else if (this.warmth < EXPOSURE_BALANCE.coldThreshold) {
            state = 'cold';
            const range = EXPOSURE_BALANCE.coldThreshold - EXPOSURE_BALANCE.freezingThreshold;
            const warmthBlend = (this.warmth - EXPOSURE_BALANCE.freezingThreshold) / range;
            staminaRegenMultiplier = EXPOSURE_BALANCE.minimumStaminaRegenMultiplier
                + (1 - EXPOSURE_BALANCE.minimumStaminaRegenMultiplier) * warmthBlend;
        }

        return { state, staminaRegenMultiplier, speedMultiplier };
    }

    getSnapshot() {
        return { warmth: this.warmth, wetness: this.wetness };
    }

    getPresentation() {
        const wetnessIcon = this.wetness < 10
            ? ''
            : this.wetness < 50
                ? '💧'
                : this.wetness < 80
                    ? '💦'
                    : '🌊';
        const coldSeverity = clamp(
            (EXPOSURE_BALANCE.coldThreshold - this.warmth) / EXPOSURE_BALANCE.coldThreshold,
            0,
            1
        );
        return {
            ...this.getModifiers(),
            wetnessIcon,
            coldVignetteOpacity: coldSeverity * 0.65,
        };
    }

    setState(state = {}) {
        this.warmth = clamp(state.warmth ?? 100, 0, EXPOSURE_BALANCE.maximum);
        this.wetness = clamp(state.wetness ?? 0, 0, EXPOSURE_BALANCE.maximum);
    }
}
