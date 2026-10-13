import { test, expect } from '@playwright/test';

test('Classic keeps its recipes and inventory shortcuts in the shared backpack', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await page.locator('#menu-play-btn').click();
    await page.locator('#world-create-btn').click(); await page.locator('#world-mode-input').selectOption('classic');
    await page.locator('#world-name-input').fill('Classic backpack');
    await page.locator('#world-form button[type=submit]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('#hotbar-hud')).toBeVisible({ timeout: 60000 });
    await page.waitForFunction(() => window.__GAME_ENGINE__?.scenes.activeScene?.inventoryController?._initialized);
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        const slots = Array(28).fill(null); slots[0] = { id: 'wood', count: 2 }; slots[1] = { id: 'stone', count: 2 };
        s.inventory.restore(slots);
    });
    await page.keyboard.press('c'); await expect(page.locator('#inventory-menu')).toBeVisible();
    await expect(page.locator('.cat-btn:visible')).toHaveCount(3);
    await page.locator('[data-recipe-id=stone_axe]').click(); await page.locator('#details-craft-btn').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('stone_axe'))).toBe(1);
    await page.locator('#inventory-menu-close').focus(); await page.keyboard.press('Tab');
    await expect(page.locator('.cat-btn[data-category=tool]')).toBeFocused();
    await expect(page.locator('#inventory-menu')).toBeVisible();
    await page.screenshot({ path: '.cache/game-ui-review/classic-inventory.png', animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(page.locator('#inventory-menu')).toBeHidden();
    expect(errors).toEqual([]);
});
