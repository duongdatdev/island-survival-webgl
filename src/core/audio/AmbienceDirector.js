import {
    crossfadeLoop, fillBrownNoise, rand,
} from './AudioBuffers.js';
import { createPanner, setPannerPosition, SpatialProfiles } from './Spatial.js';

/**
 * AmbienceDirector (v1.1) — every looping, world-driven sound.
 *
 * Four kinds of layer live here:
 *   1. Weather beds — surf, wind and rain, cross-faded by the WeatherSystem.
 *   2. Time-of-day beds — a bright insect shimmer by day, crickets by night.
 *   3. Scheduled wildlife one-shots — birdsong, dawn chorus, the odd owl.
 *   4. Positional emitters — the waterfall and campfire, panned in 3D so the
 *      player can hear where they are and how far away.
 *
 * Levels are never written directly: each layer smooths a `current` value
 * toward a `target` every frame, so weather transitions and structures being
 * placed both fade instead of popping.
 */

/** Looping emitter definitions, keyed by the `kind` passed to addEmitter. */
const EMITTER_KINDS = {
    waterfall: {
        level: 0.55,
        duration: 4.0,
        profile: SpatialProfiles.landmark,
        filters: [
            { type: 'highpass', frequency: 160 },
            { type: 'lowpass', frequency: 3200 },
        ],
        fill: fillWaterfall,
    },
    campfire: {
        level: 0.5,
        duration: 6.0,
        profile: SpatialProfiles.prop,
        filters: [
            { type: 'highpass', frequency: 200 },
            { type: 'lowpass', frequency: 3000 },
        ],
        fill: fillCampfire,
    },
};

export class AmbienceDirector {
    /**
     * @param {AudioContext} ctx
     * @param {import('./AudioBuffers.js').AudioBuffers} buffers
     * @param {AudioNode} bus Ambient bus — already routed through the mixer.
     */
    constructor(ctx, buffers, bus) {
        this.ctx = ctx;
        this.buffers = buffers;
        this.bus = bus;

        /** @type {Map<string, object>} Looping beds keyed by layer id. */
        this._layers = new Map();
        /** @type {Map<string, object>} Positional loops keyed by caller id. */
        this._emitters = new Map();

        this._timeOfDay = 0.3;
        this._rainIntensity = 0;
        this._windIntensity = 0;

        // Countdown to the next wildlife one-shot. Seeded short so the world
        // isn't silent for the first few seconds of a run.
        this._callTimer = 2.5;
    }

    // ── Weather beds ─────────────────────────────────────────────

    startWaves() {
        const buffer = this.buffers.one('amb:waves', 4.0, fillWaves);
        this._startLayer('waves', {
            buffer,
            level: 0.12,
            speed: 0.8,
            filters: [{ type: 'lowpass', frequency: 400 }],
        });
    }

    startWind() {
        const buffer = this.buffers.one('amb:wind', 4.0, fillWind);
        this._startLayer('wind', {
            buffer,
            level: 0,
            speed: 2.0,
            filters: [{ type: 'bandpass', frequency: 180, Q: 0.7 }],
        });
    }

    startRain() {
        const buffer = this.buffers.one('amb:rain', 2.0, fillRain);
        this._startLayer('rain', {
            buffer,
            level: 0,
            speed: 2.0,
            filters: [
                { type: 'highpass', frequency: 1000 },
                { type: 'lowpass', frequency: 6000 },
            ],
        });
    }

    /** Start the day/night wildlife beds. Both run; only their gains change. */
    startWildlifeBeds() {
        this._startLayer('daylife', {
            buffer: this.buffers.one('amb:daylife', 4.0, fillDayShimmer),
            level: 0,
            speed: 0.5,
            filters: [{ type: 'bandpass', frequency: 5200, Q: 1.1 }],
        });
        this._startLayer('nightlife', {
            buffer: this.buffers.one('amb:nightlife', 4.0, fillCrickets),
            level: 0,
            speed: 0.5,
            filters: [{ type: 'bandpass', frequency: 4300, Q: 5.0 }],
        });
    }

    stopWaves() { this._stopLayer('waves'); }
    stopWind() { this._stopLayer('wind'); }
    stopRain() { this._stopLayer('rain'); }

    stopWildlifeBeds() {
        this._stopLayer('daylife');
        this._stopLayer('nightlife');
    }

