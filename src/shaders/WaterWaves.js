/**
 * The ocean wave field, defined exactly once.
 *
 * Both the water shader and the CPU need the same surface: the shader to
 * displace and shade it, gameplay code to float debris, sharks and the escape
 * raft on it. Keeping two hand-written copies in sync is a losing game, so the
 * train table below is the single source of truth and the GLSL is generated
 * from it at module load.
 *
 * A train is a plane sine wave `w * sin(dot(p, k) + t * speed)`, where `k`
 * carries both heading and frequency. Wavelength is `2*PI / length(k)`; the
 * gameplay grid has 2 m cells and the menu grid 3.1 m, so every |k| here stays
 * under ~0.7 (λ >= 9 m) to keep at least four vertices per wave. Detail finer
 * than that belongs in the fragment ripple field, which costs no tessellation.
 *
 * Headings are deliberately spread and the frequencies are non-harmonic: the
 * old two-train field used one 45° diagonal plus a second train at 1.5x the
 * same frequency, which summed to a visibly repeating corrugation.
 */

/** kx/kz define heading and frequency; speed is the phase rate; weight the mix. */
const WAVE_TRAINS = [
    { kx: 0.26, kz: 0.22, speed: 1.00, weight: 1.00 },
    { kx: -0.15, kz: 0.41, speed: 0.83, weight: 0.55 },
    { kx: 0.47, kz: -0.29, speed: 1.27, weight: 0.30 },
    { kx: 0.50, kz: 0.44, speed: 1.61, weight: 0.16 }
];

/** Weights are normalised so a full-amplitude crest reaches exactly 1.0. */
const _weightSum = WAVE_TRAINS.reduce((s, t) => s + t.weight, 0);
const TRAINS = WAVE_TRAINS.map(t => ({
    kx: t.kx,
    kz: t.kz,
    speed: t.speed,
    w: t.weight / _weightSum
}));

/** Metres of crest height at wave multiplier 1.0. */
export const BASE_AMPLITUDE = 0.12;

/** Phase rate at speed multiplier 1.0. */
export const BASE_SPEED = 1.6;

const _fixed = (n) => n.toFixed(5);

/**
 * GLSL for `oceanWave`, unrolled from the train table.
 *
 * Returns the surface for *unit* amplitude: `height` in [-1, 1] and `slope`
 * as dh/dx, dh/dz. Callers scale both by the real amplitude, which keeps the
 * normal consistent with the displacement for free.
 *
 * `heading` is a unit vector that rotates every train together, so wind
 * direction is one uniform rather than a rewrite of the table.
 */
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

/**
 * Amplitude falls off towards the island so waves never punch through the
 * beach. Mirrors the GLSL exactly, including the guard against a zero-width
 * band (the menu passes start == 0, end == 1 to mean "no attenuation").
 */
function attenuationAt(x, z, start, end) {
    const dist = Math.sqrt(x * x + z * z);
    const t = (dist - start) / Math.max(end - start, 1e-4);
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/**
 * The live ocean surface, as gameplay code sees it.
 *
 * GameScene calls `sync()` once per frame and then feeds the very same values
 * to the shader uniforms, so what floats and what is drawn cannot drift apart.
 * Anything that needs to ride the water calls `heightAt`.
 */
export const WaveField = {
    time: 0.0,
    amplitude: BASE_AMPLITUDE,
    /** Phase argument, already multiplied by time — see `sync`. */
    phase: 0.0,
    heading: [1.0, 0.0],
    attenStart: 0.0,
    attenEnd: 1.0,
    enabled: true,

    /**
     * @param {number} time        scene clock, the same value handed to uTime
     * @param {number} ampMult     weather wave amplitude multiplier
     * @param {number} speedMult   weather wave speed multiplier
     * @param {number[]} wind      wind direction [x, y, z]; xz sets the heading
     * @param {number} attenStart  radius where waves start to build
     * @param {number} attenEnd    radius beyond which they are at full height
     * @param {boolean} enabled    false when the player turns wave animation off
     */
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

    /**
     * Water surface height at a world XZ position, in the same units and with
     * the same attenuation the vertex shader applies.
     * @returns {number} displacement about y = 0
     */
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

    /**
     * Surface slope (dh/dx, dh/dz) at a world XZ position. Floating props use
     * it to tilt with the wave they are sitting on instead of rocking to their
     * own unrelated sine.
     * @param {number[]|Float32Array} out - filled with [dhdx, dhdz]
     */
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
