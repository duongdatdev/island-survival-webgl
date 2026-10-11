const LEVELS = { calm: 0.23, night: 0.19, danger: 0.27 };
export class MusicDirector {
    constructor(ctx, bus, buffers) {
        this.ctx = ctx;
        this.bus = bus;
        this.buffers = buffers;
        this._mood = 'calm';
        this._running = false;
        this._generation = 0;
        this._tracks = new Set();
    }
    get isRunning() { return this._running; }
    start() {
        if (this._running) return;
        this._running = true;
        this._switchTrack();
    }
    setMood(mood) {
        if (!(mood in LEVELS) || mood === this._mood) return;
        this._mood = mood;
        if (this._running) this._switchTrack();
    }
    async _switchTrack() {
        const generation = ++this._generation;
        const mood = this._mood;
        const buffer = await this.buffers.load(`music-${mood}`);
        if (!buffer || !this._running || generation !== this._generation) return;
        const now = this.ctx.currentTime;
        for (const track of this._tracks) {
            if (track.retiring) continue;
            track.retiring = true;
            track.gain.gain.setTargetAtTime(0, now, 0.6);
            track.source.stop(now + 4);
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.bus);
        const track = { source, gain, retiring: false, mood };
        this._tracks.add(track);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            this._tracks.delete(track);
        };
        source.start();
        gain.gain.setTargetAtTime(LEVELS[mood], now, 0.6);
    }
    stop() {
        this._running = false;
        ++this._generation;
        for (const track of this._tracks) {
            try { track.source.stop(); } catch { /* already ended */ }
            track.source.disconnect();
            track.gain.disconnect();
        }
        this._tracks.clear();
    }
    update() { /* Web Audio schedules playback independently of FPS. */ }
}