    /** @param {number} intensity 0..1 */
    setWindIntensity(intensity) {
        this._windIntensity = clamp01(intensity);
        this._setTarget('wind', this._windIntensity * 0.25);
        // Rougher wind means rougher surf — open the wave filter so the sea
        // gains some spray on top of the low swell.
        this._setFilterTarget('waves', 0, 400 + this._windIntensity * 900);
    }

    /** @param {number} intensity 0..1 */
    setRainIntensity(intensity) {
        this._rainIntensity = clamp01(intensity);
        this._setTarget('rain', this._rainIntensity * 0.22);
    }

    /** @param {number} t Normalised time of day, 0..1 (see DayNightCycle). */
    setTimeOfDay(t) {
        this._timeOfDay = t;
        // Heavy rain drowns out insects long before it drowns out the sea.
        const weatherMask = 1.0 - Math.min(1, this._rainIntensity * 1.4);
        const night = nightAmount(t);
        this._setTarget('nightlife', night * 0.055 * weatherMask);
        this._setTarget('daylife', (1 - night) * 0.035 * weatherMask);
    }

    // ── Positional emitters ──────────────────────────────────────

    /**
     * Register a looping 3D emitter. Silent until `setEmitterActive(id, true)`,
     * which is how an unbuilt campfire stays quiet without tearing the node
     * graph down and rebuilding it every time.
     * @param {string} id
     * @param {keyof EMITTER_KINDS} kind
     * @param {number[]} position
     * @param {boolean} [active]
     */
    addEmitter(id, kind, position, active = true) {
        if (this._emitters.has(id)) {
            this.setEmitterPosition(id, position);
            this.setEmitterActive(id, active);
            return;
        }
        const spec = EMITTER_KINDS[kind];
        if (!spec) {
            console.warn(`AmbienceDirector: unknown emitter kind '${kind}'`);
            return;
        }

        const ctx = this.ctx;
        const source = ctx.createBufferSource();
        source.buffer = this.buffers.one(`emit:${kind}`, spec.duration, spec.fill);
        source.loop = true;

        const gain = ctx.createGain();
        gain.gain.value = 0;
        const panner = createPanner(ctx, position, gain, spec.profile);

        let node = source;
        for (const filterSpec of spec.filters) {
            const filter = ctx.createBiquadFilter();
            filter.type = filterSpec.type;
            filter.frequency.value = filterSpec.frequency;
            if (filterSpec.Q !== undefined) filter.Q.value = filterSpec.Q;
            node.connect(filter);
            node = filter;
        }
        node.connect(panner);
        gain.connect(this.bus);

        // Random start offset: two campfires (or a reload) shouldn't crackle in
        // lockstep with each other.
        source.start(0, Math.random() * spec.duration);

        this._emitters.set(id, {
            source, gain, panner,
            level: spec.level,
            current: 0,
            target: active ? spec.level : 0,
            speed: 1.2,
        });
    }

    setEmitterPosition(id, position) {
        const emitter = this._emitters.get(id);
        if (emitter) setPannerPosition(this.ctx, emitter.panner, position, 0.05);
    }

    setEmitterActive(id, active) {
        const emitter = this._emitters.get(id);
        if (emitter) emitter.target = active ? emitter.level : 0;
    }

    removeEmitter(id) {
        const emitter = this._emitters.get(id);
        if (!emitter) return;
        try { emitter.source.stop(); } catch (e) { /* already stopped */ }
        this._emitters.delete(id);
    }

    // ── Per-frame ────────────────────────────────────────────────

    /**
     * Smooth every level toward its target and schedule wildlife calls.
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // A tab left in the background hands back a huge delta on return;
        // clamping keeps the smoothing stable instead of overshooting.
        const dt = Math.min(deltaTime, 0.1);

        for (const layer of this._layers.values()) {
            layer.current += (layer.target - layer.current) * Math.min(1, dt * layer.speed);
            layer.gain.gain.value = layer.current;

            for (const filter of layer.filters) {
                if (filter._target === undefined) continue;
                filter.frequency.value +=
                    (filter._target - filter.frequency.value) * Math.min(1, dt * 1.5);
            }
        }

        for (const emitter of this._emitters.values()) {
            emitter.current += (emitter.target - emitter.current) * Math.min(1, dt * emitter.speed);
            emitter.gain.gain.value = emitter.current;
        }

        this._updateWildlifeCalls(dt);
    }

    /**
     * Fire the occasional bird or owl. These are one-shots rather than part of
     * the looping bed because a looped birdsong is the fastest way to make an
     * ambience sound canned.
     */
    _updateWildlifeCalls(dt) {
        // Wildlife shelters from rain, and nothing calls if the beds are muted.
        const activity = 1.0 - Math.min(1, this._rainIntensity * 1.6);
        if (activity <= 0.05) return;

        this._callTimer -= dt * activity;
        if (this._callTimer > 0) return;

        const t = this._timeOfDay;
        const night = nightAmount(t);
        // Dawn chorus: birds are loudest and most frequent just after sunrise.
        const isDawn = t > 0.12 && t < 0.30;

        if (night > 0.6) {
            this._playOwl();
            this._callTimer = rand(14, 34);
        } else {
            this._playBirdCall();
            this._callTimer = isDawn ? rand(1.4, 4.0) : rand(4.0, 11.0);
        }
    }

