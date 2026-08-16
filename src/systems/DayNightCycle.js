export class DayNightCycle {
    constructor() {
        this.timeOfDay = 0.2;
        this.daySpeed = 0.02;
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
        const angle = this.timeOfDay * Math.PI * 2;
        const lx = Math.cos(angle) * 0.6;
        const ly = Math.sin(angle);
        const lz = Math.sin(angle) * 0.6;
        return [lx, Math.max(-0.3, ly), lz];
    }

    getMoonDirection() {
        const angle = this.timeOfDay * Math.PI * 2;
        const lx = -Math.cos(angle) * 0.6;
        const ly = -Math.sin(angle);
        const lz = -Math.sin(angle) * 0.6;
        return [lx, Math.max(-0.3, ly), lz];
    }

    getSunColor() {
        const t = this.timeOfDay;

        if (t < 0.15) {
            const p = t / 0.15;
            return [
                1.0 * p + 0.3 * (1 - p),
                0.7 * p + 0.2 * (1 - p),
                0.4 * p + 0.15 * (1 - p)
            ];
        }
        if (t < 0.25) {
            const p = (t - 0.15) / 0.1;
            return [
                1.0,
                0.7 + 0.25 * p,
                0.4 + 0.45 * p
            ];
        }
        if (t < 0.65) {
            return [1.0, 0.95, 0.85];
        }
        if (t < 0.80) {
            const p = (t - 0.65) / 0.15;
            return [
                1.0,
                0.95 - 0.55 * p,
                0.85 - 0.50 * p
            ];
        }
        if (t < 0.92) {
            const p = (t - 0.80) / 0.12;
            return [
                0.40 - 0.10 * p,
                0.20 - 0.05 * p,
                0.10
            ];
        }
        const p = (t - 0.92) / 0.08;
        return [
            0.30 + 0.70 * p,
            0.15 + 0.55 * p,
            0.10 + 0.05 * p
        ];
    }

    getSunIntensity() {
        const t = this.timeOfDay;
        if (t < 0.10 || t > 0.92) return 0.22;
        if (t < 0.20) return 0.22 + ((t - 0.10) / 0.10) * 0.78;
        if (t < 0.75) return 1.0;
        if (t < 0.85) return 1.0 - ((t - 0.75) / 0.10) * 0.78;
        return 0.22;
    }

    getAmbientColor() {
        const t = this.timeOfDay;
        const night = [0.16, 0.20, 0.30];
        if (t < 0.12) {
            const p = t / 0.12;
            return [night[0] + 0.06 * p, night[1] + 0.08 * p, night[2] + 0.08 * p];
        }
        if (t < 0.22) {
            const p = (t - 0.12) / 0.10;
            return [0.22 + 0.00 * p, 0.28 + 0.00 * p, 0.38 - 0.10 * p];
        }
        if (t < 0.70) {
            return [0.22, 0.28, 0.38];
        }
        if (t < 0.82) {
            const p = (t - 0.70) / 0.12;
            return [0.22 - 0.06 * p, 0.28 - 0.08 * p, 0.38 - 0.08 * p];
        }
        if (t < 0.92) {
            const p = (t - 0.82) / 0.1;
            return [0.16 + 0.00 * p, 0.20 + 0.00 * p, 0.30 + 0.00 * p];
        }
        return night;
    }

    getAmbientIntensity() {
        const t = this.timeOfDay;
        if (t < 0.10 || t > 0.92) return 0.28;
        if (t < 0.20) return 0.28 + ((t - 0.10) / 0.10) * 0.12;
        if (t < 0.75) return 0.40;
        if (t < 0.85) return 0.40 - ((t - 0.75) / 0.10) * 0.12;
        return 0.28;
    }

    getSkyColors() {
        const t = this.timeOfDay;

        if (t < 0.10) {
            const p = t / 0.10;
            return {
                top: [0.02 + 0.51 * p, 0.02 + 0.72 * p, 0.06 + 0.84 * p],
                bottom: [0.01 + 0.79 * p, 0.01 + 0.84 * p, 0.03 + 0.92 * p],
                horizon: [0.05 + 0.65 * p, 0.03 + 0.72 * p, 0.08 + 0.77 * p]
            };
        }
        if (t < 0.22) {
            const p = (t - 0.10) / 0.12;
            return {
                top: [0.53, 0.74, 0.90],
                bottom: [0.80, 0.85, 0.95],
                horizon: [0.70, 0.75, 0.85]
            };
        }
        if (t < 0.65) {
            return {
                top: [0.53, 0.74, 0.90],
                bottom: [0.80, 0.85, 0.95],
                horizon: [0.70, 0.75, 0.85]
            };
        }
        if (t < 0.80) {
            const p = (t - 0.65) / 0.15;
            return {
                top: [0.53 - 0.40 * p, 0.74 - 0.60 * p, 0.90 - 0.72 * p],
                bottom: [0.80 - 0.65 * p, 0.85 - 0.70 * p, 0.95 - 0.78 * p],
                horizon: [0.70 - 0.50 * p, 0.75 - 0.55 * p, 0.85 - 0.60 * p]
            };
        }
        if (t < 0.92) {
            const p = (t - 0.80) / 0.12;
            return {
                top: [0.13 - 0.11 * p, 0.14 - 0.12 * p, 0.18 - 0.12 * p],
                bottom: [0.15 - 0.14 * p, 0.15 - 0.14 * p, 0.17 - 0.14 * p],
                horizon: [0.20 - 0.15 * p, 0.20 - 0.17 * p, 0.25 - 0.18 * p]
            };
        }
        const p = (t - 0.92) / 0.08;
        return {
            top: [0.02 + 0.01 * p, 0.02 + 0.01 * p, 0.06 + 0.06 * p],
            bottom: [0.01 + 0.01 * p, 0.01 + 0.01 * p, 0.03 + 0.03 * p],
            horizon: [0.05 + 0.05 * p, 0.03 + 0.03 * p, 0.07 + 0.07 * p]
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
        const t = this.timeOfDay;

        if (t >= 0.10 && t < 0.16) {
            return (t - 0.10) / 0.06;
        }
        if (t >= 0.16 && t < 0.22) {
            return 1.0 - (t - 0.16) / 0.06;
        }

        if (t >= 0.68 && t < 0.76) {
            return (t - 0.68) / 0.08;
        }
        if (t >= 0.76 && t < 0.85) {
            return 1.0 - (t - 0.76) / 0.09;
        }

        return 0.0;
    }

    getMoonColor() {
        const t = this.timeOfDay;
        const sunIntensity = this.getSunIntensity();
        const nightness = 1.0 - Math.min(1.0, Math.max(0.0, (sunIntensity - 0.22) / 0.78));
        return [
            0.85 * nightness,
            0.88 * nightness,
            0.95 * nightness,
        ];
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
