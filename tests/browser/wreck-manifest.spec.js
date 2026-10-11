import { test, expect } from '@playwright/test';

test('the manifest is visible in the submerged open hold and reads through actual underwater interaction', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Open hold manifest'); await page.locator('#world-seed-input').fill('early-campaign-path');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(async () => {
        const { findWreckApproach } = await import('/tests/fixtures/wreck-approach.js');
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, position = c.journals.wreck_manifest.position;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.inventory.addItem('dive_kit', 1);
        s.dayNight.timeOfDay = .45; c.respawnProtection = 1000;
        const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
        const point = findWreckApproach({ position, base: position, modelId: 'note-wreck_manifest' }, c.collision, s.terrain,
            point => c.landmarks.salvageNodes.every(node => distance(point, node.position) > distance(point, position) + .1));
        if (!point) throw new Error('No exposed hold approach');
        s.player.position.set(point); s.player.velocity.fill(0); c.swimY = point[1];
        const yaw = Math.atan2(position[0] - point[0], position[2] - point[2]);
        s.player.rotation[1] = yaw; s.camera.setLookAngles(yaw, -.5); s.camera._firstUpdate = true;
    });
    await expect(page.locator('#campaign-action-hint')).toContainText('Bản kê hàng');
    await expect(page.locator('#campaign-activity-label')).toContainText('Oxy');
    await page.screenshot({ path: '.cache/wreck-manifest-results/open-hold-note.png' });
    await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được');
    await expect(page.locator('.campaign-note')).toContainText('ba bộ phận');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.journals.has('wreck_manifest'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.journals.has('wreck_manifest'))).toBe(true);
    expect(errors).toEqual([]);
});