    /** Short warbling chirp: 2–4 quick sine glides. */
    _playBirdCall() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const pan = this._stereoTarget(rand(-0.8, 0.8));
        const notes = 2 + Math.floor(Math.random() * 3);
        const base = rand(1900, 3400);

        for (let i = 0; i < notes; i++) {
            const start = now + i * rand(0.07, 0.13);
            const dur = rand(0.05, 0.1);
            const from = base * rand(0.85, 1.15);
            const to = from * rand(1.15, 1.7);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(from, start);
            osc.frequency.exponentialRampToValueAtTime(to, start + dur);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(rand(0.03, 0.06), start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

            osc.connect(gain);
            gain.connect(pan);
            osc.start(start);
            osc.stop(start + dur + 0.05);
        }
    }

    /** Two low "hoo" notes with a slow vibrato. */
    _playOwl() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const pan = this._stereoTarget(rand(-0.6, 0.6));
        const base = rand(360, 440);

        for (let i = 0; i < 2; i++) {
            const start = now + i * 0.55;
            const dur = 0.34;

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(base * (i === 0 ? 1 : 0.94), start);

            // Vibrato gives the hoot a breathy, living quality.
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 5.5;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 7;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.05, start + 0.08);
            gain.gain.setValueAtTime(0.05, start + dur * 0.6);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

            osc.connect(gain);
            gain.connect(pan);
            osc.start(start);
            osc.stop(start + dur + 0.05);
            lfo.start(start);
            lfo.stop(start + dur + 0.05);
        }
    }

    /**
     * A stereo-panned entry point into the ambient bus. Ambient calls use
     * plain stereo rather than a 3D panner — the bird is nowhere in
     * particular, and this costs one node instead of a full panner.
     */
    _stereoTarget(pan) {
        if (!this.ctx.createStereoPanner) return this.bus;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(this.bus);
        return panner;
    }

    stopAll() {
        for (const id of Array.from(this._layers.keys())) this._stopLayer(id);
        for (const id of Array.from(this._emitters.keys())) this.removeEmitter(id);
    }

    // ── Layer plumbing ───────────────────────────────────────────

    _startLayer(id, opts) {
        if (this._layers.has(id)) return;
        const ctx = this.ctx;

        const source = ctx.createBufferSource();
        source.buffer = opts.buffer;
        source.loop = true;

        let node = source;
        const filters = [];
        for (const spec of opts.filters || []) {
            const filter = ctx.createBiquadFilter();
            filter.type = spec.type;
            filter.frequency.value = spec.frequency;
            if (spec.Q !== undefined) filter.Q.value = spec.Q;
            node.connect(filter);
            node = filter;
            filters.push(filter);
        }

        const gain = ctx.createGain();
        // Always start silent: `update` fades in to the target, so entering a
        // scene doesn't slam the ambience on at full level.
        gain.gain.value = 0;
        node.connect(gain);
        gain.connect(this.bus);

        source.start(0, Math.random() * source.buffer.duration);

        this._layers.set(id, {
            source, gain, filters,
            current: 0,
            target: opts.level || 0,
            speed: opts.speed || 1.5,
        });
    }

    _stopLayer(id) {
        const layer = this._layers.get(id);
        if (!layer) return;
        try { layer.source.stop(); } catch (e) { /* already stopped */ }
        this._layers.delete(id);
    }

    _setTarget(id, value) {
        const layer = this._layers.get(id);
        if (layer) layer.target = value;
    }

    _setFilterTarget(layerId, filterIndex, frequency) {
        const layer = this._layers.get(layerId);
        if (!layer || !layer.filters[filterIndex]) return;
        layer.filters[filterIndex]._target = frequency;
    }
}

