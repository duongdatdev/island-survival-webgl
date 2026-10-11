import { test, expect } from '@playwright/test';

test('actual dive controls respect a deck, consume oxygen below it, persist depth, and surface after swimming around the edge', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Deck diving'); await page.locator('#world-seed-input').fill('deck-diving');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const anchor = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, r = s.world.terrainGenerator.island.radius + 23;
        let point;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            if (s.terrain.getHeight(x, z) < -5 && s.terrain.getHeight(x + 5, z) < -5) { point = [x, z]; break; }
        }
        if (!point) throw new Error('No deep-water fixture');
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.inventory.addItem('dive_kit', 1);
        s.dayNight.timeOfDay = 0.45; c.respawnProtection = 1000;
        s.player.position.set([point[0], -2.8, point[1]]); s.player.velocity.fill(0);
        s.player.rotation[1] = 0.7; s.camera.setLookAngles(0.7);
        c.swimY = -2.8; c.oxygen = 30;
        // Deterministic collision-only fixture isolates an overhead deck; actual wreck GLB access is tested separately.
        const plane = new Float32Array([-2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2]);
        c.collision.add('dive-test-deck', plane, [point[0], -1.4, point[1]]);
        c.journals.wreck_manifest.position = [point[0], -2.3, point[1] + 0.3];
        return point;
    });
    await page.keyboard.down('Space');
    try { await page.waitForFunction(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return s.player.position[1] > -2.32 && s.campaign.oxygen < 29.3; }); }
    finally { await page.keyboard.up('Space'); }
    await expect(page.locator('#campaign-action-hint')).toContainText('E · Đọc Bản kê hàng của tàu');
    const blocked = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; return { y: s.player.position[1], swim: s.campaign.swimY,
            oxygen: s.campaign.oxygen, saved: await s.saveController.save(false) };
    });
    expect(blocked.y).toBeLessThan(-2.299); expect(blocked.swim).toBeCloseTo(blocked.y, 4); expect(blocked.oxygen).toBeLessThan(30); expect(blocked.saved).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.swimY)).toBeCloseTo(blocked.y, 2);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.camera._yaw)).toBeCloseTo(0.7, 4);
    await page.evaluate(anchor => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000;
        const plane = new Float32Array([-2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2]);
        s.campaign.collision.add('dive-test-deck', plane, [anchor[0], -1.4, anchor[1]]);
    }, anchor);
    await page.keyboard.down('a'); await page.keyboard.down('Space');
    try { await page.waitForFunction(x => { const s = window.__GAME_ENGINE__.scenes.activeScene; return s.player.position[0] > x + 3 && s.player.position[1] > -0.8 && s.campaign.oxygen > 30; }, anchor[0]); }
    finally { await page.keyboard.up('Space'); await page.keyboard.up('a'); }
    await expect(page.locator('#campaign-activity')).toBeHidden(); expect(errors).toEqual([]);
});
