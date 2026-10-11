import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem, platform, release, arch } from 'node:os';

// Production-build soak. Short runs are explicitly partial and cannot satisfy the 90-minute gate.
const args = new Map(process.argv.slice(2).map((value, i, all) => value.startsWith('--') ? [value.slice(2), all[i + 1]] : null).filter(Boolean));
const minutes = Number(args.get('minutes') ?? 90), swaps = Number(args.get('swaps') ?? 10);
if (!Number.isFinite(minutes) || minutes < 0 || !Number.isSafeInteger(swaps) || swaps < 1) throw new Error('Expected --minutes >= 0 and --swaps >= 1.');
const runId = new Date().toISOString().replace(/[:.]/g, '-'), directory = resolve('.cache/performance');
const buildDirectory = resolve(directory, 'retention-build-' + runId), reportPath = resolve(directory, 'retention-' + runId + '.json');
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), buildDirectory, { recursive: true });
const html = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
const report = { status: 'starting', pid: process.pid, startedAt: new Date().toISOString(), requestedMinutes: minutes, requestedSwaps: swaps,
    buildSHA256: createHash('sha256').update(html).digest('hex'), buildDirectory, viewport: [1280, 800],
    scope: 'Real wall-clock unpaused Campaign renderer/simulation with a safety fixture, autosaves, then alternating worlds through menu controls. This does not test human campaign duration or maximum construction performance.',
    safetyFixture: 'Tutorial skipped, pointer lock disabled, contact/exposure damage temporarily protected and hunger/thirst/health replenished every 30 seconds through vital APIs to isolate resource retention. Normal metabolism, production, weather, AI, event and autosave updates remain enabled. This is not survival balance evidence.',
    hardware: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCores: cpus().length, memoryBytes: totalmem() },
    samples: [], menuSamples: [], errors: [], glCountsAre: 'Explicit creation minus explicit deletion; wrappers are held only in a WeakMap. These counters do not measure GPU bytes or automatic driver reclamation.' };