// ── Buffer fill functions ────────────────────────────────────────

/** Ocean surf: brown noise under two overlapping slow swells. */
function fillWaves(data, sampleRate) {
    fillBrownNoise(data, 0.02, 2.2);
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const swell1 = Math.sin(t * Math.PI * 2 * 0.13) * 0.5 + 0.5;
        const swell2 = Math.sin(t * Math.PI * 2 * 0.071 + 1.3) * 0.5 + 0.5;
        data[i] *= 0.35 + 0.65 * (swell1 * 0.6 + swell2 * 0.4);
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.25));
}

/** Wind: darker brown noise gusting on two slow LFOs. */
function fillWind(data, sampleRate) {
    fillBrownNoise(data, 0.01, 2.4);
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const gust = Math.sin(t * Math.PI * 2 * 0.08) * 0.3
            + Math.sin(t * Math.PI * 2 * 0.037 + 0.7) * 0.2 + 0.6;
        data[i] *= gust;
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.25));
}

/** Rain: white noise with a wandering density modulation. */
function fillRain(data, sampleRate) {
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const mod = Math.sin(t * Math.PI * 2 * 0.3 + Math.sin(t * Math.PI * 2 * 0.7) * 0.5);
        data[i] = (Math.random() * 2 - 1) * (0.4 + mod * 0.5);
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.15));
}

/** Daytime insect shimmer — a very quiet high bed under the birdsong. */
function fillDayShimmer(data, sampleRate) {
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        // Two fast tremolos an odd interval apart avoid an obvious pulse rate.
        const shimmer = 0.55
            + 0.25 * Math.sin(t * Math.PI * 2 * 11.3)
            + 0.2 * Math.sin(t * Math.PI * 2 * 7.1 + 1.1);
        data[i] = (Math.random() * 2 - 1) * shimmer;
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.2));
}

/**
 * Cricket bed: a fast pulse train (the individual chirps) gated by a slower
 * song/rest cycle, so it breathes instead of buzzing continuously.
 */
function fillCrickets(data, sampleRate) {
    const chirpRate = 24;   // chirps per second inside a song
    const songRate = 0.7;   // song/rest cycles per second
    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const chirpPhase = (t * chirpRate) % 1;
        const chirp = chirpPhase < 0.45 ? Math.pow(1 - chirpPhase / 0.45, 1.6) : 0;
        const song = Math.max(0, Math.sin(t * Math.PI * 2 * songRate));
        data[i] = (Math.random() * 2 - 1) * chirp * song;
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.2));
}

/** Waterfall: bright, dense white/brown blend with a slow surge. */
function fillWaterfall(data, sampleRate) {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.35 * white) / 1.35;
        const t = i / sampleRate;
        const surge = 0.78 + 0.22 * Math.sin(t * Math.PI * 2 * 0.23 + 0.4);
        data[i] = (white * 0.5 + last * 0.9) * surge * 0.7;
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.25));
}

/** Campfire: a low roar with randomly scattered crackles and pops on top. */
function fillCampfire(data, sampleRate) {
    fillBrownNoise(data, 0.03, 0.75);

    const pops = Math.floor(data.length / sampleRate) * 16;
    for (let p = 0; p < pops; p++) {
        const start = Math.floor(Math.random() * (data.length - sampleRate * 0.05));
        const length = Math.floor(rand(0.001, 0.008) * sampleRate);
        const amp = rand(0.2, 1.0);
        for (let i = 0; i < length; i++) {
            const env = Math.pow(1 - i / length, 4);
            data[start + i] += (Math.random() * 2 - 1) * env * amp;
        }
    }
    crossfadeLoop(data, Math.floor(sampleRate * 0.2));
}

// ── Small helpers ────────────────────────────────────────────────

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

/**
 * How "night" a given time of day is, 0..1. The ramps line up with the dawn
 * and dusk windows in DayNightCycle so the ambience turns over at the same
 * moment the sky does.
 */
function nightAmount(t) {
    if (t < 0.10) return 1;
    if (t < 0.20) return 1 - (t - 0.10) / 0.10;
    if (t < 0.74) return 0;
    if (t < 0.88) return (t - 0.74) / 0.14;
    return 1;
}
