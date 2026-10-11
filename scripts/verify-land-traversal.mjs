import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
if (process.argv.slice(2).some(argument => argument !== '--dive')) throw new Error('Usage: node scripts/verify-land-traversal.mjs [--dive]');
const dive = process.argv.includes('--dive'), expectedPois = dive ? 8 : 7;
const directory = resolve('.cache/performance'), buildDirectory = resolve(directory, 'traversal-build-' + runId);
const reportPath = resolve(directory, (dive ? 'island-traversal-' : 'land-traversal-') + runId + '.json');
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), buildDirectory, { recursive: true });
const html = await readFile(resolve(buildDirectory, 'index.html'), 'utf8');
const report = { status: 'starting', pid: process.pid, startedAt: new Date().toISOString(), buildDirectory,
    buildSHA256: createHash('sha256').update(html).digest('hex'), seed: 'land-expedition-path', errors: [], legs: [],
    scope: 'One seeded production world, real W walking from natural spawn along reserved trails and around POI exteriors. Synthetic camera steering only; no player position, velocity, time, discovery or chapter writes. Contact protection and replenished vitals isolate traversability. ' + (dive
        ? 'Dive kit supplied. After seven land POIs, collision-planned surface transit and real Ctrl descent reach the submerged wreck manifest; actual E reading and eight discoveries must survive reload. Not human navigation/balance, all interiors or 100-seed native acceptance.'
        : 'Seven land POIs; not interior exploration, underwater traversal, human navigation, balance or 100-seed runtime acceptance.') };
