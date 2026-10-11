import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const items = JSON.parse(await readFile('assets/survival-pack/survival-items.json', 'utf8')).items;

test('loading fetches independent models concurrently and cannot announce 100 percent before all models are ready', async ({ page }) => {
    test.setTimeout(90000);
    const requests = new Set(), errors = [], fontWarnings = [];
    let release;
    const held = new Promise(resolve => { release = resolve; });
    page.on('request', request => {
        for (const item of items) if (request.url().endsWith(item.objPath)) requests.add(item.objPath);
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Failed to decode downloaded font|OTS parsing error/.test(message.text())) fontWarnings.push(message.text()); });
    await page.route(`**/${items[0].objPath}`, async route => { await held; await route.continue(); });
    try {
        await page.goto('/');
        await expect.poll(() => requests.size, { timeout: 30000 }).toBe(items.length);
        await page.waitForFunction(() => window.__GAME_ENGINE__?.scenes.activeScene._progress > 0.94);
        await expect(page.locator('#main-menu')).toBeHidden();
        await expect(page.locator('#loader-text')).toContainText('95%');
        expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene._assetsReady)).toBe(false);
    } finally { release(); }
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    const models = await page.evaluate(ids => ids.map(id => !!window.__GAME_ENGINE__.assets.models['survival:' + id]), items.map(item => item.id));
    expect(models.every(Boolean)).toBe(true);
    expect(await page.evaluate(async () => (await document.fonts.load('600 16px Cinzel')).some(face => face.status === 'loaded'))).toBe(true);
    expect(fontWarnings).toEqual([]); expect(errors).toEqual([]);
});
