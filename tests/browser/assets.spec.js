import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const modelCount = JSON.parse(await readFile('assets/campaign/manifest.json', 'utf8')).models.length;

test('all campaign models load and render through the real game renderer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tools/asset-gallery.html');
    await expect(page.getByRole('status')).toHaveText(`${modelCount}/${modelCount} model đã tải`, { timeout: 30000 });
    await page.getByRole('button', { name: 'Kiểm tra toàn bộ' }).click();
    await expect(page.getByRole('status')).toHaveText(`Đã vẽ ${modelCount}/${modelCount} model · lỗi GPU: 0`, { timeout: 45000 });
    expect(errors).toEqual([]);
    await page.locator('#models').selectOption('campaign_smelter');
    await expect(page.locator('#details')).toContainText('campaign_smelter');
    await page.getByRole('button', { name: 'Dừng xoay' }).click();
    await page.screenshot({ path: '.cache/browser-results/campaign-smelter.png' });
    await page.locator('#models').selectOption('pirate_ship-wreck');
    await page.screenshot({ path: '.cache/browser-results/campaign-wreck.png' });
    for (const id of ['campaign_raft_sail', 'campaign_raft_motor']) {
        await page.locator('#models').selectOption(id);
        await expect(page.locator('#details')).toContainText(id);
        await page.screenshot({ path: `.cache/browser-results/${id}.png` });
    }
    await page.getByRole('button', { name: 'Xem đảo chiến dịch' }).click();
    await expect(page.locator('#details')).toContainText('Đảo chiến dịch 640 × 640 m');
    await page.waitForFunction(() => window.__assetQA.worldChunks > 150);
    expect(await page.evaluate(() => window.__assetQA.errors)).toEqual([]);
    await page.screenshot({ path: '.cache/browser-results/campaign-terrain.png' });
});

test('IndexedDB persists campaign data across a real page reload', async ({ page }) => {
    await page.goto('/tools/asset-gallery.html');
    const id = await page.evaluate(async () => {
        const { WorldRepository } = await import('/src/systems/WorldRepository.js');
        const { worldSnapshot } = await import('/tests/fixtures/world-snapshot.js');
        const store = new WorldRepository({ name: 'browser-test-worlds', legacy: { listWorlds: () => [] } });
        await store.initialize();
        const { world } = await store.createWorld({ name: 'Persistent campaign', seed: 'browser-persistence' });
        const snapshot = worldSnapshot(world, 123, 40);
        snapshot.player = { position: [15, 2, 20], yaw: 0.5 };
        snapshot.inventory.selectedHotbarIndex = 2;
        if (!await store.saveWorld(world.id, snapshot, { checkpoint: true })) throw new Error('Failed to save');
        await store.close();
        return world.id;
    });
    await page.reload();
    const restored = await page.evaluate(async id => {
        const { WorldRepository } = await import('/src/systems/WorldRepository.js');
        const store = new WorldRepository({ name: 'browser-test-worlds', legacy: { listWorlds: () => [] } });
        const snapshot = await store.loadWorld(id);
        await store.close();
        return snapshot;
    }, id);
    expect(restored.player.position).toEqual([15, 2, 20]);
    expect(restored.campaign.registry.structures[0].slots[0].count).toBe(40);
    expect(restored.inventory.selectedHotbarIndex).toBe(2);
});
