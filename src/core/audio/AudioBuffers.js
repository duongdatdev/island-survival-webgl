// Shared promises deduplicate downloads and decoding across all directors.
export class AudioBuffers {
    constructor(ctx) {
        this.ctx = ctx;
        this._cache = new Map();
        this._disposed = false;
        this._abort = new AbortController();
        this._manifest = null;
    }
    manifest() {
        this._manifest ||= fetch(new URL('assets/audio/manifest.json', document.baseURI), {
            signal: this._abort.signal,
        }).then(response => {
            if (!response.ok) throw new Error(`Audio manifest: HTTP ${response.status}`);
            return response.json();
        });
        return this._manifest;
    }
    async load(id) {
        try {
            if (this._disposed) return null;
            const manifest = await this.manifest();
            if (this._disposed) return null;
            const clip = manifest.clips[id];
            if (!clip) throw new Error(`Unknown audio clip: ${id}`);
            const file = clip.files[Math.floor(Math.random() * clip.files.length)];
            if (!this._cache.has(file.path)) {
                const pending = fetch(new URL(file.path, document.baseURI), { signal: this._abort.signal })
                    .then(response => {
                        if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
                        return response.arrayBuffer();
                    })
                    .then(data => this._disposed ? null : this.ctx.decodeAudioData(data));
                this._cache.set(file.path, pending);
            }
            const buffer = await this._cache.get(file.path);
            return this._disposed ? null : buffer;
        } catch (error) {
            if (!this._disposed) console.warn(`Audio unavailable (${id})`, error);
            return null;
        }
    }
    async preloadSfx() {
        try {
            const manifest = await this.manifest();
            await Promise.all(Object.entries(manifest.clips)
                .filter(([, clip]) => clip.category === 'sfx').map(([id]) => this.load(id)));
        } catch (error) {
            if (!this._disposed) console.warn('Audio preload failed', error);
        }
    }
    clear() {
        this._disposed = true;
        this._abort.abort();
        this._cache.clear();
    }
}
