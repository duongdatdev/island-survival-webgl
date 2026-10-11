import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Diagnostic observation window, not a relaxed acceptance-test timeout.
const id = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('.cache/performance'), build = resolve(directory, `loading-build-${id}`);
await mkdir(directory, { recursive: true }); await cp(resolve('dist'), build, { recursive: true });
const reportPath = resolve(directory, `loading-${id}.json`);
const report = { pid: process.pid, status: 'starting', startedAt: new Date().toISOString(),
    build: (await readFile(resolve(build, 'index.html'), 'utf8')).match(/index-[^" ]+\.js/)?.[0],
    scope: 'Three native Chrome production reloads. Fetch/body and GL call durations are instrumented; 60 s is a diagnostic observation window, not acceptance. No gameplay state is edited.', boots: [] };
const flush = () => writeFile(reportPath, JSON.stringify(report, null, 2)); await flush();
let browser, server;
try {
    server = await preview({ configFile: false, build: { outDir: build }, preview: { host: '127.0.0.1', port: 4178, strictPort: true, open: false } });
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
        const stats = window.__loadDiagnostics = { started: performance.now(), fetch: [], bodies: [], gl: {} };
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const start = performance.now(), entry = { url: String(args[0]?.url || args[0]), start };
            stats.fetch.push(entry);
            try { const result = await originalFetch.apply(this, args); entry.status = result.status; return result; }
            catch (error) { entry.error = error.message; throw error; }
            finally { entry.headersMs = performance.now() - start; }
        };
        for (const method of ['text', 'json', 'arrayBuffer']) {
            const original = Response.prototype[method];
            Response.prototype[method] = async function (...args) {
                const start = performance.now();
                try { return await original.apply(this, args); }
                finally { stats.bodies.push({ url: this.url, method, start, ms: performance.now() - start }); }
            };
        }
        for (const method of ['bufferData', 'createBuffer', 'createTexture', 'texImage2D', 'compileShader', 'linkProgram']) {
            const original = WebGL2RenderingContext.prototype[method];
            WebGL2RenderingContext.prototype[method] = function (...args) {
                const start = performance.now();
                try { return original.apply(this, args); }
                finally {
                    const elapsed = performance.now() - start, entry = stats.gl[method] ||= { count: 0, totalMs: 0, maxMs: 0 };
                    entry.count++; entry.totalMs += elapsed; entry.maxMs = Math.max(entry.maxMs, elapsed);
                }
            };
        }
    });
    let current;
    page.on('console', message => { if (current) current.console.push({ ms: performance.now() - current.start, type: message.type(), text: message.text() }); });
    page.on('pageerror', error => { if (current) current.errors.push(error.message); });
    for (let index = 0; index < 3; index++) {
        current = { index, start: performance.now(), console: [], errors: [], menuReady: false }; report.boots.push(current);
        report.status = 'observing'; await flush();
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
        try { await page.locator('#main-menu:not(.hidden)').waitFor({ timeout: 60000 }); current.menuReady = true; }
        catch (error) { current.observationError = error.message; }
        current.wallMs = performance.now() - current.start;
        current.diagnostics = await page.evaluate(() => ({ ...window.__loadDiagnostics,
            scene: window.__GAME_ENGINE__?.scenes.activeScene?.name,
            loaded: window.__GAME_ENGINE__?.assets.loadedAssets, total: window.__GAME_ENGINE__?.assets.totalAssets,
            pendingModels: Object.keys(window.__GAME_ENGINE__?.assets.modelPromises || {}) }));
        await flush(); console.log(JSON.stringify({ index, wallMs: current.wallMs, menuReady: current.menuReady, gl: current.diagnostics.gl }));
    }
    report.status = report.boots.every(boot => boot.menuReady && !boot.errors.length) ? 'observed' : 'loading-failure';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; }
finally {
    report.finishedAt = new Date().toISOString(); await flush(); console.log(JSON.stringify({ report: reportPath, status: report.status }));
    await browser?.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
