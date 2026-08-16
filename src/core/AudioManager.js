import {
    AudioBuffers, fillNoiseBurst, rand, randomDetune,
} from './audio/AudioBuffers.js';
import { AmbienceDirector } from './audio/AmbienceDirector.js';
import { MusicDirector } from './audio/MusicDirector.js';
import { createPanner, setListenerPose, SpatialProfiles } from './audio/Spatial.js';


const FOOTSTEP_SURFACES = {
    sand:  { cutoff: 300,  Q: 0.7, gain: 0.115, wet: false },
    grass: { cutoff: 620,  Q: 1.1, gain: 0.100, wet: false },
    rock:  { cutoff: 1150, Q: 1.4, gain: 0.130, wet: false },
    wood:  { cutoff: 780,  Q: 2.2, gain: 0.120, wet: false, body: 165 },
    water: { cutoff: 1400, Q: 0.8, gain: 0.150, wet: true },
};

const CREATURE_VOICES = {
    boar:    { freq: 260, type: 'sawtooth', decay: 0.34, gain: 0.16, glideTo: 150 },
    seagull: { freq: 1250, type: 'sawtooth', decay: 0.20, gain: 0.10, glideTo: 900 },
    crab:    { freq: 640, type: 'square', decay: 0.09, gain: 0.07, glideTo: 520 },
    shark:   { freq: 150, type: 'triangle', decay: 0.40, gain: 0.15, glideTo: 90 },
    default: { freq: 380, type: 'triangle', decay: 0.22, gain: 0.11, glideTo: 260 },
};

