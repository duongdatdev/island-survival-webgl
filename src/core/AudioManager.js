/**
 * AudioManager - Procedural sound effects using Web Audio API
 * No external audio files needed — all sounds are synthesized at runtime.
 */
export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this.masterGain = null;
        /** v1.0: sub-buses so the settings menu can mix SFX and ambience apart. */
        this.sfxGain = null;
        this.ambientBus = null;
        this._limiter = null;
        this.isMuted = false;
        this._initialized = false;

        // v1.0 volume levels (0..1), applied whenever the context exists.
        this._masterVolume = 1.0;
        this._sfxVolume = 1.0;
        this._ambientVolume = 1.0;

        // Ambient loop nodes
        this._ambientSource = null;
        this._ambientGain = null;

        // Dynamic weather audio nodes
        this._windSource = null;
        this._windGain = null;
        this._windFilter = null;
        this._rainSource = null;
        this._rainGain = null;
        this._rainLowpass = null;
        this._thunderGain = null;

        // Audio state
        this._targetWindGain = 0.0;
        this._targetRainGain = 0.0;
        this._currentWindGain = 0.0;
        this._currentRainGain = 0.0;

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
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : this._masterVolume;

            // Two sub-buses feed the master so volume sliders can be adjusted
            // independently without touching every individual sound node.
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this._sfxVolume;
            this.sfxGain.connect(this.masterGain);

            this.ambientBus = this.ctx.createGain();
            this.ambientBus.gain.value = this._ambientVolume;
            this.ambientBus.connect(this.masterGain);

            // Master limiter: tames harsh peaks / clipping so synthesized
            // sounds stay smooth instead of buzzy and distorted.
            const limiter = this.ctx.createDynamicsCompressor();
            limiter.threshold.value = -6;
            limiter.knee.value = 12;
            limiter.ratio.value = 6;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;

            this.masterGain.connect(limiter);
            limiter.connect(this.ctx.destination);
            this._limiter = limiter;
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
    //  v1.0 VOLUME MIXING
    // ==========================================

    /**
     * Overall output level (0..1). Ignored while muted, but remembered so
     * unmuting comes back at the right level.
     */
    setMasterVolume(volume) {
        this._masterVolume = Math.max(0, Math.min(1, volume));
        if (!this.isMuted) {
            this._applyGain(this.masterGain, this._masterVolume);
        }
    }

    /** Level of one-shot sound effects (0..1). */
    setSfxVolume(volume) {
        this._sfxVolume = Math.max(0, Math.min(1, volume));
        this._applyGain(this.sfxGain, this._sfxVolume);
    }

    /** Level of looping ambience — waves, wind, rain (0..1). */
    setAmbientVolume(volume) {
        this._ambientVolume = Math.max(0, Math.min(1, volume));
        this._applyGain(this.ambientBus, this._ambientVolume);
    }

    /**
     * Apply every level from a SettingsManager in one call.
     * @param {{get:(k:string)=>*}} settings
     */
    applySettings(settings) {
        this.setMasterVolume(settings.get('masterVolume'));
        this.setSfxVolume(settings.get('sfxVolume'));
        this.setAmbientVolume(settings.get('ambientVolume'));
        this.setMuted(!!settings.get('muted'));
    }

    /**
     * Ramp a gain node, tolerating a not-yet-created audio context (the value
     * is stored on `this` either way and applied when the context comes up).
     */
    _applyGain(node, value) {
        if (!node || !this.ctx) return;
        node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
    }

    // ==========================================
    //  SOUND EFFECTS
    // ==========================================

    /**
     * Short chime when picking up a resource
     */
    playPickup() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Soft two-note "ping" (a fifth apart) — pleasant, not a shrill beep.
        const notes = [
            { freq: 784, start: 0.0 },   // G5
            { freq: 1175, start: 0.07 }, // D6
        ];
        notes.forEach(({ freq, start }) => {
            const t = now + start;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);

            // Add a gentle overtone for a bell-like body
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(freq * 2, t);
            const gain2 = ctx.createGain();
            gain2.gain.setValueAtTime(0.04, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

            osc.connect(gain);
            osc2.connect(gain2);
            gain.connect(this.sfxGain);
            gain2.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.3);
            osc2.start(t);
            osc2.stop(t + 0.22);
        });
    }

    /**
     * Metallic hammer sound for crafting
     */
    playCraft() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Impact: short filtered noise burst — reads as a real "thock",
        // not a buzzy square-wave tone.
        const impactBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const impactData = impactBuf.getChannelData(0);
        for (let i = 0; i < impactData.length; i++) {
            const t = i / impactData.length;
            impactData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
        }
        const impact = ctx.createBufferSource();
        impact.buffer = impactBuf;
        const impactFilter = ctx.createBiquadFilter();
        impactFilter.type = 'lowpass';
        impactFilter.frequency.value = 900;
        const gain1 = ctx.createGain();
        gain1.gain.value = 0.35;
        impact.connect(impactFilter);
        impactFilter.connect(gain1);
        gain1.connect(this.sfxGain);
        impact.start(now);

        // Metallic ring — softer sine partials instead of a bright triangle sweep.
        [1568, 2350].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + 0.01);
            const amp = idx === 0 ? 0.07 : 0.03;
            gain.gain.setValueAtTime(0.0001, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(amp, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now + 0.01);
            osc.stop(now + 0.4);
        });
    }

    /**
     * Wood thunk for raft assembly
     */
    playRaftBuild() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Two wooden knocks: a filtered-noise attack + a low triangle "body"
        // give a hollow-wood thunk rather than a synthetic creak.
        const knock = (t, bodyFreq, level) => {
            // Attack transient
            const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
            const nData = nBuf.getChannelData(0);
            for (let i = 0; i < nData.length; i++) {
                const p = i / nData.length;
                nData[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, 3);
            }
            const src = ctx.createBufferSource();
            src.buffer = nBuf;
            const nFilter = ctx.createBiquadFilter();
            nFilter.type = 'lowpass';
            nFilter.frequency.value = 1200;
            const nGain = ctx.createGain();
            nGain.gain.value = level * 0.5;
            src.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(this.sfxGain);
            src.start(t);

            // Hollow body
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(bodyFreq, t);
            osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.6, t + 0.1);
            gain.gain.setValueAtTime(level, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.26);
        };

        knock(now, 150, 0.18);
        knock(now + 0.11, 120, 0.14);
    }

    /**
     * Victory fanfare — ascending melody
     */
    playVictory() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const noteDuration = 0.25;

        notes.forEach((freq, i) => {
            const startTime = now + i * noteDuration;
            // Sustain the final note longer for a satisfying resolve.
            const dur = i === notes.length - 1 ? noteDuration * 2.5 : noteDuration;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            // A soft sine fifth adds warmth without harshness.
            const harm = ctx.createOscillator();
            const harmGain = ctx.createGain();
            harm.type = 'sine';
            harm.frequency.setValueAtTime(freq * 1.5, startTime);
            harmGain.gain.setValueAtTime(0, startTime);
            harmGain.gain.linearRampToValueAtTime(0.04, startTime + 0.05);
            harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur + 0.2);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.13, startTime + 0.04);
            gain.gain.setValueAtTime(0.13, startTime + dur * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + dur + 0.25);

            osc.connect(gain);
            harm.connect(harmGain);
            gain.connect(this.sfxGain);
            harmGain.connect(this.sfxGain);
            osc.start(startTime);
            osc.stop(startTime + dur + 0.35);
            harm.start(startTime);
            harm.stop(startTime + dur + 0.35);
        });
    }

    /**
     * UI button click
     */
    playClick() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);

        // Quick fade-in avoids the hard "tick" of an instant gain jump.
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.11);
    }

    /**
     * Single footstep sound
     */
    playFootstep() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Footsteps are soft filtered-noise thumps, not a pure tone.
        const dur = 0.09;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const t = i / data.length;
            // Fast attack, quick decay — the shape of a foot landing.
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
        }

        const src = ctx.createBufferSource();
        src.buffer = buf;

        // Low-pass with slight random cutoff = subtle step-to-step variety.
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220 + Math.random() * 120;
        filter.Q.value = 0.8;

        const gain = ctx.createGain();
        gain.gain.value = 0.12;

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        src.start(now);
    }

    /**
     * Start ambient ocean wave loop
     */
    startAmbientWaves() {
        if (!this._ensureContext()) return;
        if (this._ambientSource) return; // Already playing

        const ctx = this.ctx;

        // Create brown noise for ocean ambience
        const bufferSize = ctx.sampleRate * 4; // 4 seconds loop
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate brown noise (random walk). Lower gain avoids clipping/distortion.
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 2.2;

            // Two overlapping slow swells = a more natural, less mechanical surf.
            const t = i / ctx.sampleRate;
            const swell1 = Math.sin(t * Math.PI * 2 * 0.13) * 0.5 + 0.5;
            const swell2 = Math.sin(t * Math.PI * 2 * 0.071 + 1.3) * 0.5 + 0.5;
            data[i] *= 0.35 + 0.65 * (swell1 * 0.6 + swell2 * 0.4);
        }

        // Crossfade the loop seam so there's no click every 4 seconds.
        const fade = Math.floor(ctx.sampleRate * 0.25);
        for (let i = 0; i < fade; i++) {
            const g = i / fade;
            const tail = data[bufferSize - fade + i];
            data[i] = data[i] * g + tail * (1 - g);
        }

        this._ambientSource = ctx.createBufferSource();
        this._ambientSource.buffer = buffer;
        this._ambientSource.loop = true;

        // Low-pass filter for deep ocean sound
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this._ambientGain = ctx.createGain();
        this._ambientGain.gain.value = 0.12;

        this._ambientSource.connect(filter);
        filter.connect(this._ambientGain);
        this._ambientGain.connect(this.ambientBus);

        this._ambientSource.start();
    }

    /**
     * Stop ambient ocean waves
     */
    stopAmbientWaves() {
        if (this._ambientSource) {
            try {
                this._ambientSource.stop();
            } catch (e) { /* ignore */ }
            this._ambientSource = null;
        }
        this._ambientGain = null;
    }

    // ==========================================
    //  DYNAMIC WEATHER AUDIO (v0.4)
    // ==========================================

    startWind() {
        if (!this._ensureContext()) return;
        if (this._windSource) return;

        const ctx = this.ctx;
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.01 * white)) / 1.01;
            data[i] = lastOut * 2.4;
            const t = i / ctx.sampleRate;
            // Gentle gusting from two slow LFOs.
            const mod = (Math.sin(t * Math.PI * 2 * 0.08) * 0.3
                + Math.sin(t * Math.PI * 2 * 0.037 + 0.7) * 0.2) + 0.6;
            data[i] *= mod;
        }

        // Crossfade loop seam to remove periodic clicking.
        const wFade = Math.floor(ctx.sampleRate * 0.25);
        for (let i = 0; i < wFade; i++) {
            const g = i / wFade;
            const tail = data[bufferSize - wFade + i];
            data[i] = data[i] * g + tail * (1 - g);
        }

        this._windSource = ctx.createBufferSource();
        this._windSource.buffer = buffer;
        this._windSource.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 180;
        filter.Q.value = 0.7;

        this._windGain = ctx.createGain();
        this._windGain.gain.value = 0;
        this._currentWindGain = 0;

        this._windFilter = filter;
        this._windSource.connect(filter);
        filter.connect(this._windGain);
        this._windGain.connect(this.ambientBus);
        this._windSource.start();
    }

    startRain() {
        if (!this._ensureContext()) return;
        if (this._rainSource) return;

        const ctx = this.ctx;
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            const t = i / ctx.sampleRate;
            const mod = Math.sin(t * Math.PI * 2 * 0.3 + Math.sin(t * Math.PI * 2 * 0.7) * 0.5);
            data[i] = white * (0.4 + mod * 0.5);
        }

        // Crossfade loop seam.
        const rFade = Math.floor(ctx.sampleRate * 0.15);
        for (let i = 0; i < rFade; i++) {
            const g = i / rFade;
            const tail = data[bufferSize - rFade + i];
            data[i] = data[i] * g + tail * (1 - g);
        }

        this._rainSource = ctx.createBufferSource();
        this._rainSource.buffer = buffer;
        this._rainSource.loop = true;

        // Band-limit: highpass removes rumble, a companion lowpass tames the
        // shrill hiss so it sounds like rain rather than static.
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 6000;
        this._rainLowpass = lp;

        this._rainGain = ctx.createGain();
        this._rainGain.gain.value = 0;
        this._currentRainGain = 0;

        this._rainSource.connect(filter);
        filter.connect(lp);
        lp.connect(this._rainGain);
        this._rainGain.connect(this.ambientBus);
        this._rainSource.start();
    }

    stopWind() {
        if (this._windSource) {
            try { this._windSource.stop(); } catch (e) { }
            this._windSource = null;
        }
        this._windGain = null;
        this._windFilter = null;
        this._currentWindGain = 0;
    }

    stopRain() {
        if (this._rainSource) {
            try { this._rainSource.stop(); } catch (e) { }
            this._rainSource = null;
        }
        this._rainGain = null;
        this._rainLowpass = null;
        this._currentRainGain = 0;
    }

    setWindIntensity(intensity, smooth = true) {
        this._targetWindGain = Math.max(0, Math.min(1, intensity * 0.25));
        if (!smooth) {
            this._currentWindGain = this._targetWindGain;
            if (this._windGain) this._windGain.gain.value = this._targetWindGain;
        }
    }

    setRainIntensity(intensity, smooth = true) {
        this._targetRainGain = Math.max(0, Math.min(1, intensity * 0.2));
        if (!smooth) {
            this._currentRainGain = this._targetRainGain;
            if (this._rainGain) this._rainGain.gain.value = this._targetRainGain;
        }
    }

    updateWeatherAudio(deltaTime) {
        if (this._windGain) {
            this._currentWindGain += (this._targetWindGain - this._currentWindGain) * deltaTime * 2.0;
            this._windGain.gain.value = this._currentWindGain;

            const targetFreq = 120 + this._targetWindGain * 120;
            if (this._windFilter) {
                this._windFilter.frequency.value += (targetFreq - this._windFilter.frequency.value) * deltaTime * 2;
            }
        }

        if (this._rainGain) {
            this._currentRainGain += (this._targetRainGain - this._currentRainGain) * deltaTime * 2.0;
            this._rainGain.gain.value = this._currentRainGain;
        }
    }

    /**
     * Play a thunder clap
     */
    playThunder() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const bufferSize = ctx.sampleRate * 2.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Sharp crack up front, then a long rumbling tail.
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            const t = i / ctx.sampleRate;
            const crack = Math.exp(-t * 6.0) * 1.2;   // initial clap
            const rumble = Math.exp(-t * 1.1);          // rolling thunder
            lastOut = (lastOut + (0.008 * white)) / 1.008;
            data[i] = lastOut * (crack + rumble) * 4.0;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Sweep the cutoff open→closed so the clap is bright then darkens as
        // it rolls away — much more natural than a static 80 Hz muffle.
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(120, now + 1.8);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2.2);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
    }

    /**
     * Clean up all audio resources
     */
    destroy() {
        this.stopWind();
        this.stopRain();
        this.stopAmbientWaves();
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this._initialized = false;
    }
}
