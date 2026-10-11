import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cpus, totalmem, platform, release } from 'node:os';
import { STRUCTURE_DEFINITIONS, CAMPAIGN_RECIPES } from '../src/gameplay/CampaignDatabase.js';

// Supplied, validated maximum-base fixture; measurements use normal production simulation.
const runId = new Date().toISOString().replace(/[:.]/g, '-');
if (process.argv.slice(2).some(argument => argument !== '--pan')) throw new Error('Usage: node scripts/benchmark-large-base.mjs [--pan]');
const pan = process.argv.includes('--pan');
const directory = resolve('.cache/performance'), buildDirectory = resolve(directory, 'large-base-build-' + runId);
const reportPath = resolve(directory, (pan ? 'large-base-pan-' : 'large-base-') + runId + '.json');
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), buildDirectory, { recursive: true });
const html = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
const report = { status: 'starting', startedAt: new Date().toISOString(), pid: process.pid,
    buildDirectory, buildSHA256: createHash('sha256').update(html).digest('hex'), viewport: [1280, 800],
    cameraMotion: pan ? 'Continuous synthetic yaw sweep ±0.25 radians, period 10 seconds; player position stationary. Normal simulation/rendering, no time acceleration.' : 'Stationary',
    scope: `Maximum validated 400 structural/80 functional base, full chests, queued production and watered crops; actual save/reload; ${pan ? 'continuously panning' : 'stationary'} ten-second native GPU samples in two views, two weather states and two presets. Not human duration, interactive construction speed, walking traversal or hardware-wide acceptance. Concurrent browser workloads, if present, are not controlled by this runner.`,
    fixture: 'Materials supplied through inventory APIs. Registry placement rules, terrain, props and protected areas remain enabled. Placement events suppressed only during synchronous setup, then collision rebuilt once; ordinary events, production and autosaves enabled during measurement. Tutorial skipped, contact protected and vitals replenished between samples.',
    hardware: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCores: cpus().length, memoryBytes: totalmem() },
    errors: [], results: [] };
