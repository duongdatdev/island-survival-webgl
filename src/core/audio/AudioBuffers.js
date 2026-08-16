export class AudioBuffers {
    constructor(ctx) {
        this.ctx = ctx;
        this._cache = new Map();
    }

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

    pick(key, count, duration, fill) {
        const list = this.variants(key, count, duration, fill);
        return list[(Math.random() * list.length) | 0];
    }

    one(key, duration, fill) {
        return this.variants(key, 1, duration, fill)[0];
    }

    clear() {
        this._cache.clear();
    }
}

export function crossfadeLoop(data, fadeSamples) {
    const n = data.length;
    const fade = Math.min(fadeSamples, Math.floor(n / 2));
    if (fade <= 0) return;
    for (let i = 0; i < fade; i++) {
        const g = i / fade;
        data[i] = data[i] * g + data[n - fade + i] * (1 - g);
    }
}

export function fillNoiseBurst(data, curve = 2.5, level = 1.0) {
    const n = data.length;
    for (let i = 0; i < n; i++) {
        const t = i / n;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, curve) * level;
    }
}

export function fillBrownNoise(data, step = 0.02, level = 2.2) {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + step * white) / (1 + step);
        data[i] = last * level;
    }
}

export function rand(min, max) {
    return min + Math.random() * (max - min);
}

export function randomDetune(cents = 50) {
    return rand(-cents, cents);
}
