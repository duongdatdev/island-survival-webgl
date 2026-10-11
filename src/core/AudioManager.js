import { AudioBuffers } from './audio/AudioBuffers.js';
import { AmbienceDirector } from './audio/AmbienceDirector.js';
import { MusicDirector } from './audio/MusicDirector.js';
import { createPanner, setListenerPose, SpatialProfiles } from './audio/Spatial.js';

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
        if (this._initialized) { this.resume(); return true; }
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
            this.music = new MusicDirector(ctx, this.musicBus, this.buffers);
            this._sources = new Set();
            this.buffers.preloadSfx();

            this._initialized = true;
            return true;
        } catch (e) {
            console.warn('AudioManager: Web Audio API not available', e);
            return false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(error => console.warn('Audio resume failed', error));
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


    // Drop a transient event if its file takes too long to arrive. Never replay
    // old combat/UI events after a slow download or after the manager is destroyed.
    async _sample(id, { position = null, gain = 0.3, rate = 1, bus = null } = {}) {
        if (!this._ensureContext()) return;
        const ctx = this.ctx;
        const requested = ctx.currentTime;
        const wallTime = performance.now();
        const buffer = await this.buffers.load(id);
        if (!buffer || this.ctx !== ctx || ctx.state === 'closed' ||
            ctx.currentTime - requested > 0.35 || performance.now() - wallTime > 700) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        const level = ctx.createGain();
        level.gain.value = gain;
        const panner = position && this._listenerReady
            ? createPanner(ctx, position, bus || this.sfxGain, SpatialProfiles.prop) : null;
        source.connect(level);
        level.connect(panner || bus || this.sfxGain);
        this._sources.add(source);
        source.onended = () => {
            source.disconnect();
            level.disconnect();
            panner?.disconnect();
            this._sources.delete(source);
        };
        source.start();
    }

    playPickup() { return this._sample('pickup', { gain: 0.32 }); }
    playCraft() { return this._sample('craft', { gain: 0.45 }); }
    playRaftBuild(position = null) { return this._sample('raft', { position, gain: 0.5 }); }
    playVictory() { return this._sample('victory', { gain: 0.38 }); }
    playClick() { return this._sample('click', { gain: 0.22 }); }
    playHover() { return this._sample('hover', { gain: 0.06 }); }
    playError() { return this._sample('error', { gain: 0.22 }); }
    playOpenPanel() { return this._sample('open', { gain: 0.26 }); }
    playClosePanel() { return this._sample('close', { gain: 0.22 }); }
    playAchievement() { return this._sample('achievement', { gain: 0.32 }); }
    playFootstep(surface = 'grass', running = false) {
        const id = ['sand', 'grass', 'rock', 'wood'].includes(surface) ? `step-${surface}`
            : surface === 'water' ? 'splash' : 'step-grass';
        return this._sample(id, { gain: running ? 0.23 : 0.16, rate: 0.94 + Math.random() * 0.12 });
    }
    playSplash(position = null) { return this._sample('splash', { position, gain: 0.25 }); }
    playEat() { return this._sample('eat', { gain: 0.3 }); }
    playDrink() { return this._sample('drink', { gain: 0.22 }); }
    playHeal() { return this._sample('heal', { gain: 0.22 }); }
    playSwing(position = null) { return this._sample('swing', { position, gain: 0.3 }); }
    playPunch(position = null) { return this._sample('punch', { position, gain: 0.4 }); }
    playThrust(position = null) { return this._sample('thrust', { position, gain: 0.3 }); }
    playBowRelease(position = null) { return this._sample('bow', { position, gain: 0.35 }); }
    playHit(position = null) { return this._sample('hit', { position, gain: 0.42 }); }
    playArrowImpact(position = null) { return this._sample('arrow', { position, gain: 0.4 }); }
    playCreatureHurt(kind = 'default', position = null) {
        const rate = { boar: 0.85, seagull: 1.5, crab: 1.25, shark: 0.65 }[kind] || 1;
        return this._sample('creature-hurt', { position, rate, gain: 0.26 });
    }
    playCreatureDie(kind = 'default', position = null) {
        return this._sample('creature-die', { position, gain: 0.3, rate: kind === 'shark' ? 0.7 : 1 });
    }
    playPlayerHurt() { return this._sample('hit', { gain: 0.4 }); }
    playDeath() { return this._sample('death', { gain: 0.35 }); }
    playChop(position = null) { return this._sample('chop', { position, gain: 0.42 }); }
    playTreeFall(position = null) { return this._sample('tree-fall', { position, gain: 0.55, rate: 0.8 }); }
    playMine(position = null) { return this._sample('mine', { position, gain: 0.38 }); }

    startAmbientWaves() {
        if (!this._ensureContext()) return;
        this.ambience.startWaves();
        this.ambience.startWildlifeBeds();
    }
    stopAmbientWaves() {
        this.ambience?.stopWaves();
        this.ambience?.stopWildlifeBeds();
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
    stopWind() { this.ambience?.stopWind(); }
    stopRain() { this.ambience?.stopRain(); }
    setWindIntensity(intensity) {
        this._windIntensity = clamp01(intensity);
        this.ambience?.setWindIntensity(this._windIntensity);
    }
    setRainIntensity(intensity) {
        this._rainIntensity = clamp01(intensity);
        this.ambience?.setRainIntensity(this._rainIntensity);
    }
    setTimeOfDay(t) { this.ambience?.setTimeOfDay(t); }
    addEmitter(id, kind, position, active = true) {
        if (this._ensureContext()) this.ambience.addEmitter(id, kind, position, active);
    }
    setEmitterPosition(id, position) { this.ambience?.setEmitterPosition(id, position); }
    setEmitterActive(id, active) { this.ambience?.setEmitterActive(id, active); }
    removeEmitter(id) { this.ambience?.removeEmitter(id); }
    playThunder() {
        if (this._ensureContext()) return this._sample('thunder', { gain: 0.4, bus: this.ambientBus });
    }
    startMusic() { if (this._ensureContext()) this.music.start(); }
    stopMusic() { this.music?.stop(); }
    setMusicMood(mood) { this.music?.setMood(mood); }
    setHealthFraction(fraction) { this._healthFraction = clamp01(fraction); }
    update(deltaTime) {
        if (!this._initialized) return;
        this.ambience.update(deltaTime);
        if (this._healthFraction <= 0 || this._healthFraction >= 0.35) {
            this._heartbeatTimer = 0;
            return;
        }
        this._heartbeatTimer -= deltaTime;
        if (this._heartbeatTimer <= 0) {
            const severity = 1 - this._healthFraction / 0.35;
            this._heartbeatTimer = 1.5 / (1 + severity * 0.4);
            this._sample('heartbeat', { gain: 0.12 + severity * 0.12, rate: 1 + severity * 0.4 });
        }
    }
    updateWeatherAudio(deltaTime) { this.update(deltaTime); }
    destroy() {
        this.ambience?.stopAll();
        this.music?.stop();
        for (const source of this._sources || []) {
            try { source.stop(); } catch { /* already ended */ }
        }
        this.buffers?.clear();
        this.ctx?.close();
        this.ctx = null;
        this.ambience = this.music = this.buffers = null;
        this._listenerReady = this._initialized = false;
    }
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
