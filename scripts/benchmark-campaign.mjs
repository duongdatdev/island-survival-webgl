import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Native GPU baseline. Functional browser tests deliberately use SwiftShader instead.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
const visualOnly = process.env.BENCHMARK_VISUAL_ONLY === '1';
try {
    await page.goto(process.env.BENCHMARK_URL || 'http://127.0.0.1:4173');
    await page.locator('#main-menu').waitFor({ timeout: 45000 }); await page.locator('#menu-play-btn').click();
    await page.locator('#world-create-btn').click(); await page.locator('#world-name-input').fill('GPU baseline');
    await page.locator('#world-seed-input').fill('performance-baseline'); await page.locator('#world-form button[type="submit"]').click();
    await page.locator('#world-play-btn').click(); await page.locator('.campaign-toolbar').waitFor({ timeout: 45000 });
    const renderer = await page.evaluate(() => {
        const gl = window.__GAME_ENGINE__.gl, extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), browser: navigator.userAgent };
    });
    const results = [];
    await mkdir('.cache/performance', { recursive: true });
    for (const quality of visualOnly ? ['medium'] : ['medium', 'low']) for (const location of visualOnly ? ['weather_station'] : ['wreck_beach', 'abandoned_camp', 'weather_station', 'signal_tower']) {
        await page.evaluate(({ quality, location }) => {
            const engine = window.__GAME_ENGINE__, scene = engine.scenes.activeScene, poi = scene.world.pois.find(p => p.id === location);
            engine.settings.applyQualityPreset(quality); scene.tutorial.skip(); engine.input.setPointerLockEnabled(false);
            scene.campaign.respawnProtection = 3600;
            scene.player.position.set([poi.position[0] + 15, scene.terrain.getHeight(poi.position[0] + 15, poi.position[2]) + 0.9, poi.position[2]]);
            scene.player.rotation[1] = -Math.PI / 2; scene.camera._yaw = scene.camera._smoothYaw = -Math.PI / 2; scene.camera._firstUpdate = true;
        }, { quality, location });
        await page.waitForTimeout(1500);
        const frames = await page.evaluate(duration => new Promise(resolve => {
            const durations = [], begin = performance.now(); let previous;
            const frame = now => { if (previous) durations.push(now - previous); previous = now;
                if (now - begin < duration) requestAnimationFrame(frame); else resolve(durations); };
            requestAnimationFrame(frame);
        }), visualOnly ? 1000 : 10000);
        const sorted = [...frames].sort((a, b) => a - b), mean = frames.reduce((a, b) => a + b, 0) / frames.length;
        const result = { quality, location, frames: frames.length, averageFPS: Number((1000 / mean).toFixed(2)),
            p95ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)), p99ms: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)) };
        result.state = await page.evaluate(location => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, p = s.world.pois.find(p => p.id === location);
            return { paused: s.isPaused, deaths: s.campaign.deaths, distanceFromPOI: Math.hypot(s.player.position[0] - p.position[0], s.player.position[2] - p.position[2]),
                renderSize: [s.engine.canvas.width, s.engine.canvas.height], viewDistance: s.engine.settings.get('viewDistance') };
        }, location);
        if (result.state.paused || result.state.deaths || result.state.distanceFromPOI > 30) throw new Error('Benchmark pose changed during measurement');
        if (location === 'weather_station' && quality === 'medium') await page.screenshot({ path: '.cache/performance/native-station.png' });
        results.push(result); console.log(JSON.stringify(result));
    }
    await mkdir('.cache/performance', { recursive: true });
    const glError = await page.evaluate(() => window.__GAME_ENGINE__.gl.getError());
    const report = { recordedAt: new Date().toISOString(), viewport: [1280, 800], seed: 'performance-baseline', renderer, results, errors, glError,
        scope: visualOnly ? 'One-second native rendering visual check.' : 'Ten seconds at each POI/quality after settling. Initial campaign only; not a maximum-construction or 90-minute retention acceptance.' };
    const reportPath = `.cache/performance/campaign-native-${visualOnly ? 'visual' : 'baseline'}.json`;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ renderer: renderer.renderer, errors, glError, report: reportPath }));
} finally { await context.close(); await browser.close(); }
