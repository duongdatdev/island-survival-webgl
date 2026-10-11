import { test, expect } from '@playwright/test';

async function menu(page) {
    await page.goto('/');
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
}

test('a Campaign world opens the large island, constructs a chest via controls, and restores it', async ({ page }) => {
    // This story boots the world twice; each boot already allows up to 45 seconds.
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await menu(page);
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Campaign integration');
    await page.locator('#world-seed-input').fill('campaign-integration');
    await expect(page.locator('#world-mode-input')).toHaveValue('campaign');
    await page.locator('#world-form button[type="submit"]').click();
    await expect(page.locator('#world-list')).toContainText('Campaign integration');
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.world.width)).toBe(640);
    await expect(async () => {
        const hud = await page.locator('#vitals-hud').boundingBox();
        expect(hud.x).toBeGreaterThanOrEqual(0);
        expect(hud.y).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
    await page.evaluate(() => {
        const scene = window.__GAME_ENGINE__.scenes.activeScene;
        scene.inventory.addItem('wood', 30);
        scene.inventory.addItem('rope', 5);
    });
    await page.locator('[data-action="panel"][data-arg="build"]').click();
    await page.locator('[data-action="build"][data-arg="chest"]').click();
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.placement?.preview?.valid);
    await page.keyboard.down('e');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.size === 1);
    await page.keyboard.up('e');
    await page.keyboard.press('Escape', { delay: 100 });
    const saved = await page.evaluate(async () => {
        const scene = window.__GAME_ENGINE__.scenes.activeScene;
        const record = [...scene.campaign.registry.structures.values()][0];
        record.container.addItem('stone', 17);
        const ok = await scene.saveController.save(false);
        return { ok, id: record.id, position: record.position };
    });
    expect(saved.ok).toBe(true);
    await page.screenshot({ path: '.cache/browser-results/campaign-first-base.png' });
    await menu(page);
    await expect(page.locator('#world-list')).toContainText('Campaign integration');
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const restored = await page.evaluate(id => {
        const record = window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id);
        return { position: record.position, stone: record.container.getCount('stone') };
    }, saved.id);
    expect(restored).toEqual({ position: saved.position, stone: 17 });
    expect(errors).toEqual([]);
});

test('new Classic worlds keep the original map and UI', async ({ page }) => {
    await menu(page);
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Classic integration');
    await page.locator('#world-seed-input').fill('classic-integration');
    await page.locator('#world-mode-input').selectOption('classic');
    await page.locator('#world-form button[type="submit"]').click();
    await expect(page.locator('#world-list')).toContainText('Classic integration');
    await page.locator('#world-play-btn').click();
    await page.waitForFunction(() => window.__GAME_ENGINE__?.scenes.activeSceneName === 'Game');
    expect(await page.evaluate(() => !!window.__GAME_ENGINE__.scenes.activeScene.campaign)).toBe(false);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.world.terrainGenerator.width)).toBe(100);
});

test('Campaign hook and fishing controls work, and repeated deaths remain playable after saving', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await menu(page);
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Campaign activities');
    await page.locator('#world-seed-input').fill('activities');
    await page.locator('#world-form button[type="submit"]').click();
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const scene = window.__GAME_ENGINE__.scenes.activeScene;
        scene.tutorial.skip();
        const start = scene.world.spawnPosition, radius = scene.world.terrainGenerator.island.radius - 1;
        const angle = Math.atan2(start[0], start[2]);
        scene.player.position.set([Math.sin(angle) * radius, 1.12, Math.cos(angle) * radius]);
        scene.player.rotation[1] = angle;
        scene.camera._yaw = scene.camera._smoothYaw = angle;
        scene.camera._firstUpdate = true;
        scene.inventory.slots[20] = { id: 'hook', count: 1 };
        scene.inventory.selectedHotbarIndex = 0;
        scene.inventoryController.renderInventory();
        const debris = scene.debrisManager.debris[0] || scene.debrisManager._spawnDebris(scene.gl);
        // Natural initial debris clusters around the same coast. Keep it behind the player so this
        // controlled wood target is the aimed item, regardless of random debris types/spawn order.
        for (const other of scene.debrisManager.debris) if (other !== debris) {
            other.position.set([scene.player.position[0] - Math.sin(angle) * 8, 0.15, scene.player.position[2] - Math.cos(angle) * 8]);
            other.driftSpeed = 0;
        }
        scene.debrisManager._spawnTimer = 60;
        debris.position.set([scene.player.position[0] + Math.sin(angle) * 8, 0.15, scene.player.position[2] + Math.cos(angle) * 8]);
        debris.driftSpeed = 0;
        debris.debrisDef = { ...debris.debrisDef, gives: { resourceId: 'wood', amount: 3 } };
    });
    await page.keyboard.down('q');
    await page.waitForFunction(() => !!window.__GAME_ENGINE__.scenes.activeScene.campaign.hook.state);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.hook.state.target.debrisDef.gives)).toEqual({ resourceId: 'wood', amount: 3 });
    await page.keyboard.up('q');
    await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.hook.state);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'))).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => {
        const scene = window.__GAME_ENGINE__.scenes.activeScene;
        scene.inventory.slots[20] = { id: 'fishing_rod', count: 1 };
        scene.campaign.fishing.random = () => 0;
    });
    await page.keyboard.down('q');
    await page.waitForFunction(() => !!window.__GAME_ENGINE__.scenes.activeScene.campaign.fishing.state);
    await page.keyboard.up('q');
    await expect(page.locator('#campaign-activity')).toBeVisible();
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fishing.state?.phase === 'bite');
    await page.keyboard.down('e');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fishing.state?.phase === 'reeling');
    await page.keyboard.up('e');
    await expect(page.locator('#campaign-reel-label')).toBeVisible();
    await page.screenshot({ path: '.cache/browser-results/campaign-fishing.png' });
    await page.keyboard.down('Escape');
    await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.fishing.state);
    await page.keyboard.up('Escape');
    const result = await page.evaluate(async () => {
        const scene = window.__GAME_ENGINE__.scenes.activeScene;
        for (let index = 0; index < 2; index++) {
            scene.inventory.slots[0] = { id: 'stone', count: index + 1 };
            scene.campaign.respawnProtection = 0;
            scene.vitals.applyDamage(200, 'test');
            if (scene.vitals._isGameOver) throw new Error('Respawn did not reset vitals');
        }
        scene.vitals.update(1, false);
        return { saved: await scene.saveController.save(false), bags: scene.campaign.deathBags.length,
            health: scene.vitals.health, thirst: scene.vitals.thirst };
    });
    expect(result.saved).toBe(true);
    expect(result.bags).toBe(2);
    expect(result.health).toBe(100);
    expect(result.thirst).toBeLessThan(65);
    await menu(page);
    await expect(page.locator('#world-list')).toContainText('Campaign activities');
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.deathBags.length)).toBe(2);
    expect(errors).toEqual([]);
});