const flush = () => writeFile(reportPath, JSON.stringify(report, null, 2));
await flush(); console.log(JSON.stringify({ report: reportPath, pid: process.pid }));
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: buildDirectory },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true, open: false } });
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]); await page.locator('#main-menu').waitFor();
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Continuous land expedition'); await page.locator('#world-seed-input').fill(report.seed);
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await page.locator('.campaign-toolbar').waitFor();
    const waypoints = await page.evaluate(dive => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 3600;
        if (dive && !s.inventory.addItem('dive_kit', 1)) throw new Error('Cannot supply traversal dive kit');
        const ids = ['wreck_beach', 'waterfall', 'abandoned_camp', 'mine', 'weather_station', 'signal_tower', 'coastal_depot'];
        const pois = ids.map(id => s.world.pois.find(p => p.id === id)), points = [];
        for (let i = 1; i < pois.length; i++) {
            const p = pois[i], prior = pois[i - 1], next = pois[i + 1], radius = p.radius + 1;
            const incoming = Math.atan2(prior.position[2] - p.position[2], prior.position[0] - p.position[0]);
            const at = angle => [p.position[0] + radius * Math.cos(angle), p.position[2] + radius * Math.sin(angle)];
            points.push({ poi: p.id, point: at(incoming), visit: true });
            if (!next) continue;
            const outgoing = Math.atan2(next.position[2] - p.position[2], next.position[0] - p.position[0]);
            const turn = Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
            const steps = Math.ceil(Math.abs(turn) / (Math.PI / 12));
            for (let step = 1; step <= steps; step++) points.push({ poi: p.id, point: at(incoming + turn * step / steps), visit: false });
        }
        return points;
    }, dive);
    report.waypoints = waypoints; report.status = 'walking'; await flush();
    const follow = async points => {
        await page.keyboard.down('w');
        try {
        for (const waypoint of points) {
            const leg = await page.evaluate(async waypoint => {
                const s = window.__GAME_ENGINE__.scenes.activeScene, begin = performance.now(), play = s.campaign.playSeconds;
                const initial = Array.from(s.player.position), samples = []; let lastSample = begin, lastProgress = begin, walked = 0;
                let prior = initial, anchor = initial;
                await new Promise((resolve, reject) => {
                    const frame = now => {
                        const p = Array.from(s.player.position), dx = waypoint.point[0] - p[0], dz = waypoint.point[1] - p[2];
                        walked += Math.hypot(p[0] - prior[0], p[2] - prior[2]); prior = p;
                        if (Math.hypot(dx, dz) < .8) { resolve(); return; }
                        if (s.isPaused || s.engine.isPaused || document.hidden || s.campaign.deaths) { reject(new Error('Traversal stopped or respawned')); return; }
                        const yaw = Math.atan2(dx, dz); s.camera.setLookAngles(yaw, -.12);
                        if (now - lastSample > 1000) {
                            samples.push({ seconds: (now - begin) / 1000, position: p }); lastSample = now;
                            s.vitals.eat(100); s.vitals.drink(100); s.vitals.heal(100);
                        }
                        if (Math.hypot(p[0] - anchor[0], p[2] - anchor[2]) > .3) { anchor = p; lastProgress = now; }
                        if (now - lastProgress > 5000 || now - begin > 180000) { reject(new Error('Blocked walking to ' + JSON.stringify(waypoint) + ' at ' + JSON.stringify(p))); return; }
                        requestAnimationFrame(frame);
                    };
                    requestAnimationFrame(frame);
                });
                return { ...waypoint, wallSeconds: (performance.now() - begin) / 1000, playSeconds: s.campaign.playSeconds - play,
                    walked, initial, final: Array.from(s.player.position), samples, visited: !!s.campaign.progress.facts['poiVisited:' + waypoint.poi] };
            }, waypoint);
            report.legs.push(leg); await flush();
            if (waypoint.visit) {
                if (!leg.visited) throw new Error('Arrival did not discover ' + waypoint.poi);
                console.log(JSON.stringify({ reached: waypoint.poi, distance: report.legs.reduce((n, l) => n + l.walked, 0) }));
            }
        }
        } finally { await page.keyboard.up('w'); }
    };
    await follow(waypoints);
    if (dive) {
        report.status = 'planning-shore-transit'; await flush();
        const plan = await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, note = c.journals.wreck_manifest.position;
            const radius = s.player.collider.radius, height = s.player.collider.height, rivals = c.landmarks.salvageNodes;
            const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
            let target;
            for (const rise of [.6, .7]) {
                for (let r = .4; r <= 2; r += .2) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
                    const p = [note[0] + Math.cos(angle) * r, note[1] + rise, note[2] + Math.sin(angle) * r];
                    if (distance(p, note) >= 2.3 || rivals.some(other => distance(p, other.position) <= distance(p, note) + .1)
                        || c.collision.segmentBlocked(p, note, { ignoreInstances: new Set(['note-wreck_manifest']) })) continue;
                    let clear = true;
                    for (let y = p[1]; y <= -.2; y += .1) if (!c.collision.capsuleClear([p[0], y, p[2]], radius, height)) { clear = false; break; }
                    if (clear) { target = p; break; }
                }
                if (target) break;
            }
            if (!target) throw new Error('No clear surface-to-manifest dive column');
            const start = [s.player.position[0], s.player.position[2]], end = [target[0], target[2]], step = 1;
            const minX = Math.floor(Math.min(start[0], end[0]) - 24), minZ = Math.floor(Math.min(start[1], end[1]) - 24);
            const width = Math.ceil(Math.abs(start[0] - end[0]) + 49), depth = Math.ceil(Math.abs(start[1] - end[1]) + 49);
            const key = (x, z) => z * width + x, coordinates = id => [minX + id % width, minZ + Math.floor(id / width)];
            const grid = p => key(Math.round(p[0] - minX), Math.round(p[1] - minZ));
            const from = grid(start), to = grid(end), clearCache = new Map();
            const surfaceClear = (x, z) => {
                const ground = s.terrain.getHeight(x, z), y = Math.max(ground + height / 2, -.2), p = [x, y, z];
                if (Math.hypot(x, z) > s.world.terrainGenerator.island.radius + 31
                    || !c.collision.capsuleClear(p, radius + .2, height)) return false;
                return s.collisionSystem._nearby(p, 2, height / 2 + 2).every(({ entity, collider }) =>
                    s.collisionSystem.dynamic.has(entity) || collider.trigger || collider.type === 'none'
                    || Math.abs(entity.position[1] - y) >= height / 2 + (collider.height ? collider.height / 2 : collider.radius || .45)
                    || Math.hypot(entity.position[0] - x, entity.position[2] - z) >= (collider.radius || 0) + radius + .35);
            };
            const clear = id => {
                if (!clearCache.has(id)) clearCache.set(id, surfaceClear(...coordinates(id)));
                return clearCache.get(id);
            };
            const open = new Set([from]), costs = new Map([[from, 0]]), parents = new Map();
            const heuristic = id => { const p = coordinates(id); return Math.hypot(p[0] - end[0], p[1] - end[1]); };
            let found = false;
            while (open.size) {
                let current, best = Infinity;
                for (const id of open) { const score = costs.get(id) + heuristic(id); if (score < best) { best = score; current = id; } }
                if (current === to) { found = true; break; }
                open.delete(current); const x = current % width, z = Math.floor(current / width), a = coordinates(current);
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                    if (x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= depth) continue;
                    const next = key(x + dx, z + dz), b = coordinates(next);
                    if (!clear(next) || !surfaceClear((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
                    const cost = costs.get(current) + Math.hypot(dx, dz) * step;
                    if (cost >= (costs.get(next) ?? Infinity)) continue;
                    costs.set(next, cost); parents.set(next, current); open.add(next);
                }
            }
            if (!found) throw new Error('No collision-clear coast-to-wreck surface path');
            const ids = [to]; while (ids.at(-1) !== from) ids.push(parents.get(ids.at(-1))); ids.reverse();
            const points = ids.slice(1).map(id => coordinates(id));
            points.push(end);
            return { target, start, points, checkedCells: clearCache.size };
        });
        report.swimPlan = plan; report.status = 'swimming'; await flush();
        await follow(plan.points.map(point => ({ poi: 'offshore_wreck', point, visit: false })));
        await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.player.currentSpeed < .02);
        report.descent = { initial: await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene; return { position: Array.from(s.player.position), oxygen: s.campaign.oxygen };
        }) };
        await page.keyboard.down('Control');
        try {
            await page.waitForFunction(target => window.__GAME_ENGINE__.scenes.activeScene.player.position[1] <= target[1] + .05, plan.target, { timeout: 15000 });
        } finally { await page.keyboard.up('Control'); }
        report.descent.final = await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene; return { position: Array.from(s.player.position), oxygen: s.campaign.oxygen,
                wreckVisited: !!s.campaign.progress.facts['poiVisited:offshore_wreck'] };
        });
        if (!report.descent.final.wreckVisited || report.descent.final.oxygen >= report.descent.initial.oxygen) throw new Error('Descent did not discover wreck and use oxygen');
        await page.screenshot({ path: resolve(directory, 'island-traversal-' + runId + '-diving.png') });
        await page.keyboard.press('e', { delay: 100 }); await page.locator('#campaign-panel').waitFor();
        if (!await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.journals.has('wreck_manifest'))) throw new Error('Actual E did not read manifest');
        await page.keyboard.press('Escape'); report.status = 'saving'; await flush();
    }
    report.final = await page.evaluate(async expected => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        const ids = s.world.pois.filter(p => expected === 8 || p.id !== 'offshore_wreck').map(p => p.id);
        const visited = ids.filter(id => s.campaign.progress.facts['poiVisited:' + id]);
        if (visited.length !== expected || !await s.saveController.save(false)) throw new Error('Incomplete route or save failed');
        return { visited, deaths: s.campaign.deaths, manifestRead: s.campaign.progress.journals.has('wreck_manifest'), position: Array.from(s.player.position), glError: s.gl.getError() };
    }, expectedPois);
    await page.reload(); await page.locator('#main-menu').waitFor(); await page.locator('#menu-play-btn').click();
    await page.locator('#world-play-btn').click(); await page.locator('.campaign-toolbar').waitFor();
    report.restored = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { visited: s.world.pois.filter(p => s.campaign.progress.facts['poiVisited:' + p.id]).map(p => p.id), deaths: s.campaign.deaths,
            manifestRead: s.campaign.progress.journals.has('wreck_manifest') };
    });
    if (report.final.glError || report.errors.length || report.restored.visited.length !== expectedPois || report.restored.deaths
        || dive && !report.restored.manifestRead) throw new Error('Traversal errors or lost discoveries');
    await page.keyboard.press('m'); await page.screenshot({ path: resolve(directory, (dive ? 'island-traversal-' : 'land-traversal-') + runId + '.png') });
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
finally {
    report.finishedAt = new Date().toISOString(); await flush(); console.log(JSON.stringify({ report: reportPath, status: report.status, failure: report.failure }));
    await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve));
}
