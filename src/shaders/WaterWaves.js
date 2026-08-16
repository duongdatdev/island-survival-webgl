
const WAVE_TRAINS = [
    { kx: 0.26, kz: 0.22, speed: 1.00, weight: 1.00 },
    { kx: -0.15, kz: 0.41, speed: 0.83, weight: 0.55 },
    { kx: 0.47, kz: -0.29, speed: 1.27, weight: 0.30 },
    { kx: 0.50, kz: 0.44, speed: 1.61, weight: 0.16 }
];

const _weightSum = WAVE_TRAINS.reduce((s, t) => s + t.weight, 0);
const TRAINS = WAVE_TRAINS.map(t => ({
    kx: t.kx,
    kz: t.kz,
    speed: t.speed,
    w: t.weight / _weightSum
}));

export const BASE_AMPLITUDE = 0.12;

export const BASE_SPEED = 1.6;

const _fixed = (n) => n.toFixed(5);

export const WAVE_GLSL = `
    void oceanWave(vec2 p, float t, vec2 heading, out float height, out vec2 slope) {
        height = 0.0;
        slope = vec2(0.0);
${TRAINS.map(t => `
        {
            vec2 k = vec2(dot(vec2(${_fixed(t.kx)}, ${_fixed(-t.kz)}), heading),
                          dot(vec2(${_fixed(t.kz)}, ${_fixed(t.kx)}), heading));
            float ph = dot(p, k) + t * ${_fixed(t.speed)};
            height += ${_fixed(t.w)} * sin(ph);
            slope += (${_fixed(t.w)} * cos(ph)) * k;
        }`).join('')}
    }
`;

function attenuationAt(x, z, start, end) {
    const dist = Math.sqrt(x * x + z * z);
    const t = (dist - start) / Math.max(end - start, 1e-4);
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}

export const WaveField = {
    time: 0.0,
    amplitude: BASE_AMPLITUDE,
    phase: 0.0,
    heading: [1.0, 0.0],
    attenStart: 0.0,
    attenEnd: 1.0,
    enabled: true,

    sync(time, ampMult, speedMult, wind, attenStart, attenEnd, enabled = true) {
        this.time = time;
        this.phase = time * BASE_SPEED * speedMult;
        this.amplitude = BASE_AMPLITUDE * ampMult;
        this.attenStart = attenStart;
        this.attenEnd = attenEnd;
        this.enabled = enabled;

        const len = Math.hypot(wind[0], wind[2]);
        if (len > 1e-4) {
            this.heading[0] = wind[0] / len;
            this.heading[1] = wind[2] / len;
        }
    },

    heightAt(x, z) {
        if (!this.enabled) return 0.0;

        const hx = this.heading[0];
        const hz = this.heading[1];
        let h = 0.0;

        for (let i = 0; i < TRAINS.length; i++) {
            const tr = TRAINS[i];
            const kx = tr.kx * hx - tr.kz * hz;
            const kz = tr.kx * hz + tr.kz * hx;
            h += tr.w * Math.sin(x * kx + z * kz + this.phase * tr.speed);
        }

        return h * this.amplitude * attenuationAt(x, z, this.attenStart, this.attenEnd);
    },

    slopeAt(x, z, out) {
        out[0] = 0.0;
        out[1] = 0.0;
        if (!this.enabled) return out;

        const hx = this.heading[0];
        const hz = this.heading[1];

        for (let i = 0; i < TRAINS.length; i++) {
            const tr = TRAINS[i];
            const kx = tr.kx * hx - tr.kz * hz;
            const kz = tr.kx * hz + tr.kz * hx;
            const c = tr.w * Math.cos(x * kx + z * kz + this.phase * tr.speed);
            out[0] += c * kx;
            out[1] += c * kz;
        }

        const amp = this.amplitude * attenuationAt(x, z, this.attenStart, this.attenEnd);
        out[0] *= amp;
        out[1] *= amp;
        return out;
    }
};
