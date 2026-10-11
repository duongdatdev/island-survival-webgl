import { test, expect } from '@playwright/test';

test('downloaded library decodes and produces audible PCM in the browser', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(async () => {
        const manifest = await (await fetch('assets/audio/manifest.json')).json();
        const context = new AudioContext();
        const results = [];
        for (const clip of Object.values(manifest.clips)) {
            for (const file of clip.files) {
                const response = await fetch(file.path);
                if (!response.ok) throw new Error(`${file.path}: ${response.status}`);
                const buffer = await context.decodeAudioData(await response.arrayBuffer());
                let energy = 0;
                const data = buffer.getChannelData(0);
                for (let i = 0; i < data.length; i += 32) energy += data[i] ** 2;
                results.push({ path: file.path, duration: buffer.duration, energy });
            }
        }
        await context.close();
        return results;
    });
    expect(results.length).toBe(70);
    for (const file of results) {
        expect(file.duration, file.path).toBeGreaterThan(0.01);
        expect(file.energy, file.path).toBeGreaterThan(0.001);
    }
});

test('live game plays samples, crossfades moods, applies settings and cleans up', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'warning' && /Audio unavailable|Audio preload/.test(message.text())) errors.push(message.text());
    });
    await page.goto('/');
    await expect(page.locator('#menu-play-btn')).toBeVisible();
    await page.locator('#menu-play-btn').click();
    await page.evaluate(async () => {
        const audio = window.__GAME_ENGINE__.audio;
        audio._ensureContext();
        await audio.buffers.preloadSfx();
        audio.setMuted(false);
        audio.startMusic();
        audio.startAmbientWaves();
        audio.startWind();
        audio.startRain();
        audio.addEmitter('test-fire', 'campfire', [2, 0, 0]);
        audio.setListener([0, 1, 0], [0, 1, -1]);
        // Any attempt to synthesize audio now fails the test.
        audio.ctx.createOscillator = () => { throw new Error('Unexpected synthesized audio'); };
        await audio.playMine([1, 0, 0]);
    });
    await page.waitForFunction(() => {
        const a = window.__GAME_ENGINE__.audio;
        return a.music._tracks.size > 0 && [...a.ambience._layers.values()].every(x => x.source)
            && a.ambience._emitters.get('test-fire')?.source;
    });
    await page.evaluate(async () => {
        const a = window.__GAME_ENGINE__.audio;
        window.__audioAnalyser = a.ctx.createAnalyser();
        a.masterGain.connect(window.__audioAnalyser);
        await a.playThunder();
    });
    await page.waitForFunction(() => {
        const data = new Float32Array(window.__audioAnalyser.fftSize);
        window.__audioAnalyser.getFloatTimeDomainData(data);
        return data.some(value => Math.abs(value) > 0.001);
    });
    await page.evaluate(() => {
        window.__GAME_ENGINE__.audio.masterGain.disconnect(window.__audioAnalyser);
        window.__audioAnalyser.disconnect();
    });
    await page.evaluate(() => window.__GAME_ENGINE__.audio.setMusicMood('danger'));
    await page.waitForFunction(() => [...window.__GAME_ENGINE__.audio.music._tracks]
        .some(track => track.mood === 'danger' && !track.retiring));
    await page.evaluate(() => window.__GAME_ENGINE__.audio.setMusicMood('night'));
    await page.waitForFunction(() => [...window.__GAME_ENGINE__.audio.music._tracks]
        .some(track => track.mood === 'night' && !track.retiring));
    await page.evaluate(() => {
        const engine = window.__GAME_ENGINE__;
        engine.settings.set('musicVolume', 0.17);
        engine.audio.setDucked(true);
        engine.audio.setRainIntensity(0.7);
        engine.audio.setTimeOfDay(0.9);
        engine.audio.update(0.1);
    });
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.audio.musicBus.gain.value)).toBeCloseTo(0.17, 2);
    await page.evaluate(() => window.__GAME_ENGINE__.settings.set('muted', true));
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.audio.masterGain.gain.value)).toBeLessThan(0.01);
    const stopped = await page.evaluate(() => {
        const a = window.__GAME_ENGINE__.audio;
        a.stopMusic();
        a.stopAmbientWaves(); a.stopRain(); a.stopWind(); a.removeEmitter('test-fire');
        return [a.music._tracks.size, a.ambience._layers.size, a.ambience._emitters.size];
    });
    expect(stopped).toEqual([0, 0, 0]);
    expect(errors).toEqual([]);
});

test('stopping while audio loads prevents delayed playback', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
        const { MusicDirector } = await import('/src/core/audio/MusicDirector.js');
        const { AmbienceDirector } = await import('/src/core/audio/AmbienceDirector.js');
        const ctx = new AudioContext();
        let resolve;
        const pending = new Promise(r => { resolve = r; });
        const buffers = { load: () => pending };
        const music = new MusicDirector(ctx, ctx.destination, buffers);
        const ambience = new AmbienceDirector(ctx, buffers, ctx.destination);
        let starts = 0;
        const create = ctx.createBufferSource.bind(ctx);
        ctx.createBufferSource = () => { starts++; return create(); };
        music.start(); ambience.startWaves();
        ambience.addEmitter('fire', 'campfire', [0, 0, 0]);
        music.stop(); ambience.stopAll();
        resolve(ctx.createBuffer(1, 44100, 44100));
        await pending;
        await Promise.resolve();
        await ctx.close();
        return starts;
    });
    expect(result).toBe(0);
});