const DUCK_LEVEL = 0.32;

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.ambientBus = null;
        this.musicBus = null;
        this._duckGain = null;
        this._limiter = null;
        this.isMuted = false;
        this._initialized = false;

        this._masterVolume = 1.0;
        this._sfxVolume = 1.0;
        this._ambientVolume = 1.0;
        this._musicVolume = 1.0;

        this.buffers = null;
        this.ambience = null;
        this.music = null;

        this._ducked = false;
        this._healthFraction = 1.0;
        this._heartbeatTimer = 0;
        this._listenerReady = false;

        this._windIntensity = 0;
        this._rainIntensity = 0;

        try {
            this.isMuted = localStorage.getItem('island_survival_muted') === 'true';
        } catch (e) { }
    }

    _ensureContext() {
        if (this._initialized) return true;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.ctx = ctx;

            this.masterGain = ctx.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : this._masterVolume;

            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -6;
            limiter.knee.value = 12;
            limiter.ratio.value = 6;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;
            this.masterGain.connect(limiter);
            limiter.connect(ctx.destination);
            this._limiter = limiter;

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

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.setMuted(!this.isMuted);
        return this.isMuted;
    }

    setMuted(muted) {
        this.isMuted = muted;
        this._applyGain(this.masterGain, this.isMuted ? 0 : this._masterVolume);
        try {
            localStorage.setItem('island_survival_muted', this.isMuted.toString());
        } catch (e) { }
    }


    setMasterVolume(volume) {
        this._masterVolume = clamp01(volume);
        if (!this.isMuted) {
            this._applyGain(this.masterGain, this._masterVolume);
        }
    }

    setSfxVolume(volume) {
        this._sfxVolume = clamp01(volume);
        this._applyGain(this.sfxGain, this._sfxVolume);
    }

    setAmbientVolume(volume) {
        this._ambientVolume = clamp01(volume);
        this._applyGain(this.ambientBus, this._ambientVolume);
    }

    setMusicVolume(volume) {
        this._musicVolume = clamp01(volume);
        this._applyGain(this.musicBus, this._musicVolume);
    }

    applySettings(settings) {
        this.setMasterVolume(settings.get('masterVolume'));
        this.setSfxVolume(settings.get('sfxVolume'));
        this.setAmbientVolume(settings.get('ambientVolume'));
        this.setMusicVolume(settings.get('musicVolume'));
        this.setMuted(!!settings.get('muted'));
    }

    setDucked(ducked) {
        if (this._ducked === ducked) return;
        this._ducked = ducked;
        this._applyGain(this._duckGain, ducked ? DUCK_LEVEL : 1.0, 0.12);
    }

    _applyGain(node, value, timeConstant = 0.05) {
        if (!node || !this.ctx) return;
        node.gain.setTargetAtTime(value, this.ctx.currentTime, timeConstant);
    }


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

    _target(position, profile = SpatialProfiles.creature) {
        if (!position || !this._listenerReady) return this.sfxGain;
        return createPanner(this.ctx, position, this.sfxGain, profile);
    }


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

    _impactBuffer() {
        return this.buffers.pick('sfx:impact', 5, 0.14, (data) => fillNoiseBurst(data, 2.6));
    }

    _softBuffer() {
        return this.buffers.pick('sfx:soft', 6, 0.09, (data) => fillNoiseBurst(data, 2.2));
    }


    playPickup() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;

        [{ freq: 784, at: 0.0 }, { freq: 1175, at: 0.07 }].forEach(({ freq, at }) => {
            const when = now + at;
            this._tone({ freq, type: 'sine', gain: 0.12, attack: 0.01, decay: 0.24, when });
            this._tone({ freq: freq * 2, type: 'sine', gain: 0.04, attack: 0.008, decay: 0.17, when });
        });
    }

    playCraft() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;

        this._playBuffer(this._impactBuffer(), {
            gain: 0.35,
            filters: [{ type: 'lowpass', frequency: 900 }],
        });

        [[1568, 0.07], [2350, 0.03]].forEach(([freq, gain]) => {
            this._tone({ freq, type: 'sine', gain, attack: 0.02, decay: 0.32, when: now + 0.01 });
        });
    }

    playRaftBuild(position = null) {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        const destination = this._target(position, SpatialProfiles.prop);

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

    playVictory() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const noteDuration = 0.25;

        notes.forEach((freq, i) => {
            const when = now + i * noteDuration;
            const isLast = i === notes.length - 1;
            const hold = isLast ? noteDuration * 1.8 : noteDuration * 0.6;

            this._tone({
                freq, type: 'triangle', gain: 0.13,
                attack: 0.04, hold, decay: 0.25, when, detune: 0,
            });
            this._tone({
                freq: freq * 1.5, type: 'sine', gain: 0.04,
                attack: 0.05, hold, decay: 0.25, when, detune: 0,
            });
        });
    }

    playClick() {
        if (!this._ensureContext()) return;
        this._tone({
            freq: 660, freqTo: 440, glide: 0.05,
            type: 'sine', gain: 0.08, attack: 0.008, decay: 0.08,
        });
    }

    playHover() {
        if (!this._ensureContext()) return;
        this._tone({ freq: 1320, type: 'sine', gain: 0.018, attack: 0.004, decay: 0.04 });
    }

    playError() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        this._tone({ freq: 320, type: 'square', gain: 0.05, attack: 0.006, decay: 0.09, when: now });
        this._tone({ freq: 220, type: 'square', gain: 0.05, attack: 0.006, decay: 0.14, when: now + 0.09 });
    }

    playOpenPanel() {
        if (!this._ensureContext()) return;
        this._playBuffer(this._softBuffer(), {
            gain: 0.08, playbackRate: 0.35, decay: 0.22,
            filters: [{ type: 'bandpass', frequency: 500, Q: 1.2, sweepTo: 1800, sweepTime: 0.18 }],
        });
    }

    playClosePanel() {
        if (!this._ensureContext()) return;
        this._playBuffer(this._softBuffer(), {
            gain: 0.07, playbackRate: 0.35, decay: 0.2,
            filters: [{ type: 'bandpass', frequency: 1600, Q: 1.2, sweepTo: 420, sweepTime: 0.16 }],
        });
    }

    playAchievement() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        [1046.50, 1318.51, 1567.98].forEach((freq, i) => {
            const when = now + i * 0.1;
            this._tone({ freq, type: 'triangle', gain: 0.1, attack: 0.01, hold: 0.05, decay: 0.3, when, detune: 0 });
            this._tone({ freq: freq * 2, type: 'sine', gain: 0.025, attack: 0.01, decay: 0.25, when, detune: 0 });
        });
    }


    playFootstep(surface = 'grass', running = false) {
        if (!this._ensureContext()) return;
        const profile = FOOTSTEP_SURFACES[surface] || FOOTSTEP_SURFACES.grass;

        const buffer = profile.wet
            ? this.buffers.pick('sfx:stepwet', 4, 0.2, (data) => fillNoiseBurst(data, 1.4))
            : this._softBuffer();

        const gain = profile.gain * (running ? 1.35 : 1.0);
        const cutoff = profile.cutoff * (running ? 1.15 : 1.0) * rand(0.85, 1.18);

        this._playBuffer(buffer, {
            gain,
            playbackRate: rand(0.9, 1.12),
            filters: [{ type: 'lowpass', frequency: cutoff, Q: profile.Q }],
        });

        if (profile.body) {
            this._tone({
                freq: profile.body * rand(0.9, 1.1), type: 'triangle',
                gain: gain * 0.4, attack: 0.004, decay: 0.09,
            });
        }
    }

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

    playHeal() {
        if (!this._ensureContext()) return;
        const now = this.ctx.currentTime;
        this._tone({ freq: 440, freqTo: 880, glide: 0.35, type: 'sine', gain: 0.07, attack: 0.05, decay: 0.3, when: now });
        this._tone({ freq: 660, freqTo: 1320, glide: 0.35, type: 'sine', gain: 0.035, attack: 0.08, decay: 0.3, when: now });
    }


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

    setTimeOfDay(t) {
        if (this.ambience) this.ambience.setTimeOfDay(t);
    }

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

    playThunder() {
        if (!this._ensureContext()) return;

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
            filters: [{ type: 'lowpass', frequency: 1200, sweepTo: 120, sweepTime: 1.8 }],
        });
    }


    startMusic() {
        if (!this._ensureContext()) return;
        this.music.start();
    }

    stopMusic() {
        if (this.music) this.music.stop();
    }

    setMusicMood(mood) {
        if (this.music) this.music.setMood(mood);
    }


    setHealthFraction(fraction) {
        this._healthFraction = clamp01(fraction);
    }

    update(deltaTime) {
        if (!this._initialized) return;
        this.ambience.update(deltaTime);
        this.music.update(deltaTime);
        this._updateHeartbeat(deltaTime);
    }

    _updateHeartbeat(deltaTime) {
        const threshold = 0.35;
        if (this._healthFraction >= threshold) {
            this._heartbeatTimer = 0;
            return;
        }

        const severity = 1 - this._healthFraction / threshold;
        this._heartbeatTimer -= deltaTime;
        if (this._heartbeatTimer > 0) return;
        this._heartbeatTimer = 1.05 - severity * 0.45;

        const now = this.ctx.currentTime;
        const level = 0.06 + severity * 0.10;
        this._tone({ freq: 58, freqTo: 40, glide: 0.16, type: 'sine', gain: level, attack: 0.012, decay: 0.16, when: now, detune: 0 });
        this._tone({ freq: 66, freqTo: 44, glide: 0.14, type: 'sine', gain: level * 0.7, attack: 0.012, decay: 0.14, when: now + 0.19, detune: 0 });
    }

    updateWeatherAudio(deltaTime) {
        this.update(deltaTime);
    }

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
