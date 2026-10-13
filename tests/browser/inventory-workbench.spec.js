import { test, expect } from '@playwright/test';

test('backpack provides crafting, progression requirements, category filters and click transfers without a second panel', async ({ page }) => {
    test.setTimeout(150000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Hành trang đảo hoang');
    await page.locator('#world-seed-input').fill('field-workbench');
    await page.locator('#world-form button[type=submit]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 60000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.dayNight.timeOfDay = .4;
        const slots = Array(28).fill(null);
        for (const [index, id, count] of [[0, 'wood', 12], [1, 'stone', 8], [2, 'fiber', 9], [3, 'rope', 3], [4, 'scrap', 2], [20, 'fresh_water', 3]]) slots[index] = { id, count };
        s.inventory.restore(slots);
    });
    await page.screenshot({ path: '.cache/game-ui-review/hud.png' });
    await page.keyboard.press('c');
    const menu = page.locator('#inventory-menu');
    await expect(menu).toBeVisible(); await expect(page.locator('#campaign-panel')).toBeHidden();
    await expect(page.locator('#inventory-menu #hotbar-hud')).toHaveCount(1);
    await expect(page.locator('#inventory-hotbar')).toHaveCount(0);
    await expect(page.locator('#hotbar-hud')).toBeVisible();
    await expect(page.locator('#campaign-open-craft')).toHaveCount(0);
    await expect(page.locator('#inventory-menu-close')).toBeFocused();
    await page.locator('[data-action=recipe][data-arg=rope]').click();
    await expect(page.locator('[data-action=craft][data-arg=rope]')).toBeEnabled();
    await page.locator('[data-action=craft][data-arg=rope]').click();
    await expect(page.locator('#inventory-feedback')).toContainText('Đã chế tạo');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('fiber'))).toBe(6);
    await page.locator('[data-action=recipe][data-arg=iron_pickaxe]').click();
    await expect(page.locator('.recipe-availability')).toContainText('Hoàn thành chương 2');
    await expect(page.locator('[data-action=craft][data-arg=iron_pickaxe]')).toBeDisabled();
    await page.locator('[data-category=material]').click();
    await expect(page.locator('[data-action=recipe][data-arg=unravel_rope]')).toBeVisible();
    await expect(page.locator('[data-action=recipe][data-arg=stone_axe]')).toHaveCount(0);
    await page.locator('[data-category=all]').click();
    await page.locator('[data-action=recipe][data-arg=stone_axe]').click();
    // The live bottom hotbar remains the only quickbar while the backpack is open.
    const inventorySlot = page.locator('#inventory-grid [data-index="0"]');
    const quickbarSlot = page.locator('#hotbar-hud [data-index="21"]');
    await inventorySlot.dragTo(quickbarSlot);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.slots[21])).toEqual({ id: 'wood', count: 12 });
    await quickbarSlot.focus(); await page.keyboard.press('Enter');
    await inventorySlot.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.slots[0])).toEqual({ id: 'wood', count: 12 });
    for (const [width, height] of [[1440, 900], [375, 812], [844, 390], [1280, 720]]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({ path: `.cache/game-ui-review/inventory-${width}x${height}.png`, animations: 'disabled' });
        const box = await page.locator('.inventory-menu-content').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
        if (width > 1120) {
            const inventoryBox = await page.locator('.inventory-column').boundingBox();
            expect(Math.abs(inventoryBox.x + inventoryBox.width / 2 - width / 2)).toBeLessThanOrEqual(1);
        }
        expect(await menu.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width > 1000) {
            await expect(page.locator('.recipe-availability')).toBeInViewport();
            await expect(page.locator('[data-action=craft][data-arg=stone_axe]')).toBeInViewport();
            await expect(page.locator('[data-action=pin][data-arg=stone_axe]')).toBeInViewport();
        }
        if (width <= 600) {
            const crafting = await page.locator('.crafting-column').boundingBox();
            const inventory = await page.locator('.inventory-column').boundingBox();
            expect(inventory.y).toBeGreaterThanOrEqual(crafting.y + crafting.height);
        }
        await page.locator('#hotbar-hud [data-index="27"]').focus();
        await page.keyboard.press('Tab'); await expect(page.locator('#inventory-menu-close')).toBeFocused();
        await expect(menu).toBeVisible();
    }
    await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
    await expect(page.locator('#inventory-menu #hotbar-hud')).toHaveCount(0);
    await expect(page.locator('#hotbar-hud')).toBeVisible();
    await page.locator('[data-action=panel][data-arg=craft]').click();
    await expect(menu).toBeVisible(); await expect(page.locator('#campaign-panel')).toBeHidden();
    await page.locator('#inventory-menu-close').click();
    await expect(page.locator('[data-action=panel][data-arg=craft]')).toBeFocused();
    expect(errors).toEqual([]);
});
