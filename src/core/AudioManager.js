/**
 * AudioManager - Procedural sound effects using Web Audio API
 * No external audio files needed — all sounds are synthesized at runtime.
 */
export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this.masterGain = null;
        this.isMuted = false;
        this._initialized = false;

        // Ambient loop nodes
        this._ambientSource = null;
        this._ambientGain = null;

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
            this.masterGain.gain.value = this.isMuted ? 0 : 1;
            this.masterGain.connect(this.ctx.destination);
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
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.05);
        }
        try {
            localStorage.setItem('island_survival_muted', this.isMuted.toString());
        } catch (e) { /* ignore */ }
        return this.isMuted;
    }

    /**
     * Set mute state explicitly
     */
    setMuted(muted) {
        this.isMuted = muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.05);
        }
        try {
            localStorage.setItem('island_survival_muted', this.isMuted.toString());
        } catch (e) { /* ignore */ }
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

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    /**
     * Metallic hammer sound for crafting
     */
    playCraft() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Impact hit
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc1.connect(gain1);
        gain1.connect(this.masterGain);
        osc1.start(now);
        osc1.stop(now + 0.2);

        // Metallic ring
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1480, now);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.25);
        gain2.gain.setValueAtTime(0.1, now + 0.02);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now);
        osc2.stop(now + 0.45);
    }

    /**
     * Wood thunk for raft assembly
     */
    playRaftBuild() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);

        // Secondary creak
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(300, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(180, now + 0.2);
        gain2.gain.setValueAtTime(0.06, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.4);
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
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            const startTime = now + i * noteDuration;
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.04);
            gain.gain.setValueAtTime(0.15, startTime + noteDuration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteDuration + 0.2);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(startTime);
            osc.stop(startTime + noteDuration + 0.3);
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
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    /**
     * Single footstep sound
     */
    playFootstep() {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        // Randomize pitch slightly for variety
        const baseFreq = 80 + Math.random() * 40;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.06);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
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

        // Generate brown noise (random walk)
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 3.5;

            // Add slow wave modulation
            const waveFreq = 0.15; // ~0.15 Hz wave cycle
            const modulation = Math.sin((i / ctx.sampleRate) * Math.PI * 2 * waveFreq) * 0.5 + 0.5;
            data[i] *= modulation;
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
        this._ambientGain.connect(this.masterGain);

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

    /**
     * Clean up all audio resources
     */
    destroy() {
        this.stopAmbientWaves();
        if (this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
        this._initialized = false;
    }
}
