/**
 * AudioBuffers (v1.1) — pre-rendered, cached procedural sample banks.
 *
 * Every sound in the game is synthesized, and the noise-based ones need a
 * filled Float32Array. Building that array inside the play call meant a 2.5
 * second thunder buffer (≈120k samples) was generated on the main thread at
 * the exact moment lightning struck, and a fresh 0.09s buffer on every single
 * footstep.
 *
 * Buffers are therefore rendered once per key, in several randomised variants,
 * and picked from at play time. That removes the hitch *and* fixes the
 * mechanical repetition of always hearing the byte-identical sample.
 */
export class AudioBuffers {
    /** @param {AudioContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        /** @type {Map<string, AudioBuffer[]>} */
        this._cache = new Map();
    }

    /**
     * Render (once) and return every variant stored under `key`.
     * @param {string} key Cache key — must be unique per sound.
     * @param {number} count How many randomised variants to render.
     * @param {number} duration Buffer length in seconds.
     * @param {(data: Float32Array, sampleRate: number, index: number) => void} fill
     * @returns {AudioBuffer[]}
     */
    variants(key, count, duration, fill) {
        const cached = this._cache.get(key);
        if (cached) return cached;

        const sampleRate = this.ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const list = [];
        for (let i = 0; i < count; i++) {
            const buffer = this.ctx.createBuffer(1, length, sampleRate);
            fill(buffer.getChannelData(0), sampleRate, i);
            list.push(buffer);
        }
        this._cache.set(key, list);
        return list;
    }

    /**
     * A random variant of `key`, rendering the bank on first use.
     * @see variants
     * @returns {AudioBuffer}
     */
    pick(key, count, duration, fill) {
        const list = this.variants(key, count, duration, fill);
        return list[(Math.random() * list.length) | 0];
    }

    /** Single-variant convenience wrapper, for loops that never vary. */
    one(key, duration, fill) {
        return this.variants(key, 1, duration, fill)[0];
    }

    clear() {
        this._cache.clear();
    }
}

/**
 * Blend the tail of a looping buffer over its head so the wrap point is
 * inaudible. Without this every ambience loop ticks once per period.
 * @param {Float32Array} data
 * @param {number} fadeSamples
 */
export function crossfadeLoop(data, fadeSamples) {
    const n = data.length;
    const fade = Math.min(fadeSamples, Math.floor(n / 2));
    if (fade <= 0) return;
    for (let i = 0; i < fade; i++) {
        const g = i / fade;
        data[i] = data[i] * g + data[n - fade + i] * (1 - g);
    }
}

/**
 * Percussive white-noise burst: full amplitude at the attack, decaying to
 * silence by the end of the buffer. The building block behind footsteps,
 * impacts, chops and knocks.
 * @param {Float32Array} data
 * @param {number} [curve] Higher = snappier decay.
 * @param {number} [level]
 */
export function fillNoiseBurst(data, curve = 2.5, level = 1.0) {
    const n = data.length;
    for (let i = 0; i < n; i++) {
        const t = i / n;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, curve) * level;
    }
}

/**
 * Brown noise (integrated white noise) — the low, rounded hiss that reads as
 * surf, wind or distant rumble rather than TV static.
 * @param {Float32Array} data
 * @param {number} [step] Integration step; smaller = darker.
 * @param {number} [level]
 */
export function fillBrownNoise(data, step = 0.02, level = 2.2) {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + step * white) / (1 + step);
        data[i] = last * level;
    }
}

/** Uniform random helper shared by the synth voices. */
export function rand(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Random detune in cents, applied to one-shot oscillators so repeated plays
 * of the same cue aren't byte-identical in pitch.
 * @param {number} [cents]
 */
export function randomDetune(cents = 50) {
    return rand(-cents, cents);
}