const flush = () => writeFile(reportPath, JSON.stringify(report, null, 2));
await flush();
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: buildDirectory },
    preview: { host: '127.0.0.1', port: 4176, strictPort: true, open: false } });
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]); await page.locator('#main-menu').waitFor();
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Maximum base stress'); await page.locator('#world-seed-input').fill('maximum-base-stress');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await page.locator('.campaign-toolbar').waitFor();
    report.setup = await page.evaluate(({ definitions, recipes }) => {
        const started = performance.now(), s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, r = c.registry;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); c.progress.tier = 3; c.respawnProtection = 3600;
        const supply = ingredients => {
            for (const [id, amount] of Object.entries(ingredients)) {
                const missing = amount - s.inventory.getCount(id);
                if (missing > 0 && !s.inventory.addItem(id, missing)) throw new Error('Fixture inventory full: ' + id);
            }
        };
        const centers = [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]];
        const candidates = centers.map(center => {
            const positions = [];
            for (let dx = -40; dx <= 40; dx += 4) for (let dz = -40; dz <= 40; dz += 4) {
                const position = [center[0] + dx, 0, center[1] + dz];
                if (r.preview('foundation', position).valid) positions.push(position);
            }
            return { center, positions: positions.sort((a, b) => Math.hypot(a[0] - center[0], a[2] - center[1]) - Math.hypot(b[0] - center[0], b[2] - center[1])) };
        }).sort((a, b) => b.positions.length - a.positions.length);
        const site = candidates[0], foundations = []; let structural = 0;
        const place = (type, position, yaw = 0, parentId = null) => {
            if (!r.preview(type, position, yaw, parentId).valid) return null;
            supply(definitions[type].ingredients);
            const result = r.place(type, position, yaw, s.inventory, { parentId });
            if (!result.ok) throw new Error('Validated placement failed: ' + type + ': ' + result.error);
            if (definitions[type].structural) structural++;
            return result.structure;
        };
        const events = r.events; r.events = null;
        try {
            for (const position of site.positions) {
                if (structural >= 400) break;
                const foundation = place('foundation', position); if (!foundation) continue;
                foundations.push(foundation);
                for (const type of ['floor', 'roof', 'wall']) {
                    if (structural >= 400) break;
                    if (type === 'wall') {
                        for (let q = 0; q < 4; q++) if (place(type, position, q * Math.PI / 2, foundation.id)) break;
                    } else place(type, position, 0, foundation.id);
                }
            }
            const kinds = ['campfire', 'smelter', 'smoker', 'planter', 'chest', 'large_chest', 'water_collector', 'large_water_collector', 'workbench', 'repair_bench'];
            let functional = 0;
            for (const foundation of foundations) {
                if (functional === 80) break;
                const type = kinds[functional % kinds.length], record = place(type, foundation.position);
                if (!record) continue;
                functional++;
                if (['chest', 'large_chest'].includes(type)) {
                    const amount = record.container.capacityFor('wood');
                    if (!record.container.addItem('wood', amount)) throw new Error('Chest fill failed');
                }
                if (definitions[type].fire) { supply({ wood: 10 }); if (!c.production.addFuel(record, s.inventory, 'wood', 10)) throw new Error('Fuel failed'); }
                if (type === 'smelter' || type === 'smoker') {
                    const recipe = type === 'smelter' ? 'iron_ingot' : 'smoked_meal';
                    for (let job = 0; job < 5; job++) {
                        supply(recipes[recipe].ingredients);
                        const result = c.production.craft(recipe, s.inventory, record.position);
                        if (!result.ok) throw new Error('Queue failed: ' + result.error);
                    }
                }
                if (type === 'planter') {
                    supply({ carrot_seed: 1, fresh_water: 1 });
                    if (!c.production.plant(record, 'carrot', s.inventory) || !c.production.water(record, s.inventory)) throw new Error('Crop setup failed');
                }
            }
            if (structural !== 400 || functional !== 80) throw new Error(`Base incomplete: ${structural}/${functional}; available foundations ${foundations.length}/${site.positions.length}`);
            const before = JSON.stringify(s.inventory.snapshot()), nextId = r.nextId;
            const overPart = r.place('foundation', [250, 0, 250], 0, s.inventory);
            const overFunctional = r.place('campfire', [250, 0, 250], 0, s.inventory);
            if (overPart.ok || overFunctional.ok || r.nextId !== nextId || JSON.stringify(s.inventory.snapshot()) !== before) throw new Error('Maximum placement mutated state');
            const records = [...r.structures.values()], bounds = { minX: Math.min(...foundations.map(f => f.position[0])), maxX: Math.max(...foundations.map(f => f.position[0])), minZ: Math.min(...foundations.map(f => f.position[2])), maxZ: Math.max(...foundations.map(f => f.position[2])) };
            return { milliseconds: performance.now() - started, structural, functional, bounds, ids: records.map(v => v.id),
                jobs: records.reduce((n, v) => n + v.jobs.length, 0), crops: records.filter(v => v.crop).length,
                filledChests: records.filter(v => ['chest', 'large_chest'].includes(v.type)).map(v => ({ id: v.id, slots: v.container.slots.length, wood: v.container.getCount('wood') })),
                limitErrors: [overPart.error, overFunctional.error], snapshotBytes: JSON.stringify(r.snapshot()).length };
        } finally { r.events = events; c.refreshCollision(); }
    }, { definitions: STRUCTURE_DEFINITIONS, recipes: CAMPAIGN_RECIPES });
    console.log(JSON.stringify({ stage: 'constructed', structural: report.setup.structural, functional: report.setup.functional, jobs: report.setup.jobs, crops: report.setup.crops, fullChests: report.setup.filledChests.length })); await flush();
    // Put the player on dry, clear terrain outside the footprint before saving.
    const pose = await page.evaluate(bounds => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, x = (bounds.minX + bounds.maxX) / 2, z = bounds.minZ - 8;
        for (let offset = 0; offset <= 30; offset += 2) {
            const position = [x, s.terrain.getHeight(x, z - offset) + 0.9, z - offset];
            if (position[1] > 1.1 && s.campaign.collision.capsuleClear(position, 0.28, 1.8)) {
                s.player.position.set(position); s.player.velocity.fill(0); return position;
            }
        }
        throw new Error('No clear saved camera pose');
    }, report.setup.bounds);
    if (!await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))) throw new Error('Maximum base save failed');
    await page.reload(); await page.locator('#main-menu').waitFor(); await page.locator('#menu-play-btn').click();
    await page.locator('#world-play-btn').click(); await page.locator('.campaign-toolbar').waitFor();
    report.restored = await page.evaluate(expected => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, records = [...c.registry.structures.values()];
        if (JSON.stringify(records.map(v => v.id)) !== JSON.stringify(expected.ids)) throw new Error('Reload changed base IDs');
        for (const chest of expected.filledChests) if (c.registry.structures.get(chest.id)?.container.getCount('wood') !== chest.wood) throw new Error('Reload lost chest contents');
        if (records.reduce((n, v) => n + v.jobs.length, 0) !== expected.jobs || records.filter(v => v.crop).length !== expected.crops) throw new Error('Reload lost production');
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); c.respawnProtection = 3600;
        const ext = s.gl.getExtension('WEBGL_debug_renderer_info');
        return { structures: records.length, jobs: expected.jobs, crops: expected.crops, fullChests: expected.filledChests.length,
            renderer: ext ? s.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : s.gl.getParameter(s.gl.RENDERER), userAgent: navigator.userAgent };
    }, report.setup);
    report.status = 'measuring'; await flush();
    for (const quality of ['medium', 'low']) for (const storm of [false, true]) for (const view of ['across-base', 'oblique-base']) {
        await page.evaluate(({ quality, storm, view, pose }) => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.engine.settings.applyQualityPreset(quality); s.weather.forceWeather(storm ? 'storm' : 'clear');
            s.dayNight.timeOfDay = 0.45; s.dayNight.isPaused = true;
            s.vitals.eat(100); s.vitals.drink(100); s.vitals.heal(100);
            s.player.position.set(pose); s.player.velocity.fill(0);
            const yaw = view === 'across-base' ? 0 : Math.PI * 0.15;
            s.camera.setLookAngles(yaw); s.player.rotation[1] = yaw;
        }, { quality, storm, view, pose });
        await page.waitForTimeout(1500);
        const visibleBefore = await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            return [...s.campaign.registry.structures.values()].filter(v => s._isVisible(v.position, 8)).length;
        });
        if (visibleBefore < 100) throw new Error('Camera does not face enough of the maximum base: ' + visibleBefore);
        const result = await page.evaluate(async pan => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, start = performance.now(), play = s.campaign.playSeconds, frames = []; let previous;
            const yaw = s.camera._yaw; let minimumYaw = Infinity, maximumYaw = -Infinity, minimumVisible = Infinity, maximumVisible = 0;
            await new Promise(resolve => {
                const frame = now => { if (previous !== undefined) frames.push(now - previous); previous = now;
                    if (pan) {
                        const angle = yaw + .25 * Math.sin((now - start) * Math.PI / 5000);
                        s.camera.setLookAngles(angle); s.player.rotation[1] = angle;
                    }
                    minimumYaw = Math.min(minimumYaw, s.camera._yaw); maximumYaw = Math.max(maximumYaw, s.camera._yaw);
                    if (frames.length % 30 === 0) {
                        const visible = [...s.campaign.registry.structures.values()].filter(v => s._isVisible(v.position, 8)).length;
                        minimumVisible = Math.min(minimumVisible, visible); maximumVisible = Math.max(maximumVisible, visible);
                    }
                    if (now - start >= 10000) resolve(); else requestAnimationFrame(frame); };
                requestAnimationFrame(frame);
            });
            const wallSeconds = (performance.now() - start) / 1000, sorted = [...frames].sort((a, b) => a - b);
            return { frames: frames.length, wallSeconds, livePlaySeconds: s.campaign.playSeconds - play,
                yawRange: [minimumYaw, maximumYaw], visibleRange: [minimumVisible, maximumVisible],
                averageFPS: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length), p95ms: sorted[Math.floor(sorted.length * .95)], p99ms: sorted[Math.floor(sorted.length * .99)],
                paused: s.isPaused || s.engine.isPaused || document.hidden, deaths: s.campaign.deaths,
                structures: s.campaign.registry.structures.size, weather: s.weather.currentWeather,
                renderSize: [s.engine.canvas.width, s.engine.canvas.height], viewDistance: s.engine.settings.get('viewDistance'), glError: s.gl.getError() };
        }, pan);
        const measurement = { quality, storm, view, visibleBefore, ...result, targetFPS: quality === 'medium' ? 60 : 30 };
        measurement.meetsTarget = result.averageFPS >= measurement.targetFPS;
        report.results.push(measurement); await flush(); console.log(JSON.stringify(measurement));
        if (result.paused || result.deaths || result.structures !== 480 || result.livePlaySeconds < result.wallSeconds * .95 || result.glError || report.errors.length) throw new Error('Invalid live benchmark state');
        if (pan && (result.yawRange[1] - result.yawRange[0] < .49 || result.visibleRange[0] < 100)) throw new Error('Panning did not exercise the visible maximum base');
        if (quality === 'medium' && view === 'across-base') await page.screenshot({ path: resolve(directory, `large-base-${runId}-${storm ? 'storm' : 'clear'}.png`) });
    }
    report.status = report.results.every(v => v.meetsTarget) ? 'measured' : 'needs-optimization';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
finally {
    report.finishedAt = new Date().toISOString(); await flush(); console.log(JSON.stringify({ status: report.status, report: reportPath, failure: report.failure }));
    await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve));
}
