import { test, expect } from '@playwright/test';

test('Campaign tools render in hand and an iron axe fells an actual world tree with two mouse swings, retained on reload', async ({ page }) => {
    test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Campaign tools'); await page.locator('#world-seed-input').fill('campaign-tools');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.locator('canvas').first().click({ position: { x: 640, y: 400 } });
    await page.waitForFunction(() => window.__GAME_ENGINE__.input.mouse.isLocked);
    const treeId = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.tutorial.skip();
        const tree = s.environmentEntities.find(t => t.isHarvestableTree && t.treeState === 'standing'
            && t.collisionRadius < 3 && !s.creatures.some(a => Math.hypot(a.position[0] - t.position[0], a.position[2] - t.position[2]) < 8));
        if (!tree) throw new Error('No clear tree fixture');
        const x = tree.position[0], z = tree.position[2] - 1.7 - tree.collisionRadius;
        s.player.position.set([x, s.terrain.getHeight(x, z) + 0.9, z]); s.player.rotation[1] = 0;
        s.camera._yaw = s.camera._smoothYaw = 0; s.camera._pitch = s.camera._smoothPitch = 0; s.camera._firstUpdate = true;
        for (const [index, id] of ['iron_axe', 'stone_pickaxe', 'iron_pickaxe'].entries()) s.inventory.slots[20 + index] = { id, count: 1 };
        s.inventory.selectedHotbarIndex = 0; s.inventoryController.renderInventory();
        return tree.worldObjectId;
    });
    for (const [key, id] of [['2', 'stone_pickaxe'], ['3', 'iron_pickaxe'], ['1', 'iron_axe']]) {
        await page.keyboard.down(key); await page.waitForFunction(id => window.__GAME_ENGINE__.scenes.activeScene.firstPersonViewModel.weaponId === id, id);
        await page.keyboard.up(key); await page.screenshot({ path: `.cache/browser-results/held-${id}.png` });
    }
    for (let hit = 1; hit <= 2; hit++) {
        await page.mouse.down();
        await page.waitForFunction(({ id, hit }) => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, tree = s.environmentEntities.find(t => t.worldObjectId === id);
            return hit === 1 ? tree?.treeHitsRemaining === 1 : s.removedEnvironmentObjectIds.has(id);
        }, { id: treeId, hit });
        await page.mouse.up(); await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.combatSystem.canAttack());
    }
    await page.waitForFunction(id => !window.__GAME_ENGINE__.scenes.activeScene.environmentEntities.some(t => t.worldObjectId === id), treeId);
    expect(await page.evaluate(async () => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return s.removedEnvironmentObjectIds.has(id) && !s.environmentEntities.some(t => t.worldObjectId === id);
    }, treeId)).toBe(true); expect(errors).toEqual([]);
});
