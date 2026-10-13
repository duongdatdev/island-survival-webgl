import { test, expect } from '@playwright/test';

test('chosen objectives and recipes persist; pinned counts follow consenting nearby chests and completed goals fall back', async ({ page }) => {
    test.setTimeout(150000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Pinned progress'); await page.locator('#world-seed-input').fill('pinned-progress');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const chest = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.vitals.thirst = 80;
        const slots = Array(28).fill(null);
        slots[0] = { id: 'wood', count: 12 }; slots[1] = { id: 'rope', count: 2 };
        slots[2] = { id: 'fiber', count: 6 }; slots[20] = { id: 'fresh_water', count: 1 }; s.inventory.restore(slots);
        const spawn = s.world.spawnPosition;
        for (const radius of [16, 24, 32]) for (let i = 0; i < 32; i++) {
            const x = Math.round((spawn[0] + Math.cos(i * Math.PI / 16) * radius) / 2) * 2;
            const z = Math.round((spawn[2] + Math.sin(i * Math.PI / 16) * radius) / 2) * 2;
            if (!c.registry.preview('chest', [x, 0, z]).valid) continue;
            const result = c.registry.place('chest', [x, 0, z], 0, s.inventory);
            if (!result.ok) throw new Error(result.error);
            s.player.position.set([x, s.terrain.getHeight(x, z - 1.8) + .9, z - 1.8]); s.player.velocity.fill(0);
            return { id: result.structure.id, position: [...result.structure.position] };
        }
        throw new Error('No chest site');
    });
    const close = async () => { await page.keyboard.press('Escape'); await expect(page.locator('#campaign-panel')).toBeHidden(); await expect(page.locator('#inventory-menu')).toBeHidden(); };
    const inspect = async () => {
        await page.locator('[data-action="panel"][data-arg="build"]').click();
        await page.locator(`[data-action="inspect-structure"][data-arg="${chest.id}"]`).click();
    };
    await page.keyboard.press('j'); await page.locator('[data-action="pin-objective"][data-arg="2"]').click();
    await expect(page.locator('[data-action="pin-objective"][data-arg="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-action="pin-objective"][data-arg="2"]')).toHaveAccessibleName('Bỏ ghim: Dựng lửa trại');
    await close();
    await expect(page.locator('.objective-description')).toContainText('Dựng lửa trại');
    await inspect(); await page.locator('[data-action="store"][data-arg="fiber"]').click();
    await page.locator('[data-action="craft-source"]').click(); await close();
    const craftPanel = async () => {
        await page.locator('[data-action="panel"][data-arg="craft"]').click(); await page.locator('[data-action="recipe"][data-arg="rope"]').click();
    };
    await craftPanel(); await page.locator('[data-action="pin"][data-arg="rope"]').click();
    await expect(page.locator('[data-action="pin"][data-arg="rope"]')).toHaveText('Bỏ ghim nguyên liệu');
    await expect(page.locator('[data-action="pin"][data-arg="rope"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-action="craft"][data-arg="rope"]').click(); await close();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('fiber'))).toBe(0);
    await expect(page.locator('.objective-ingredients')).toContainText('3/3');
    await page.evaluate(p => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.player.position.set([p[0] + 10, s.terrain.getHeight(p[0] + 10, p[2]) + .9, p[2]]); s.player.velocity.fill(0); }, chest.position);
    await expect(page.locator('.objective-ingredients')).toContainText('0/3');
    await page.evaluate(p => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.player.position.set([p[0], s.terrain.getHeight(p[0], p[2] - 1.8) + .9, p[2] - 1.8]); s.player.velocity.fill(0); }, chest.position);
    await expect(page.locator('.objective-ingredients')).toContainText('3/3');
    await inspect(); await page.locator('[data-action="craft-source"]').click(); await close();
    await expect(page.locator('.objective-ingredients')).toContainText('0/3');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => window.__GAME_ENGINE__.input.setPointerLockEnabled(false));
    await expect(page.locator('.objective-description')).toContainText('Dựng lửa trại');
    await expect(page.locator('.objective-ingredients')).toContainText('0/3');
    await craftPanel(); await page.locator('[data-action="pin"][data-arg="rope"]').click(); await close();
    await expect(page.locator('.objective-ingredients')).toHaveCount(0);
    await page.keyboard.press('j'); await page.locator('[data-action="pin-objective"][data-arg="2"]').click(); await close();
    await expect(page.locator('.objective-description')).toContainText('Tìm và uống nước ngọt');
    await page.keyboard.press('j'); await page.locator('[data-action="pin-objective"][data-arg="0"]').click(); await close();
    await page.keyboard.press('Digit1'); await page.keyboard.press('q');
    await expect(page.locator('.objective-description')).toContainText('Dựng mái trú');
    await page.screenshot({ path: '.cache/pinned-progress-results/completed-goal-fallback.png' });
    expect(errors).toEqual([]);
});
