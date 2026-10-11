import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function menu(page) {
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
}

test('export downloads a full world; importing through the file control creates an isolated playable copy and rejects malformed queues', async ({ page }) => {
    test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await menu(page);
    const originalId = await page.evaluate(async () => {
        const store = window.__GAME_ENGINE__.worldRepository, { worldSnapshot } = await import('/tests/fixtures/world-snapshot.js');
        const { world } = await store.createWorld({ name: 'Backup journey', seed: 'backup-journey' });
        if (!await store.saveWorld(world.id, worldSnapshot(world, 123, 40), { checkpoint: true })) throw new Error('fixture save failed');
        return world.id;
    });
    await menu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('.world-card').filter({ hasText: 'Backup journey' }).getByRole('button', { name: 'Xuất bản sao thế giới' }).click();
    const download = await downloadPromise, json = await readFile(await download.path(), 'utf8'), payload = JSON.parse(json);
    expect(payload.snapshot.campaign.registry.structures[0].slots[0].count).toBe(40); expect(payload.checkpoint.survivalSeconds).toBe(123);
    await page.locator('#world-import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await expect(page.locator('#world-list')).toContainText('Backup journey (2)');
    const worlds = await page.evaluate(async () => window.__GAME_ENGINE__.worldRepository.listWorlds());
    expect(worlds).toHaveLength(2); expect(worlds.some(w => w.id === originalId)).toBe(true);
    const bad = structuredClone(payload); bad.snapshot.campaign.registry.structures[0].jobs = [{ id: 'job-1', ingredients: { wood: 999 } }];
    await page.locator('#world-import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await expect(page.locator('#world-menu-error')).toContainText('không hợp lệ'); expect(await page.locator('.world-card').count()).toBe(2);
    await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return s.activeWorldId !== id && s.campaign.registry.structures.get('structure-1').container.getCount('wood') === 40;
    }, originalId)).toBe(true); expect(errors).toEqual([]);
});

test('corrupt worlds remain in the menu; a restored previous snapshot launches with a visible recovery warning', async ({ page }) => {
    test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await menu(page);
    const fixture = await page.evaluate(async () => {
        const store = window.__GAME_ENGINE__.worldRepository, { worldSnapshot } = await import('/tests/fixtures/world-snapshot.js');
        const { world } = await store.createWorld({ name: 'Recovery journey', seed: 'recovery-journey' });
        await store.saveWorld(world.id, worldSnapshot(world, 10), { checkpoint: true }); await store.saveWorld(world.id, worldSnapshot(world, 20));
        const records = await Promise.all(['latest', 'previous', 'checkpoint'].map(slot => store._read('snapshots', `${world.id}:${slot}`)));
        const db = await store.open(), tx = db.transaction('snapshots', 'readwrite');
        for (const record of records) tx.objectStore('snapshots').put({ ...record, json: '{broken' });
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
        return { id: world.id, previous: records[1] };
    });
    await menu(page); await page.locator('#world-play-btn').click();
    await expect(page.locator('#world-menu-error')).toContainText('Không còn bản lưu hợp lệ');
    await expect(page.locator('#world-menu')).toBeVisible();
    const backupDownload = page.waitForEvent('download');
    await page.locator('.world-card').getByRole('button', { name: 'Xuất bản sao thế giới' }).click();
    const downloaded = await backupDownload, recovery = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    expect(downloaded.suggestedFilename()).toContain('-recovery.json'); expect(recovery.records[0].json).toBe('{broken');
    await expect(page.locator('#world-menu-error')).toContainText('Đã xuất dữ liệu gốc');
    expect(await page.evaluate(async id => (await window.__GAME_ENGINE__.worldRepository._read('snapshots', `${id}:latest`)).json, fixture.id)).toBe('{broken');
    await page.evaluate(async record => {
        const db = await window.__GAME_ENGINE__.worldRepository.open(), tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
    }, fixture.previous);
    await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#pickup-notification')).toContainText('Đã khôi phục bản trước đó'); expect(errors).toEqual([]);
});

test('a corrupt v1 source stays visible and downloadable; repairing its original source restores a Classic world', async ({ page }) => {
    test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await menu(page);
    const fixture = await page.evaluate(async () => {
        const { SaveSystem } = await import('/src/systems/SaveSystem.js');
        const { world } = SaveSystem.createWorld({ name: 'Legacy recovery', seed: 'legacy-recovery' });
        localStorage.setItem(SaveSystem._saveKey(world.id), '{broken-v1');
        return world;
    });
    await menu(page); await expect(page.locator('.world-card')).toContainText('Cần khôi phục');
    const waitDownload = page.waitForEvent('download');
    await page.locator('.world-card').getByRole('button', { name: 'Xuất bản sao thế giới' }).click();
    const download = await waitDownload, payload = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(payload.legacy).toBe('{broken-v1');
    await page.evaluate(async world => {
        const { SaveSystem } = await import('/src/systems/SaveSystem.js'), { worldSnapshot } = await import('/tests/fixtures/world-snapshot.js');
        const snapshot = { ...worldSnapshot({ ...world, mode: 'classic', generatorVersion: 1 }), version: 1 };
        localStorage.setItem(SaveSystem._saveKey(world.id), JSON.stringify(snapshot));
    }, fixture);
    await menu(page); await expect(page.locator('.world-card')).not.toContainText('Cần khôi phục');
    await page.locator('#world-play-btn').click(); await page.waitForFunction(() => window.__GAME_ENGINE__?.scenes.activeSceneName === 'Game');
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { mode: s.engine.activeWorld.mode, generator: s.engine.activeWorld.generatorVersion, width: s.world.width ?? s.world.terrainGenerator.width, campaign: !!s.campaign };
    })).toEqual({ mode: 'classic', generator: 1, width: 100, campaign: false }); expect(errors).toEqual([]);
});
