import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('the ocean route renders its local waves and complete raft through day, dusk, night and storm', async ({ page }) => {
    test.setTimeout(120000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Ocean presentation'); await page.locator('#world-seed-input').fill('ending-integration');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); c.progress.chapter = 6; c.progress.tier = 3; c.progress.completedChapters = new Set([1, 2, 3, 4, 5]);
        c.progress.questItems.add('island_coordinates');
        for (const [id, count] of Object.entries({ raft_frame: 1, barrel_floats: 1, paddle: 1, raft_sail: 1, raft_motor: 1,
            compass: 1, fresh_water: 6, smoked_meal: 3, repair_kit: 3 })) {
            if (!s.inventory.addItem(id, count)) throw new Error('presentation supplies do not fit');
        }
        c.ui.open('raft');
    });
    for (const id of ['raft_frame', 'barrel_floats', 'paddle', 'raft_sail', 'raft_motor']) await page.locator(`[data-action="install-raft"][data-arg="${id}"]`).click();
    await page.locator('[data-action="start-ending"][data-arg="raft"]').click(); await expect(page.locator('#ending-radar')).toBeVisible();
    for (const [label, along, time, storm] of [['launch', 0, 0.75, false], ['day', 400, 0.45, false],
        ['dusk', 400, 0.75, false], ['night', 400, 0.98, false], ['storm-night', 400, 0.98, true]]) {
        const frame = await page.evaluate(({ along, time, storm }) => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, ending = s.campaign.ending;
            s.isPaused = true; s.dayNight.isPaused = true; s.dayNight.timeOfDay = time;
            Object.assign(ending.state, { along, across: 0, heading: 0, storm });
            s.weather.forceWeather(storm ? 'storm' : 'cloudy'); ending.lastWeather = storm ? 'storm' : 'cloudy'; ending.update(0);
            return { error: s.gl.getError(), indices: ending.oceanWater.mesh.indexCount, size: ending.oceanWater.size,
                position: [...s.player.position], camera: [...s.camera.position] };
        }, { along, time, storm });
        expect(frame.error).toBe(0); expect(frame.indices).toBe(176 ** 2 * 6); expect(frame.size).toBe(176);
        expect(frame.position.every(Number.isFinite)).toBe(true); expect(frame.camera.every(Number.isFinite)).toBe(true);
        await page.screenshot({ path: `.cache/browser-results/ocean-${label}.png` });
    }
    const sample = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, ending = s.campaign.ending;
        s.engine.settings.applyQualityPreset('medium'); s.isPaused = false; ending.state.elapsed = 45;
        const frames = [], start = performance.now(), playStart = s.campaign.playSeconds;
        let previous;
        await new Promise(resolve => {
            const frame = now => {
                if (previous !== undefined) frames.push(now - previous); previous = now;
                if (now - start >= 5000) resolve(); else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });
        const elapsed = performance.now() - start, sorted = [...frames].sort((a, b) => a - b);
        const extension = s.gl.getExtension('WEBGL_debug_renderer_info');
        return { scope: 'Five-second active ocean renderer at night/storm near 400 m, medium preset, fixed day-night time. Not a full stress or human-duration gate.',
            buildMode: 'Vite development server used by Playwright webServer',
            recordedAt: new Date().toISOString(), renderer: extension ? s.gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : s.gl.getParameter(s.gl.RENDERER),
            userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], renderSize: [s.gl.canvas.width, s.gl.canvas.height],
            frames: frames.length, elapsedMs: elapsed, fps: frames.length * 1000 / frames.reduce((sum, dt) => sum + dt, 0),
            p95Ms: sorted[Math.floor(sorted.length * 0.95)], p99Ms: sorted[Math.floor(sorted.length * 0.99)],
            livePlaySeconds: s.campaign.playSeconds - playStart, paused: s.isPaused || document.hidden,
            status: ending.state.status, storm: ending.state.storm, glError: s.gl.getError() };
    });
    expect(sample.paused).toBe(false); expect(sample.status).toBe('active'); expect(sample.storm).toBe(true);
    expect(sample.livePlaySeconds).toBeGreaterThan(4); expect(sample.glError).toBe(0);
    await mkdir('.cache/performance', { recursive: true });
    await writeFile('.cache/performance/ocean-render-sample.json', JSON.stringify(sample, null, 2));
    await page.screenshot({ path: '.cache/browser-results/ocean-storm-active.png' });
    expect(errors).toEqual([]);
});