const flush = async () => writeFile(reportPath, JSON.stringify(report, null, 2));
await flush();
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: buildDirectory },
    preview: { host: '127.0.0.1', port: Number(args.get('port') || 4175), strictPort: true, open: false } });
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => {
        const counts = {}, ids = new WeakMap(); let nextId = 1;
        for (const name of ['Buffer', 'Texture', 'Program', 'Shader', 'VertexArray', 'Framebuffer', 'Renderbuffer']) {
            const proto = WebGL2RenderingContext.prototype, create = proto['create' + name], remove = proto['delete' + name];
            if (!create || !remove) continue;
            counts[name] = { created: 0, deleted: 0, live: 0 };
            proto['create' + name] = function (...args) {
                const value = create.apply(this, args);
                if (value) { ids.set(value, { id: nextId++, deleted: false }); counts[name].created++; counts[name].live++; }
                return value;
            };
            proto['delete' + name] = function (value) {
                const record = value && ids.get(value);
                if (record && !record.deleted) { record.deleted = true; counts[name].deleted++; counts[name].live--; }
                return remove.call(this, value);
            };
        }
        window.__retentionGL = counts;
        window.__retentionContextLosses = 0;
        document.addEventListener('webglcontextlost', () => window.__retentionContextLosses++, true);
    });
    await page.goto(server.resolvedUrls.local[0]); await page.locator('#main-menu').waitFor();
    const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    const sample = async (label, collect = false) => {
        if (collect) await cdp.send('HeapProfiler.collectGarbage');
        const { metrics } = await cdp.send('Performance.getMetrics'), values = Object.fromEntries(metrics.map(m => [m.name, m.value]));
        const state = await page.evaluate(() => {
            const e = window.__GAME_ENGINE__, s = e.scenes.activeScene, c = s.campaign, gl = e.gl;
            return { scene: e.scenes.activeSceneName, worldId: s.activeWorldId || null, playSeconds: c?.playSeconds || 0,
                campaign: !!c, paused: !!s.isPaused || e.isPaused || document.hidden,
                pauseReasons: { scene: !!s.isPaused, engine: !!e.isPaused, hidden: document.hidden },
                deaths: c?.deaths || 0, vitals: s.vitals?.getAll(), protectionSeconds: c?.respawnProtection,
                weather: s.weather?.currentWeather || null,
                glError: gl.getError(), contextLosses: window.__retentionContextLosses, gl: structuredClone(window.__retentionGL),
                position: s.player ? Array.from(s.player.position) : null };
        });
        const value = { label, recordedAt: new Date().toISOString(), heapBytes: values.JSHeapUsedSize, nodes: values.Nodes,
            listeners: values.JSEventListeners, ...state };
        if (state.glError || state.contextLosses || report.errors.length) throw new Error('Renderer/context/page error: ' + JSON.stringify(value));
        return value;
    };
    const menu = async () => {
        await page.keyboard.press('Escape', { delay: 100 }); await page.locator('#pause-menu-btn').click();
        await page.locator('#main-menu').waitFor(); await page.locator('#menu-play-btn').click();
        await page.locator('#world-create-btn').waitFor();
        await page.locator('.world-card').filter({ hasText: 'Retention A' }).waitFor();
        await page.waitForTimeout(250);
    };
    const prepareLive = async () => page.evaluate(duration => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.tutorial.skip();
        s.engine.settings.applyQualityPreset('medium'); s.engine.input.setPointerLockEnabled(false);
        s.campaign.respawnProtection = duration + 3600;
        s.vitals.eat(100); s.vitals.drink(100); s.vitals.heal(100);
    }, minutes * 60);
    const enter = async name => {
        await page.locator('.world-card').filter({ has: page.locator('.world-card-name', { hasText: name }) }).click();
        await page.locator('#world-play-btn').click(); await page.locator('.campaign-toolbar').waitFor();
        await prepareLive();
        await page.waitForTimeout(1000);
    };
    await page.locator('#menu-play-btn').click();
    for (const name of ['Retention A', 'Retention B']) {
        await page.locator('#world-create-btn').click(); await page.locator('#world-name-input').fill(name);
        await page.locator('#world-seed-input').fill(name + '-production');
        await page.locator('#world-form button[type="submit"]').click(); await enter(name); await menu();
    }
    report.renderer = await page.evaluate(() => {
        const gl = window.__GAME_ENGINE__.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), browser: navigator.userAgent };
    });
    report.menuSamples.push(await sample('warmed-menu', true)); await enter('Retention A');
    report.status = 'soaking'; report.soakStartedAt = new Date().toISOString();
    const started = performance.now(), startingPlay = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.playSeconds);
    const locations = ['wreck_beach', 'abandoned_camp', 'weather_station', 'signal_tower', 'mine', 'waterfall', 'coastal_depot'];
    let segment = -1;
    while (performance.now() - started < minutes * 60000) {
        const nextSegment = Math.floor((performance.now() - started) / 180000);
        if (segment !== nextSegment) {
            segment = nextSegment;
            await page.evaluate(({ location, storm }) => {
                const s = window.__GAME_ENGINE__.scenes.activeScene, poi = s.world.pois.find(p => p.id === location), x = poi.position[0] + 15, z = poi.position[2];
                s.player.position.set([x, s.terrain.getHeight(x, z) + 0.9, z]); s.player.velocity.fill(0); s.campaign.swimY = undefined;
                s.camera.setLookAngles(-Math.PI / 2); s.player.rotation[1] = -Math.PI / 2;
                s.weather.forceWeather(storm ? 'storm' : 'clear');
            }, { location: locations[segment % locations.length], storm: segment % 2 === 1 });
        }
        await page.waitForTimeout(Math.min(30000, Math.max(1, minutes * 60000 - (performance.now() - started))));
        const value = await sample('soak-' + report.samples.length);
        report.samples.push(value); report.soakWallSeconds = (performance.now() - started) / 1000;
        report.soakPlaySeconds = value.playSeconds - startingPlay; await flush();
        if (!value.campaign || value.scene !== 'Game' || value.paused || value.deaths) throw new Error('Soak stopped being a live protected Campaign: ' + JSON.stringify(value));
        await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.vitals.eat(100); s.vitals.drink(100); s.vitals.heal(100);
        });
        console.log(JSON.stringify({ stage: 'soaking', seconds: Math.round(report.soakWallSeconds), heapMiB: Math.round(value.heapBytes / 1048576), listeners: value.listeners }));
    }
    report.soakWallSeconds = (performance.now() - started) / 1000;
    report.soakPlaySeconds = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.playSeconds) - startingPlay;
    await menu(); report.menuSamples.push(await sample('after-soak-menu', true));
    report.status = 'switching'; await flush();
    for (let index = 0; index < swaps; index++) {
        const name = index % 2 ? 'Retention A' : 'Retention B'; await enter(name);
        const value = await sample('swap-' + (index + 1)); report.samples.push(value);
        await menu(); report.menuSamples.push(await sample('menu-' + (index + 1), true));
        report.completedSwaps = index + 1; await flush();
        console.log(JSON.stringify({ stage: 'switch', count: index + 1, world: name, heapMiB: Math.round(value.heapBytes / 1048576) }));
    }
    const baseline = report.menuSamples[0], last = report.menuSamples.at(-1);
    report.menuDelta = { listeners: last.listeners - baseline.listeners, nodes: last.nodes - baseline.nodes,
        heapBytes: last.heapBytes - baseline.heapBytes, explicitGL: Object.fromEntries(Object.keys(last.gl).map(key => [key, last.gl[key].live - baseline.gl[key].live])) };
    report.retentionFindings = [];
    const stable = report.menuSamples.slice(1), firstStable = stable[0];
    if (last.listeners > firstStable.listeners) report.retentionFindings.push('Event listeners grow across world swaps.');
    if (last.heapBytes > firstStable.heapBytes + 5 * 1048576) report.retentionFindings.push('Collected menu heap grew by more than 5 MiB; investigate retained scenes.');
    for (const [kind, delta] of Object.entries(report.menuDelta.explicitGL)) if (delta > 0) report.retentionFindings.push(`Explicit ${kind} count grew by ${delta}.`);
    report.meetsDuration = report.soakWallSeconds >= 5400 && report.soakPlaySeconds >= 5400 * 0.95;
    report.status = report.retentionFindings.length ? 'regression' : 'measured';
    if (report.retentionFindings.length) process.exitCode = 1;
    report.finishedAt = new Date().toISOString(); await flush();
    console.log(JSON.stringify({ report: reportPath, status: report.status, meetsDuration: report.meetsDuration, menuDelta: report.menuDelta }));
} catch (error) {
    report.status = 'failed'; report.finishedAt = new Date().toISOString(); report.failure = error.stack; await flush(); throw error;
} finally {
    if (browser) await browser.close(); await new Promise(resolve => server.httpServer.close(resolve));
}
