import { test, expect } from '@playwright/test';

test('recipe details show actual output yields and station fuel before queueing without charging fuel on selection', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Recipe preparation');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        const slots = Array(28).fill(null);
        slots[0] = { id: 'wood', count: 4 }; slots[1] = { id: 'stone', count: 4 }; slots[2] = { id: 'rope', count: 1 };
        s.inventory.restore(slots);
    });
    await page.locator('[data-action="panel"][data-arg="craft"]').click();
    const select = id => page.locator(`[data-action="recipe"][data-arg="${id}"]`).click();
    await select('arrow');
    await expect(page.locator('.recipe-output')).toContainText('×3'); await expect(page.locator('.recipe-fuel')).toHaveCount(0);
    await page.locator('[data-action="craft"][data-arg="arrow"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('arrow'))).toBe(3);
    await select('unravel_rope'); await expect(page.locator('.recipe-output')).toContainText('×3');
    await page.locator('[data-action="craft"][data-arg="unravel_rope"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('fiber'))).toBe(3);
    for (const [id, seconds, yieldCount] of [['iron_ingot', 45, 1], ['charcoal', 30, 2], ['smoke_ocean', 120, 2]]) {
        await select(id);
        await expect(page.locator('.recipe-fuel')).toContainText(`tối thiểu ${seconds} giây`);
        await expect(page.locator('.recipe-fuel')).toContainText('Mưa');
        await expect(page.locator('.recipe-output')).toContainText(`×${yieldCount}`);
    }
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'))).toBe(3);
    await page.screenshot({ path: '.cache/recipe-details-results/smoked-ocean-fish.png' });
    expect(errors).toEqual([]);
});
