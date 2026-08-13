import {
    AudioBuffers, fillNoiseBurst, rand, randomDetune,
} from './audio/AudioBuffers.js';
import { AmbienceDirector } from './audio/AmbienceDirector.js';
import { MusicDirector } from './audio/MusicDirector.js';
import { createPanner, setListenerPose, SpatialProfiles } from './audio/Spatial.js';

/**
 * AudioManager — procedural sound using the Web Audio API.
 * No external audio files: every cue is synthesized at runtime.
 *
 * v1.1 restructured this into a mixer plus two directors:
 *
 *   master ─┬─ sfx ───────────────── one-shots (this file)
 *           └─ duck ─┬─ ambient ──── AmbienceDirector (loops, 3D emitters)
 *                    └─ music ────── MusicDirector (procedural pad)
 *
 * The duck bus lets a menu or a low-health state pull the world down without
 * touching the player's volume settings, and keeps interface sounds audible
 * while it does. Noise-based cues render their sample banks once through
 * `AudioBuffers` instead of rebuilding an array on every play call.
 */

/**
 * Footstep character per surface. `cutoff` is the low-pass that gives each
 * material its weight; `wet` switches to the longer, splashier sample bank.
 */
const FOOTSTEP_SURFACES = {
    sand:  { cutoff: 300,  Q: 0.7, gain: 0.115, wet: false },
    grass: { cutoff: 620,  Q: 1.1, gain: 0.100, wet: false },
    rock:  { cutoff: 1150, Q: 1.4, gain: 0.130, wet: false },
    wood:  { cutoff: 780,  Q: 2.2, gain: 0.120, wet: false, body: 165 },
    water: { cutoff: 1400, Q: 0.8, gain: 0.150, wet: true },
};

/** Voice character per creature, used by hurt/death cues. */
const CREATURE_VOICES = {
    boar:    { freq: 260, type: 'sawtooth', decay: 0.34, gain: 0.16, glideTo: 150 },
    seagull: { freq: 1250, type: 'sawtooth', decay: 0.20, gain: 0.10, glideTo: 900 },
    crab:    { freq: 640, type: 'square', decay: 0.09, gain: 0.07, glideTo: 520 },
    shark:   { freq: 150, type: 'triangle', decay: 0.40, gain: 0.15, glideTo: 90 },
    default: { freq: 380, type: 'triangle', decay: 0.22, gain: 0.11, glideTo: 260 },
};

/** Ambient/music level while ducked (menus, panels, death). */
const DUCK_LEVEL = 0.32;

