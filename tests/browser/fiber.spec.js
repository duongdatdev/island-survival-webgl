import { test, expect } from '@playwright/test';

test('rope can be separated through crafting controls and the fiber survives reload', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto('/');
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Renewable fiber');
    await page.locator('#world-seed-input').fill('renewable-fiber');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    // Supplied rope isolates conversion; the crafting and reload use normal UI.
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        s.inventory.restore(Array.from({ length: 28 }, (_, i) => i === 0 ? { id: 'rope', count: 2 } : null));
    });
    await page.locator('[data-action="panel"][data-arg="craft"]').click();
    await page.locator('[data-action="recipe"][data-arg="unravel_rope"]').click();
    await expect(page.locator('#inventory-menu')).toContainText('3 sợi thực vật');
    await page.locator('[data-action="craft"][data-arg="unravel_rope"]').click();
    const counts = () => page.evaluate(() => {
        const i = window.__GAME_ENGINE__.scenes.activeScene.inventory;
        return { rope: i.getCount('rope'), fiber: i.getCount('fiber') };
    });
    expect(await counts()).toEqual({ rope: 1, fiber: 3 });
    await page.locator('[data-action="recipe"][data-arg="rope"]').click();
    await page.locator('[data-action="craft"][data-arg="rope"]').click();
    expect(await counts()).toEqual({ rope: 2, fiber: 0 });
    await page.locator('[data-action="recipe"][data-arg="unravel_rope"]').click();
    await page.locator('[data-action="craft"][data-arg="unravel_rope"]').click();
    await page.screenshot({ path: '.cache/fiber-browser-results/rope-fiber-crafting.png' });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await counts()).toEqual({ rope: 1, fiber: 3 });
});
