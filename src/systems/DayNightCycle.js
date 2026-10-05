import { ENVIRONMENT_BALANCE } from '../gameplay/BalanceConfig.js';

function smoothstep(low, high, value) {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

function mixColor(a, b, t) {
    return a.map((value, i) => value + (b[i] - value) * t);
}

export class DayNightCycle {
    constructor() {
        this.timeOfDay = 0.2;
        this.daySpeed = 1 / ENVIRONMENT_BALANCE.dayDurationSeconds;
        this.isPaused = false;

        this.dawnTime = 0.2;
        this.duskTime = 0.75;

        this.skyTopColor = [0.53, 0.74, 0.90];
        this.skyBottomColor = [0.80, 0.85, 0.95];
        this.fogColor = [0.53, 0.74, 0.90];
        this.fogDensity = 0.008;
        this.horizonColor = [0.70, 0.75, 0.85];
    }

    update(deltaTime) {
        if (this.isPaused) return;
        this.timeOfDay += deltaTime * this.daySpeed;
        if (this.timeOfDay > 1.0) this.timeOfDay -= 1.0;
    }

    getSunDirection() {
        // Match the orbit to the gameplay dawn/dusk times, including midnight wrap.
        const t = ((this.timeOfDay % 1) + 1) % 1;
        const dayLength = this.duskTime - this.dawnTime;
        const phase = t >= this.dawnTime && t < this.duskTime
            ? (t - this.dawnTime) / dayLength
            : 1 + ((t - this.duskTime + 1) % 1) / (1 - dayLength);
        const angle = phase * Math.PI;
        return [Math.cos(angle) * 0.8, Math.sin(angle), Math.cos(angle) * 0.6];
    }

    getMoonDirection() {
        const sunDirection = this.getSunDirection();
        return [-sunDirection[0], -sunDirection[1], -sunDirection[2]];
    }

    getSunColor() {
        return mixColor([1.0, 0.65, 0.40], [1.0, 0.96, 0.88],
            smoothstep(0.0, 0.45, this.getSunDirection()[1]));
    }

    getSunIntensity() {
        return 0.85 * smoothstep(0.0, 0.45, this.getSunDirection()[1]);
    }

    getAmbientColor() {
        return mixColor([0.24, 0.31, 0.46], [0.62, 0.70, 0.80],
            smoothstep(-0.20, 0.35, this.getSunDirection()[1]));
    }

    getAmbientIntensity() {
        return 0.38 + 0.17 * smoothstep(-0.20, 0.35, this.getSunDirection()[1]);
    }

    getSkyColors() {
        const altitude = this.getSunDirection()[1];
        const daylight = smoothstep(-0.22, 0.30, altitude);
        const twilight = this.getSunsetAmount();
        return {
            top: mixColor([0.025, 0.04, 0.085], [0.36, 0.63, 0.84], daylight),
            bottom: mixColor([0.055, 0.075, 0.13], [0.78, 0.84, 0.88], daylight),
            horizon: mixColor(
                mixColor([0.055, 0.075, 0.13], [0.70, 0.80, 0.88], daylight),
                [0.88, 0.49, 0.30], twilight * 0.65),
        };
    }

    getSkyGradient() {
        const c = this.getSkyColors();
        return {
            horizon: c.horizon,
            mid: [
                (c.top[0] + c.horizon[0]) * 0.5,
                (c.top[1] + c.horizon[1]) * 0.5,
                (c.top[2] + c.horizon[2]) * 0.5,
            ],
            zenith: c.top,
        };
    }

    getSunsetAmount() {
        const altitude = this.getSunDirection()[1];
        return smoothstep(-0.22, 0.0, altitude)
            * (1 - smoothstep(0.0, 0.35, altitude));
    }

    getMoonColor() {
        const visibility = 1 - smoothstep(-0.12, 0.18, this.getSunDirection()[1]);
        return [0.68 * visibility, 0.79 * visibility, 0.98 * visibility];
    }

    getTimeLabel() {
        const t = this.timeOfDay;
        if (t < 0.10) return 'Đêm khuya';
        if (t < 0.18) return 'Bình minh';
        if (t < 0.25) return 'Sáng sớm';
        if (t < 0.70) return 'Ban ngày';
        if (t < 0.78) return 'Hoàng hôn';
        if (t < 0.88) return 'Chạng vạng';
        return 'Đêm tối';
    }
}
