import { createPanner, setPannerPosition, SpatialProfiles } from './Spatial.js';
export class AmbienceDirector {
    constructor(ctx, buffers, bus) {
        this.ctx = ctx;
        this.buffers = buffers;
        this.bus = bus;
        this._layers = new Map();
        this._emitters = new Map();
        this._timeOfDay = 0.3;
        this._rainIntensity = this._windIntensity = 0;
    }
    startWaves() { this._start(this._layers, 'waves', 'waves', 0.2); }
    startWind() { this._start(this._layers, 'wind', 'wind', this._windIntensity * 0.2); }
    startRain() { this._start(this._layers, 'rain', 'rain', this._rainIntensity * 0.3); }
    startWildlifeBeds() {
        this._start(this._layers, 'daylife', 'daylife', 0);
        this._start(this._layers, 'nightlife', 'nightlife', 0);
        this.setTimeOfDay(this._timeOfDay);
    }
    stopWaves() { this._stop(this._layers, 'waves'); }
    stopWind() { this._stop(this._layers, 'wind'); }
    stopRain() { this._stop(this._layers, 'rain'); }
    stopWildlifeBeds() {
        this._stop(this._layers, 'daylife');
        this._stop(this._layers, 'nightlife');
    }
    setWindIntensity(value) {
        this._windIntensity = clamp01(value);
        this._target('wind', this._windIntensity * 0.2);
    }
    setRainIntensity(value) {
        this._rainIntensity = clamp01(value);
        this._target('rain', this._rainIntensity * 0.3);
        this.setTimeOfDay(this._timeOfDay);
    }
    setTimeOfDay(t) {
        this._timeOfDay = t;
        const night = t < 0.1 ? 1 : t < 0.2 ? 1 - (t - 0.1) / 0.1
            : t < 0.74 ? 0 : t < 0.88 ? (t - 0.74) / 0.14 : 1;
        const weather = 1 - Math.min(1, this._rainIntensity * 1.4);
        this._target('daylife', (1 - night) * 0.13 * weather);
        this._target('nightlife', night * 0.1 * weather);
    }
    addEmitter(id, kind, position, active = true) {
        if (!['campfire', 'waterfall'].includes(kind)) return;
        if (this._emitters.has(id)) {
            this.setEmitterPosition(id, position);
            this.setEmitterActive(id, active);
            return;
        }
        this._start(this._emitters, id, kind, active ? 0.45 : 0, position,
            kind === 'waterfall' ? SpatialProfiles.landmark : SpatialProfiles.prop);
    }
    setEmitterPosition(id, position) {
        const entry = this._emitters.get(id);
        if (entry?.panner) setPannerPosition(this.ctx, entry.panner, position, 0.05);
    }
    setEmitterActive(id, active) {
        const entry = this._emitters.get(id);
        if (entry) entry.target = active ? 0.45 : 0;
    }
    removeEmitter(id) { this._stop(this._emitters, id); }
    async _start(map, id, clip, target, position = null, profile = null) {
        if (map.has(id)) return;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.bus);
        const panner = position ? createPanner(this.ctx, position, gain, profile) : null;
        const entry = { gain, panner, source: null, current: 0, target };
        map.set(id, entry);
        const buffer = await this.buffers.load(clip);
        // Ignore recordings whose scene stopped while they were downloading.
        if (map.get(id) !== entry) return;
        if (!buffer) { this._stop(map, id); return; }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(panner || gain);
        entry.source = source;
        source.start(0, Math.random() * buffer.duration);
    }
    _target(id, target) {
        const entry = this._layers.get(id);
        if (entry) entry.target = target;
    }
    _stop(map, id) {
        const entry = map.get(id);
        if (!entry) return;
        map.delete(id);
        if (entry.source) {
            entry.source.stop();
            entry.source.disconnect();
        }
        entry.panner?.disconnect();
        entry.gain.disconnect();
    }
    update(dt) {
        for (const map of [this._layers, this._emitters]) {
            for (const entry of map.values()) {
                entry.current += (entry.target - entry.current) * Math.min(1, Math.max(0, dt) * 1.5);
                entry.gain.gain.setTargetAtTime(entry.current, this.ctx.currentTime, 0.08);
            }
        }
    }
    stopAll() {
        for (const map of [this._layers, this._emitters]) {
            for (const id of [...map.keys()]) this._stop(map, id);
        }
    }
}
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
