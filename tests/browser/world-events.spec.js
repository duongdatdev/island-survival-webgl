import { test, expect } from '@playwright/test';

test('world opportunities interact through E, display on explored map and survive a world reload with hunted wildlife', async ({ page }) => {
    test.setTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('World events'); await page.locator('#world-seed-input').fill('world-events-ui');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const fixture = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, events = s.campaign.islandEvents;
        s.tutorial.skip(); events.update(1, { isStorm: true }); events.update(1, { isStorm: false }); events.spawnShoal();
        const cargo = events.cargo[0]; if (!cargo) throw new Error('No cargo fixture');
        s.player.position.set([cargo.position[0], cargo.position[1] + 0.9, cargo.position[2]]);
        s.camera._firstUpdate = true;
        const boar = s.creatures.find(a => a.campaignId === 'boar-0'); boar.takeDamage(10000);
        return { cargoId: cargo.id, killedId: boar.campaignId, shoalId: events.shoals[0].id };
    });
    await page.keyboard.down('e'); await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.islandEvents.cargo.length === 0);
    await page.keyboard.up('e');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('scrap'))).toBe(3);
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, shortcut = s.campaign.islandEvents.shortcut, theta = shortcut.yaw - Math.PI / 2;
        s.inventory.addItem('stone_axe', 1);
        const x = shortcut.position[0] - Math.sin(theta) * 1.3, z = shortcut.position[2] - Math.cos(theta) * 1.3;
        s.player.position.set([x, s.terrain.getHeight(x, z) + 0.9, z]); s.camera._firstUpdate = true;
    });
    for (let cut = 1; cut <= 3; cut++) {
        await page.keyboard.down('e');
        await page.waitForFunction(progress => window.__GAME_ENGINE__.scenes.activeScene.campaign.islandEvents.cutProgress === progress, cut);
        await page.keyboard.up('e'); await page.waitForTimeout(100);
    }
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.collision.instances.has('event-shortcut'))).toBe(false);
    await page.keyboard.down('m'); await expect(page.locator('#campaign-panel')).toBeVisible(); await page.keyboard.up('m');
    const labels = await page.evaluate(() => {
        const canvas = document.getElementById('campaign-map'), context = canvas.getContext('2d'), original = context.fillText, labels = [];
        context.fillText = function(text, x, y) { labels.push({ text, x, y }); return original.call(this, text, x, y); };
        window.__GAME_ENGINE__.scenes.activeScene.campaign.drawMap(canvas); context.fillText = original;
        return labels;
    });
    const playerLabel = labels.find(label => label.text === 'Bạn'), shortcutLabel = labels.find(label => label.text === 'Đường tắt');
    expect(playerLabel).toBeTruthy(); expect(shortcutLabel).toBeTruthy();
    expect(Math.abs(playerLabel.y - shortcutLabel.y)).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: '.cache/browser-results/world-opportunities-map.png' });
    await page.keyboard.down('Escape'); await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.isOpen); await page.keyboard.up('Escape');
    expect(await page.evaluate(async () => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const result = await page.evaluate(f => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { shortcut: s.campaign.islandEvents.shortcutOpen, colliding: s.campaign.collision.instances.has('event-shortcut'),
            cargo: s.campaign.islandEvents.cargo.some(c => c.id === f.cargoId), shoal: s.campaign.islandEvents.shoals.some(c => c.id === f.shoalId),
            killed: s.wildlife.killed.has(f.killedId), respawned: s.creatures.some(c => c.campaignId === f.killedId) };
    }, fixture);
    expect(result).toEqual({ shortcut: true, colliding: false, cargo: false, shoal: true, killed: true, respawned: false });
    expect(errors).toEqual([]);
});