export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this.masterGain = null;
        /** v1.0: sub-buses so the settings menu can mix SFX and ambience apart. */
        this.sfxGain = null;
        this.ambientBus = null;
        /** v1.1: music sits on its own bus with its own slider. */
        this.musicBus = null;
        this._duckGain = null;
        this._limiter = null;
        this.isMuted = false;
        this._initialized = false;

        // Volume levels (0..1), applied whenever the context exists.
        this._masterVolume = 1.0;
        this._sfxVolume = 1.0;
        this._ambientVolume = 1.0;
        this._musicVolume = 1.0;

        /** @type {AudioBuffers|null} */
        this.buffers = null;
        /** @type {AmbienceDirector|null} */
        this.ambience = null;
        /** @type {MusicDirector|null} */
        this.music = null;

        // Duck / heartbeat state
        this._ducked = false;
        this._healthFraction = 1.0;
        this._heartbeatTimer = 0;
        this._listenerReady = false;

        // Weather intensities are cached so a scene can set them before the
        // context exists (first frame, before any user gesture).
        this._windIntensity = 0;
        this._rainIntensity = 0;

        // Load mute preference
        try {
            this.isMuted = localStorage.getItem('island_survival_muted') === 'true';
        } catch (e) { /* ignore */ }
    }

    /**
     * Initialize AudioContext on first user gesture (required by browsers)
     */
    _ensureContext() {
        if (this._initialized) return true;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.ctx = ctx;

            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : this._masterVolume;

            // Master limiter: tames harsh peaks / clipping so synthesized
            // sounds stay smooth instead of buzzy and distorted.
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -6;
            limiter.knee.value = 12;
            limiter.ratio.value = 6;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;
            this.masterGain.connect(limiter);
            limiter.connect(ctx.destination);
            this._limiter = limiter;

            // Interface and impact sounds bypass the duck bus — they must stay
            // audible exactly when the world is being pulled down.
            this.sfxGain = ctx.createGain();
            this.sfxGain.gain.value = this._sfxVolume;
            this.sfxGain.connect(this.masterGain);

            this._duckGain = ctx.createGain();
            this._duckGain.gain.value = this._ducked ? DUCK_LEVEL : 1.0;
            this._duckGain.connect(this.masterGain);

            this.ambientBus = ctx.createGain();
            this.ambientBus.gain.value = this._ambientVolume;
            this.ambientBus.connect(this._duckGain);

            this.musicBus = ctx.createGain();
            this.musicBus.gain.value = this._musicVolume;
            this.musicBus.connect(this._duckGain);

            this.buffers = new AudioBuffers(ctx);
            this.ambience = new AmbienceDirector(ctx, this.buffers, this.ambientBus);
            this.music = new MusicDirector(ctx, this.musicBus);

            this._initialized = true;
            return true;
        } catch (e) {
            console.warn('AudioManager: Web Audio API not available', e);
            return false;
        }
    }

    /**
     * Resume audio context (call on user interaction)
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Toggle mute on/off
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.setMuted(!this.isMuted);
        return this.isMuted;
    }

    /**
     * Set mute state explicitly
     */
    setMuted(muted) {
        this.isMuted = muted;
        // Unmuting restores the configured master volume rather than jumping
        // to full scale, so the settings slider stays authoritative.
        this._applyGain(this.masterGain, this.isMuted ? 0 : this._masterVolume);
        try {
            localStorage.setItem('island_survival_muted', this.isMuted.toString());
        } catch (e) { /* ignore */ }
    }

    // ==========================================
    //  VOLUME MIXING
    // ==========================================

    /**
     * Overall output level (0..1). Ignored while muted, but remembered so
     * unmuting comes back at the right level.
     */
    setMasterVolume(volume) {
        this._masterVolume = clamp01(volume);
        if (!this.isMuted) {
            this._applyGain(this.masterGain, this._masterVolume);
        }
    }

    /** Level of one-shot sound effects (0..1). */
    setSfxVolume(volume) {
        this._sfxVolume = clamp01(volume);
        this._applyGain(this.sfxGain, this._sfxVolume);
    }

    /** Level of looping ambience — waves, wind, rain, wildlife (0..1). */
    setAmbientVolume(volume) {
        this._ambientVolume = clamp01(volume);
        this._applyGain(this.ambientBus, this._ambientVolume);
    }

    /** Level of the procedural music pad (0..1). */
    setMusicVolume(volume) {
        this._musicVolume = clamp01(volume);
        this._applyGain(this.musicBus, this._musicVolume);
    }

    /**
     * Apply every level from a SettingsManager in one call.
     * @param {{get:(k:string)=>*}} settings
     */
    applySettings(settings) {
        this.setMasterVolume(settings.get('masterVolume'));
        this.setSfxVolume(settings.get('sfxVolume'));
        this.setAmbientVolume(settings.get('ambientVolume'));
        this.setMusicVolume(settings.get('musicVolume'));
        this.setMuted(!!settings.get('muted'));
    }

    /**
     * Pull ambience and music down (menus, panels, death screens) while
     * leaving interface sounds at full level.
     * @param {boolean} ducked
     */
    setDucked(ducked) {
        if (this._ducked === ducked) return;
        this._ducked = ducked;
        this._applyGain(this._duckGain, ducked ? DUCK_LEVEL : 1.0, 0.12);
    }

    /**
     * Ramp a gain node, tolerating a not-yet-created audio context (the value
     * is stored on `this` either way and applied when the context comes up).
     */
    _applyGain(node, value, timeConstant = 0.05) {
        if (!node || !this.ctx) return;
        node.gain.setTargetAtTime(value, this.ctx.currentTime, timeConstant);
    }

    // ==========================================
    //  SPATIALISATION
    // ==========================================

    /**
     * Point the audio listener at the camera. Until this is called every
     * positional cue falls back to plain stereo, so a scene without a camera
     * (the main menu) needs no special-casing.
     * @param {number[]} position Camera position
     * @param {number[]} target Camera look-at point
     */
    setListener(position, target) {
        if (!this._initialized) return;
        const fx = target[0] - position[0];
        const fy = target[1] - position[1];
        const fz = target[2] - position[2];
        const length = Math.hypot(fx, fy, fz);
        if (length < 0.0001) return;

        setListenerPose(this.ctx, position, [fx / length, fy / length, fz / length]);
        this._listenerReady = true;
    }

    /**
     * Destination for a one-shot: a panner at `position` when the listener is
     * live, the flat SFX bus otherwise.
     * @param {number[]|null} position
     * @param {object} [profile]
     * @returns {AudioNode}
     */
    _target(position, profile = SpatialProfiles.creature) {
        if (!position || !this._listenerReady) return this.sfxGain;
        return createPanner(this.ctx, position, this.sfxGain, profile);
    }

    // ==========================================
    //  SYNTH PRIMITIVES
    // ==========================================

    /**
     * Play a cached buffer through an optional filter chain.
     * @param {AudioBuffer} buffer
     * @param {object} [opts]
     * @returns {AudioBufferSourceNode|null}
     */
    _playBuffer(buffer, opts = {}) {
        const ctx = this.ctx;
        const when = opts.when !== undefined ? opts.when : ctx.currentTime;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (opts.playbackRate) source.playbackRate.value = opts.playbackRate;

        let node = source;
        for (const spec of opts.filters || []) {
            const filter = ctx.createBiquadFilter();
            filter.type = spec.type;
            filter.frequency.setValueAtTime(spec.frequency, when);
            if (spec.Q !== undefined) filter.Q.value = spec.Q;
            if (spec.sweepTo !== undefined) {
                filter.frequency.exponentialRampToValueAtTime(
                    Math.max(20, spec.sweepTo), when + (spec.sweepTime || 0.2)
                );
            }
            node.connect(filter);
            node = filter;
        }

        const gain = ctx.createGain();
        const level = opts.gain !== undefined ? opts.gain : 0.2;
        if (opts.decay) {
            gain.gain.setValueAtTime(level, when);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.decay);
        } else {
            gain.gain.value = level;
        }

        node.connect(gain);
        gain.connect(opts.destination || this.sfxGain);
        source.start(when);
        return source;
    }

    /**
     * Play a single enveloped oscillator. Covers every tonal cue in the game;
     * layered calls make up the richer ones.
     * @param {object} opts
     */
    _tone(opts) {
        const ctx = this.ctx;
        const when = opts.when !== undefined ? opts.when : ctx.currentTime;
        const attack = opts.attack !== undefined ? opts.attack : 0.01;
        const hold = opts.hold || 0;
        const decay = opts.decay !== undefined ? opts.decay : 0.2;
        const peak = Math.max(0.0002, opts.gain !== undefined ? opts.gain : 0.1);

        const osc = ctx.createOscillator();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(opts.freq, when);
        if (opts.freqTo) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(1, opts.freqTo), when + (opts.glide || attack + hold + decay)
            );
        }
        // Every one-shot is detuned slightly so a repeated cue never sounds
        // like the same sample played twice.
        osc.detune.value = opts.detune !== undefined ? opts.detune : randomDetune(35);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(peak, when + attack);
        if (hold) gain.gain.setValueAtTime(peak, when + attack + hold);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + decay);

        osc.connect(gain);
        gain.connect(opts.destination || this.sfxGain);
        osc.start(when);
        osc.stop(when + attack + hold + decay + 0.05);
        return osc;
    }

    /** Shared percussive noise bank (short, snappy). */
    _impactBuffer() {
        return this.buffers.pick('sfx:impact', 5, 0.14, (data) => fillNoiseBurst(data, 2.6));
    }

    /** Shared soft noise bank (longer tail, used for steps and splashes). */
    _softBuffer() {
        return this.buffers.pick('sfx:soft', 6, 0.09, (data) => fillNoiseBurst(data, 2.2));
    }

    // ==========================================
    //  SOUND EFFECTS — pickups, crafting, UI
    // ==========================================

    /**
     * Short chime when picking up a resource
     */
    playPickup() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;

        // Soft two-note "ping" (a fifth apart) — pleasant, not a shrill beep.
        [{ freq: 784, at: 0.0 }, { freq: 1175, at: 0.07 }].forEach(({ freq, at }) => {
            const when = now + at;
            this._tone({ freq, type: 'sine', gain: 0.12, attack: 0.01, decay: 0.24, when });
            // Gentle overtone for a bell-like body.
            this._tone({ freq: freq * 2, type: 'sine', gain: 0.04, attack: 0.008, decay: 0.17, when });
        });
    }

    /**
     * Metallic hammer sound for crafting
     */
    playCraft() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;

        // Impact: filtered noise burst — reads as a real "thock" rather than a
        // buzzy square-wave tone.
        this._playBuffer(this._impactBuffer(), {
            gain: 0.35,
            filters: [{ type: 'lowpass', frequency: 900 }],
        });

        // Metallic ring — soft sine partials.
        [[1568, 0.07], [2350, 0.03]].forEach(([freq, gain]) => {
            this._tone({ freq, type: 'sine', gain, attack: 0.02, decay: 0.32, when: now + 0.01 });
        });
    }

    /**
     * Wood thunk for raft assembly and structure placement
     */
    playRaftBuild(position = null) {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        const destination = this._target(position, SpatialProfiles.prop);

        // Two wooden knocks: a filtered-noise attack plus a low triangle body
        // give a hollow-wood thunk rather than a synthetic creak.
        const knock = (when, bodyFreq, level) => {
            this._playBuffer(this._impactBuffer(), {
                when, destination, gain: level * 0.5,
                filters: [{ type: 'lowpass', frequency: 1200 }],
            });
            this._tone({
                freq: bodyFreq, freqTo: bodyFreq * 0.6, glide: 0.1,
                type: 'triangle', gain: level, attack: 0.004, decay: 0.2,
                when, destination,
            });
        };

        knock(now, 150, 0.18);
        knock(now + 0.11, 120, 0.14);
    }

    /**
     * Victory fanfare — ascending melody
     */
    playVictory() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const noteDuration = 0.25;

        notes.forEach((freq, i) => {
            const when = now + i * noteDuration;
            // Sustain the final note longer for a satisfying resolve.
            const isLast = i === notes.length - 1;
            const hold = isLast ? noteDuration * 1.8 : noteDuration * 0.6;

            this._tone({
                freq, type: 'triangle', gain: 0.13,
                attack: 0.04, hold, decay: 0.25, when, detune: 0,
            });
            // A soft sine fifth adds warmth without harshness.
            this._tone({
                freq: freq * 1.5, type: 'sine', gain: 0.04,
                attack: 0.05, hold, decay: 0.25, when, detune: 0,
            });
        });
    }

    /**
     * UI button click
     */
    playClick() {
        if (!this._ensureContext()) return;
        this._tone({
            freq: 660, freqTo: 440, glide: 0.05,
            type: 'sine', gain: 0.08, attack: 0.008, decay: 0.08,
        });
    }

    /** Quiet tick for hovering an interactive control. */
    playHover() {
        if (!this._ensureContext()) return;
        this._tone({ freq: 1320, type: 'sine', gain: 0.018, attack: 0.004, decay: 0.04 });
    }

    /**
     * Refusal cue — crafting without materials, an empty hotbar slot, a
     * structure that already exists. Anything that used to fail in silence.
     */
    playError() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        this._tone({ freq: 320, type: 'square', gain: 0.05, attack: 0.006, decay: 0.09, when: now });
        this._tone({ freq: 220, type: 'square', gain: 0.05, attack: 0.006, decay: 0.14, when: now + 0.09 });
    }

    /** Panel or inventory opening: a short upward whoosh. */
    playOpenPanel() {
        if (!this._ensureContext()) return;
        this._playBuffer(this._softBuffer(), {
            gain: 0.08, playbackRate: 0.35, decay: 0.22,
            filters: [{ type: 'bandpass', frequency: 500, Q: 1.2, sweepTo: 1800, sweepTime: 0.18 }],
        });
    }

    /** Panel closing: the same whoosh, falling. */
    playClosePanel() {
        if (!this._ensureContext()) return;
        this._playBuffer(this._softBuffer(), {
            gain: 0.07, playbackRate: 0.35, decay: 0.2,
            filters: [{ type: 'bandpass', frequency: 1600, Q: 1.2, sweepTo: 420, sweepTime: 0.16 }],
        });
    }

    /** Achievement unlocked — a brighter, shorter cousin of the fanfare. */
    playAchievement() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        [1046.50, 1318.51, 1567.98].forEach((freq, i) => {
            const when = now + i * 0.1;
            this._tone({ freq, type: 'triangle', gain: 0.1, attack: 0.01, hold: 0.05, decay: 0.3, when, detune: 0 });
            this._tone({ freq: freq * 2, type: 'sine', gain: 0.025, attack: 0.01, decay: 0.25, when, detune: 0 });
        });
    }

    // ==========================================
    //  SOUND EFFECTS — movement & survival
    // ==========================================

    /**
     * A single footstep. Surface and gait both change the sample, so walking
     * from sand onto rock is audible without looking down.
     * @param {string} [surface] sand | grass | rock | wood | water
     * @param {boolean} [running]
     */
    playFootstep(surface = 'grass', running = false) {
        if (!this._ensureContext()) return;
        const profile = FOOTSTEP_SURFACES[surface] || FOOTSTEP_SURFACES.grass;

        const buffer = profile.wet
            ? this.buffers.pick('sfx:stepwet', 4, 0.2, (data) => fillNoiseBurst(data, 1.4))
            : this._softBuffer();

        // Running lands harder and brighter than walking.
        const gain = profile.gain * (running ? 1.35 : 1.0);
        const cutoff = profile.cutoff * (running ? 1.15 : 1.0) * rand(0.85, 1.18);

        this._playBuffer(buffer, {
            gain,
            playbackRate: rand(0.9, 1.12),
            filters: [{ type: 'lowpass', frequency: cutoff, Q: profile.Q }],
        });

        // Boards and decking ring a little; soil and sand do not.
        if (profile.body) {
            this._tone({
                freq: profile.body * rand(0.9, 1.1), type: 'triangle',
                gain: gain * 0.4, attack: 0.004, decay: 0.09,
            });
        }
    }

    /** Water entry / fishing cast / splash. */
    playSplash(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position, SpatialProfiles.prop);
        this._playBuffer(
            this.buffers.pick('sfx:splash', 3, 0.5, (data) => fillNoiseBurst(data, 1.1)),
            {
                destination, gain: 0.18, decay: 0.45,
                filters: [
                    { type: 'highpass', frequency: 400 },
                    { type: 'lowpass', frequency: 2600, sweepTo: 700, sweepTime: 0.35 },
                ],
            }
        );
    }

    /** Chewing — three short, dull bursts. */
    playEat() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            this._playBuffer(this._softBuffer(), {
                when: now + i * rand(0.13, 0.19),
                gain: 0.1,
                playbackRate: rand(0.7, 1.0),
                filters: [{ type: 'lowpass', frequency: rand(500, 800), Q: 1.6 }],
            });
        }
    }

    /** Gulping — rising blips, the classic "drink" shorthand. */
    playDrink() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const base = 180 + i * 45;
            this._tone({
                freq: base, freqTo: base * 2.2, glide: 0.07,
                type: 'sine', gain: 0.1, attack: 0.006, decay: 0.07,
                when: now + i * 0.16,
            });
        }
    }

    /** Bandage / heal — a soft rising sweep. */
    playHeal() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        this._tone({ freq: 440, freqTo: 880, glide: 0.35, type: 'sine', gain: 0.07, attack: 0.05, decay: 0.3, when: now });
        this._tone({ freq: 660, freqTo: 1320, glide: 0.35, type: 'sine', gain: 0.035, attack: 0.08, decay: 0.3, when: now });
    }

    // ==========================================
    //  SOUND EFFECTS — combat
    // ==========================================

    /** Weapon whoosh through the air — plays on every swing, hit or miss. */
    playSwing(position = null) {
        if (!this._ensureContext()) return;
        this._playBuffer(this._softBuffer(), {
            destination: this._target(position, SpatialProfiles.prop),
            gain: 0.12,
            playbackRate: 0.32,
            decay: 0.18,
            filters: [{ type: 'bandpass', frequency: 900, Q: 1.0, sweepTo: 260, sweepTime: 0.16 }],
        });
    }

    /** Bowstring release: a short pluck plus the arrow leaving. */
    playBowRelease(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position, SpatialProfiles.prop);
        const now = this.ctx.currentTime;

        this._tone({
            freq: 180, freqTo: 90, glide: 0.12, type: 'triangle',
            gain: 0.13, attack: 0.002, decay: 0.12, when: now, destination,
        });
        this._playBuffer(this._softBuffer(), {
            destination, when: now, gain: 0.1, playbackRate: 0.5, decay: 0.16,
            filters: [{ type: 'highpass', frequency: 1200, sweepTo: 3200, sweepTime: 0.14 }],
        });
    }

    /** Weapon connecting with flesh — thud plus a wet transient. */
    playHit(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position);
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            destination, when: now, gain: 0.3, decay: 0.13,
            filters: [{ type: 'lowpass', frequency: rand(420, 620), Q: 1.2 }],
        });
        this._tone({
            freq: rand(90, 130), freqTo: 55, glide: 0.13, type: 'sine',
            gain: 0.17, attack: 0.003, decay: 0.14, when: now, destination,
        });
    }

    /**
     * Creature reacting to damage.
     * @param {string} [kind] boar | seagull | crab | shark
     * @param {number[]|null} [position]
     */
    playCreatureHurt(kind = 'default', position = null) {
        if (!this._ensureContext()) return;
        const voice = CREATURE_VOICES[kind] || CREATURE_VOICES.default;
        const destination = this._target(position);

        this._tone({
            freq: voice.freq * rand(0.92, 1.1),
            freqTo: voice.glideTo,
            glide: voice.decay,
            type: voice.type,
            gain: voice.gain,
            attack: 0.008,
            decay: voice.decay,
            destination,
        });
    }

    /**
     * Creature dying — the hurt voice, pitched down and drawn out.
     * @param {string} [kind]
     * @param {number[]|null} [position]
     */
    playCreatureDie(kind = 'default', position = null) {
        if (!this._ensureContext()) return;
        const voice = CREATURE_VOICES[kind] || CREATURE_VOICES.default;
        const destination = this._target(position);
        const now = this.ctx.currentTime;

        this._tone({
            freq: voice.freq * 0.85, freqTo: voice.glideTo * 0.5,
            glide: voice.decay * 2.2, type: voice.type,
            gain: voice.gain, attack: 0.01, decay: voice.decay * 2.2,
            when: now, destination,
        });
        this._playBuffer(this._impactBuffer(), {
            destination, when: now + voice.decay * 1.6, gain: 0.14, decay: 0.2,
            filters: [{ type: 'lowpass', frequency: 380 }],
        });
    }

    /** The player taking a hit — a body thud with a short grunt over it. */
    playPlayerHurt() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            gain: 0.26, decay: 0.16,
            filters: [{ type: 'lowpass', frequency: 320 }],
        });
        this._tone({
            freq: rand(150, 190), freqTo: 105, glide: 0.2,
            type: 'sawtooth', gain: 0.09, attack: 0.01, decay: 0.2, when: now + 0.02,
        });
    }

    /** The run ending — a slow descending minor figure. */
    playDeath() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        [392.00, 349.23, 293.66, 220.00].forEach((freq, i) => {
            const when = now + i * 0.36;
            const isLast = i === 3;
            this._tone({
                freq, type: 'triangle', gain: 0.11,
                attack: 0.06, hold: isLast ? 1.0 : 0.2, decay: isLast ? 1.6 : 0.4,
                when, detune: 0,
            });
            this._tone({
                freq: freq * 0.5, type: 'sine', gain: 0.06,
                attack: 0.08, hold: isLast ? 1.0 : 0.2, decay: isLast ? 1.8 : 0.4,
                when, detune: 0,
            });
        });
    }

    // ==========================================
    //  SOUND EFFECTS — harvesting
    // ==========================================

    /** Axe biting into wood. */
    playChop(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position, SpatialProfiles.prop);
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            destination, when: now, gain: 0.32, decay: 0.14,
            filters: [{ type: 'lowpass', frequency: rand(900, 1400), Q: 1.5 }],
        });
        this._tone({
            freq: rand(190, 240), freqTo: 120, glide: 0.12, type: 'triangle',
            gain: 0.12, attack: 0.003, decay: 0.13, when: now, destination,
        });
    }

    /** Heavy trunk impact followed by a short rustling tail. */
    playTreeFall(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position, SpatialProfiles.prop);
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            destination, when: now, gain: 0.46, playbackRate: 0.58, decay: 0.42,
            filters: [{ type: 'lowpass', frequency: 520, Q: 1.1 }],
        });
        this._playBuffer(this._softBuffer(), {
            destination, when: now + 0.04, gain: 0.18, playbackRate: 0.72, decay: 0.55,
            filters: [{ type: 'bandpass', frequency: 1450, Q: 0.7 }],
        });
        this._tone({
            freq: 92, freqTo: 42, glide: 0.36, type: 'triangle',
            gain: 0.18, attack: 0.008, decay: 0.42, when: now, destination,
        });
    }

    /** Stone struck by a tool — brighter and shorter than a chop. */
    playMine(position = null) {
        if (!this._ensureContext()) return;
        const destination = this._target(position, SpatialProfiles.prop);
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            destination, when: now, gain: 0.3, decay: 0.11,
            filters: [{ type: 'highpass', frequency: 700 }, { type: 'lowpass', frequency: 4200 }],
        });
        this._tone({
            freq: rand(2100, 2900), type: 'sine',
            gain: 0.05, attack: 0.003, decay: 0.1, when: now, destination,
        });
    }

    // ==========================================
    //  AMBIENCE & WEATHER (delegated)
    // ==========================================

    /** Start ambient ocean waves plus the day/night wildlife beds. */
    startAmbientWaves() {
        if (!this._ensureContext()) return;
        this.ambience.startWaves();
        this.ambience.startWildlifeBeds();
    }

    stopAmbientWaves() {
        if (this.ambience) {
            this.ambience.stopWaves();
            this.ambience.stopWildlifeBeds();
        }
    }

    startWind() {
        if (!this._ensureContext()) return;
        this.ambience.startWind();
        this.ambience.setWindIntensity(this._windIntensity);
    }

    startRain() {
        if (!this._ensureContext()) return;
        this.ambience.startRain();
        this.ambience.setRainIntensity(this._rainIntensity);
    }

    stopWind() {
        if (this.ambience) this.ambience.stopWind();
    }

    stopRain() {
        if (this.ambience) this.ambience.stopRain();
    }

    setWindIntensity(intensity) {
        this._windIntensity = clamp01(intensity);
        if (this.ambience) this.ambience.setWindIntensity(this._windIntensity);
    }

    setRainIntensity(intensity) {
        this._rainIntensity = clamp01(intensity);
        if (this.ambience) this.ambience.setRainIntensity(this._rainIntensity);
    }

    /** @param {number} t Normalised time of day, 0..1 */
    setTimeOfDay(t) {
        if (this.ambience) this.ambience.setTimeOfDay(t);
    }

    /**
     * Register a looping positional emitter (waterfall, campfire).
     * @see AmbienceDirector.addEmitter
     */
    addEmitter(id, kind, position, active = true) {
        if (!this._ensureContext()) return;
        this.ambience.addEmitter(id, kind, position, active);
    }

    setEmitterPosition(id, position) {
        if (this.ambience) this.ambience.setEmitterPosition(id, position);
    }

    setEmitterActive(id, active) {
        if (this.ambience) this.ambience.setEmitterActive(id, active);
    }

    removeEmitter(id) {
        if (this.ambience) this.ambience.removeEmitter(id);
    }

    /**
     * Play a thunder clap.
     *
     * Routed through the ambient bus, not SFX: it is weather, so turning the
     * ambience slider down has to quiet the storm as well as the rain.
     */
    playThunder() {
        if (!this._ensureContext()) return;

        // Sharp crack up front, then a long rumbling tail — pre-rendered in
        // three variants so no two strikes are identical and none of them
        // build a 120k-sample array while lightning is on screen.
        const buffer = this.buffers.pick('sfx:thunder', 3, 2.5, (data, sampleRate) => {
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                const t = i / sampleRate;
                const crack = Math.exp(-t * 6.0) * 1.2;
                const rumble = Math.exp(-t * 1.1);
                last = (last + 0.008 * white) / 1.008;
                data[i] = last * (crack + rumble) * 4.0;
            }
        });

        this._playBuffer(buffer, {
            destination: this.ambientBus,
            gain: 0.45,
            decay: 2.2,
            playbackRate: rand(0.9, 1.1),
            // Sweep the cutoff open→closed so the clap is bright, then darkens
            // as it rolls away.
            filters: [{ type: 'lowpass', frequency: 1200, sweepTo: 120, sweepTime: 1.8 }],
        });
    }

    // ==========================================
    //  MUSIC (delegated)
    // ==========================================

    startMusic() {
        if (!this._ensureContext()) return;
        this.music.start();
    }

    stopMusic() {
        if (this.music) this.music.stop();
    }

    /** @param {'calm'|'night'|'danger'} mood */
    setMusicMood(mood) {
        if (this.music) this.music.setMood(mood);
    }

    // ==========================================
    //  PER-FRAME
    // ==========================================

    /**
     * Player health as a 0..1 fraction. Drives the heartbeat that fades in as
     * the player approaches death.
     */
    setHealthFraction(fraction) {
        this._healthFraction = clamp01(fraction);
    }

    /**
     * Advance ambience smoothing, the music pad and the heartbeat.
     * Call once per frame from the active scene.
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this._initialized) return;
        this.ambience.update(deltaTime);
        this.music.update(deltaTime);
        this._updateHeartbeat(deltaTime);
    }

    /**
     * Below a third health the player hears their own pulse, quickening as it
     * gets worse. It is the only cue that reports health without the HUD.
     */
    _updateHeartbeat(deltaTime) {
        const threshold = 0.35;
        if (this._healthFraction >= threshold) {
            this._heartbeatTimer = 0;
            return;
        }

        // 0 at the threshold, 1 at death.
        const severity = 1 - this._healthFraction / threshold;
        this._heartbeatTimer -= deltaTime;
        if (this._heartbeatTimer > 0) return;
        this._heartbeatTimer = 1.05 - severity * 0.45;

        const now = this.ctx.currentTime;
        const level = 0.06 + severity * 0.10;
        // "lub-dub": two thumps, the second softer and slightly higher.
        this._tone({ freq: 58, freqTo: 40, glide: 0.16, type: 'sine', gain: level, attack: 0.012, decay: 0.16, when: now, detune: 0 });
        this._tone({ freq: 66, freqTo: 44, glide: 0.14, type: 'sine', gain: level * 0.7, attack: 0.012, decay: 0.14, when: now + 0.19, detune: 0 });
    }

    /**
     * @deprecated v1.1 — retained so older call sites keep working.
     * Use {@link update} instead; it drives music and the heartbeat too.
     */
    updateWeatherAudio(deltaTime) {
        this.update(deltaTime);
    }

    /**
     * Clean up all audio resources
     */
    destroy() {
        if (this.ambience) this.ambience.stopAll();
        if (this.music) this.music.stop();
        if (this.buffers) this.buffers.clear();
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this.ambience = null;
        this.music = null;
        this.buffers = null;
        this._listenerReady = false;
        this._initialized = false;
    }
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
