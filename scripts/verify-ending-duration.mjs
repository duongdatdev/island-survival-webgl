import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { oceanLane } from '../src/systems/EndingChallenge.js';

// Real-time production runs. The controller observes state, but only keyboard events steer challenges.
const runId = new Date().toISOString().replace(/[:.]/g, '-'), directory = resolve('.cache/performance');
const buildDirectory = resolve(directory, 'ending-duration-build-' + runId), reportPath = resolve(directory, 'ending-duration-' + runId + '.json');
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), buildDirectory, { recursive: true });
const html = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
const report = { status: 'starting', pid: process.pid, startedAt: new Date().toISOString(), buildDirectory,
    buildSHA256: createHash('sha256').update(html).digest('hex'), viewport: [1280, 800],
    scope: 'Both ending challenges in one production world, in real wall time using normal keyboard input and an observing automated controller. Preparation supplies/chapter/coordinates are fixtures. No challenge state edits, time acceleration, direct challenge.update calls, route skipping or damage protection during either challenge. This is not a human skill/duration or whole-campaign playtest.',
    errors: [], routes: [] };
const flush = () => writeFile(reportPath, JSON.stringify(report, null, 2)); await flush();
let browser, server;
try {
    server = await preview({ configFile: false, root: process.cwd(), build: { outDir: buildDirectory },
        preview: { host: '127.0.0.1', port: 4177, strictPort: true, open: false } });
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]); await page.locator('#main-menu').waitFor();
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Real ending duration'); await page.locator('#world-seed-input').fill('real-ending-duration');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await page.locator('.campaign-toolbar').waitFor();
    report.fixture = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.engine.settings.applyQualityPreset('medium');
        s.dayNight.timeOfDay = .45; c.progress.chapter = 6; c.progress.tier = 3; c.progress.completedChapters = new Set([1, 2, 3, 4, 5]);
        c.progress.questItems.add('island_coordinates');
        for (const [id, count] of Object.entries({ wood: 40, rope: 5, raft_frame: 1, barrel_floats: 1, paddle: 1, raft_sail: 1, raft_motor: 1,
            compass: 1, fresh_water: 12, smoked_meal: 6, repair_kit: 6, radio: 1, battery: 2, copper_wire: 6, iron_ingot: 3 })) {
            if (!s.inventory.addItem(id, count)) throw new Error('Preparation fixture full: ' + id);
        }
        let chest;
        for (let i = 0; i < 32; i++) {
            const angle = i * Math.PI / 16, result = c.registry.place('chest', [s.player.position[0] + Math.sin(angle) * 4, 0, s.player.position[2] + Math.cos(angle) * 4], 0, s.inventory);
            if (result.ok) { chest = result.structure; break; }
        }
        if (!chest || !chest.container.addItem('stone', 17)) throw new Error('No chest fixture site');
        const extension = s.gl.getExtension('WEBGL_debug_renderer_info'); c.ui.open('raft');
        return { worldId: s.activeWorldId, chestId: chest.id, renderer: extension ? s.gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : s.gl.getParameter(s.gl.RENDERER), userAgent: navigator.userAgent };
    });
    for (const id of ['raft_frame', 'barrel_floats', 'paddle', 'raft_sail', 'raft_motor']) await page.locator(`[data-action="install-raft"][data-arg="${id}"]`).click();
    const held = new Set();
    const setKey = async (key, down) => {
        if (down && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
        else if (!down && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
    };
    const release = async () => { for (const key of [...held]) await setKey(key, false); };
    const read = () => page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { ...s.campaign.ending.state, playSeconds: s.campaign.playSeconds,
            paused: s.isPaused || s.engine.isPaused || document.hidden, glError: s.gl.getError() };
    });
    for (const route of ['raft', 'rescue']) {
        if (route === 'rescue') {
            await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('rescue'));
            await page.locator('[data-action="repair-tower"]').click();
        }
        await page.locator(`[data-action="start-ending"][data-arg="${route}"]`).click();
        await page.locator(route === 'raft' ? '#ending-radar' : '#ending-tuning').waitFor();
        await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state?.status === 'active' && !window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.busy);
        const initial = await read(), start = performance.now(), measurement = { route, startedAt: new Date().toISOString(), initial, samples: [], commands: { steeringChanges: 0, repair: 0, refuel: 0 } };
        report.routes.push(measurement); report.status = 'running-' + route; await flush();
        let sampled = -1, lastRepair = -Infinity, lastRefuel = -Infinity, state;
        while (performance.now() - start < 780000) {
            state = await read();
            const wallSeconds = (performance.now() - start) / 1000;
            if (state.status !== 'active') break;
            if (state.paused || state.glError || report.errors.length) throw new Error('Challenge stopped being live: ' + JSON.stringify(state));
            let turn;
            if (route === 'raft') {
                // Follow an outer navigable lane; rocks occupy the central +/-9 m band.
                const desired = Math.max(-.8, Math.min(.8, Math.atan2(oceanLane(state.along + 20) + 18 - state.across, 20)));
                turn = desired - state.heading;
                await setKey('w', true);
                if (state.hull < 80 && state.repairs > 0 && wallSeconds - lastRepair > 2) {
                    await page.keyboard.press('r', { delay: 30 }); lastRepair = wallSeconds; measurement.commands.repair++;
                }
            } else {
                turn = state.target - state.tuning;
                await setKey('Space', true);
                if (state.power < 60 && state.fuel >= 2 && wallSeconds - lastRefuel > 2) {
                    await page.keyboard.press('e', { delay: 30 }); lastRefuel = wallSeconds; measurement.commands.refuel++;
                }
                if (state.nextStrike - state.elapsed < 2 && state.repairs > 0 && state.protection <= 0 && wallSeconds - lastRepair > 2) {
                    await page.keyboard.press('r', { delay: 30 }); lastRepair = wallSeconds; measurement.commands.repair++;
                }
            }
            const deadband = route === 'raft' ? .04 : .5, previous = [...held].filter(key => key === 'a' || key === 'd').join();
            await setKey('a', turn < -deadband); await setKey('d', turn > deadband);
            if (previous !== [...held].filter(key => key === 'a' || key === 'd').join()) measurement.commands.steeringChanges++;
            const segment = Math.floor(wallSeconds / 20);
            if (segment !== sampled) {
                sampled = segment; measurement.samples.push({ wallSeconds, ...state }); await flush();
                console.log(JSON.stringify({ route, wallSeconds: Math.round(wallSeconds), elapsed: state.elapsed, along: state.along, hull: state.hull, signal: state.signal, power: state.power }));
            }
            await page.waitForTimeout(100);
        }
        await release(); measurement.wallSeconds = (performance.now() - start) / 1000; measurement.final = await read();
        measurement.livePlaySeconds = measurement.final.playSeconds - initial.playSeconds;
        measurement.meetsDuration = measurement.final.elapsed >= 480 && measurement.final.elapsed <= 720 && measurement.wallSeconds >= 475
            && measurement.livePlaySeconds >= measurement.wallSeconds * .95;
        await flush();
        if (measurement.final.status !== 'completed' || !measurement.meetsDuration) throw new Error('Ending did not complete in its real-time duration window: ' + JSON.stringify(measurement));
        await page.locator('[data-action="return-base"]').waitFor(); await page.screenshot({ path: resolve(directory, `ending-duration-${runId}-${route}.png`) });
        await page.locator('[data-action="return-base"]').click();
        // State clears before the awaited IDB commit; wait for the entire return transaction.
        await page.waitForFunction(() => {
            const ending = window.__GAME_ENGINE__.scenes.activeScene.campaign.ending;
            return !ending.state && !ending.busy && !ending.pendingRoute;
        });
        await page.locator('#campaign-panel').waitFor({ state: 'hidden' });
        measurement.returned = await page.evaluate(async fixture => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, world = await s.engine.worldRepository.getWorld(s.activeWorldId);
            return { worldId: s.activeWorldId, chestStone: s.campaign.registry.structures.get(fixture.chestId)?.container.getCount('stone'), completedRoutes: world.completedRoutes };
        }, report.fixture);
        if (measurement.returned.worldId !== report.fixture.worldId || measurement.returned.chestStone !== 17 || !measurement.returned.completedRoutes.includes(route)) throw new Error('Postgame base/route preservation failed');
        await flush();
    }
    report.status = 'measured';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
finally {
    report.finishedAt = new Date().toISOString(); await flush(); console.log(JSON.stringify({ status: report.status, report: reportPath, failure: report.failure }));
    await browser?.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
