import { test, expect } from '@playwright/test';

test('deep mine faces accept real held input, retain work, repeat and keep full-bag ore across reload and death', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Deep mining'); await page.locator('#world-seed-input').fill('deep-mining');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        s.campaign.respawnProtection = 1000; s.dayNight.timeOfDay = .45;
    });
    // Position/tool fixtures isolate extraction. Progress and rewards only come from real controls.
    const visit = async id => page.evaluate(id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, face = s.campaign.landmarks.mineFaces.find(f => f.id === id);
        const position = [face.base[0], face.base[1] + .9, face.base[2] + 1.8];
        const ground = s.terrain.getHeight(position[0], position[2]);
        position[1] = s.campaign.collision.groundHeight(position, ground, .55, .9, .28) + .9;
        if (!s.campaign.collision.capsuleClear(position, .28, 1.8)) throw new Error('Mine face approach blocked');
        s.player.position.set(position); s.player.velocity.fill(0); s.camera.setLookAngles(Math.PI, -.35); s.player.rotation[1] = Math.PI;
    }, id);
    const release = async () => { await page.keyboard.up('e'); await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.active)).toBeNull(); };
    const reload = async () => {
        expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
        await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
        await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
        await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
        await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000; });
    };
    await visit('iron'); await page.keyboard.down('e'); await expect(page.locator('#pickup-notification')).toContainText('cuốc'); await page.keyboard.up('e');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.faces.iron.progress)).toBe(0);
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.addItem('stone_pickaxe', 1));
    await page.keyboard.down('e'); await expect(page.locator('#campaign-activity-label')).toContainText('Vỉa sắt sâu');
    await expect(page.locator('#campaign-activity-label')).not.toContainText('Oxy');
    await page.waitForTimeout(2200); await page.screenshot({ path: '.cache/mining-browser-results/deep-mine-active.png' });
    await page.keyboard.press('j'); await expect(page.locator('#campaign-panel-title')).toHaveText('Nhật ký chiến dịch');
    await release();
    const partial = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot());
    expect(partial.faces.iron.progress).toBeGreaterThan(1); expect(partial.faces.iron.progress).toBeLessThan(3);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot())).toEqual(partial);
    await page.keyboard.press('Escape'); await reload();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot())).toEqual(partial);
    await visit('iron'); await page.keyboard.down('e');
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.active)).toBe('iron');
    // Headless Chrome keeps background pages visible. Deliver the browser blur event explicitly;
    // held input and extraction still run through the live input/simulation listeners.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.active)).toBeNull();
    const blurred = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot())).toEqual(blurred);
    await page.keyboard.up('e');
    await visit('iron'); await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.addItem('iron_pickaxe', 1));
    await page.keyboard.down('e');
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.faces.iron.batches), { timeout: 10000 }).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.faces.iron.batches), { timeout: 10000 }).toBe(2);
    await release(); expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('iron_ore'))).toBe(4);
    await visit('copper');
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, slots = Array.from({ length: 28 }, () => ({ id: 'wood', count: 99 }));
        slots[20] = { id: 'iron_pickaxe', count: 1 }; slots[0] = { id: 'copper_ore', count: 98 }; s.inventory.restore(slots);
    });
    await page.keyboard.down('e');
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.faces.copper.progress), { timeout: 10000 }).toBe(6);
    await release(); await expect(page.locator('#pickup-notification')).toContainText('Túi đầy');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('copper_ore'))).toBe(98);
    await reload();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.faces.copper)).toEqual({ progress: 6, batches: 0 });
    await visit('copper'); await page.evaluate(() => { window.__GAME_ENGINE__.scenes.activeScene.inventory.slots[1] = null; });
    await page.keyboard.press('e');
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('copper_ore'))).toBe(100);
    await page.keyboard.press('e'); await release();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('copper_ore'))).toBe(100);
    await visit('iron'); await page.keyboard.down('e'); await page.waitForTimeout(1500); await release();
    const beforeDeath = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot());
    expect(beforeDeath.faces.iron.progress).toBeGreaterThan(1);
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.campaign.respawnProtection = 0; s.vitals.applyDamage(1000, 'mine-browser-fixture'); });
    expect(await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; return { deaths: c.deaths, mining: c.mineExtraction.snapshot(), active: c.mineExtraction.active }; })).toEqual({ deaths: 1, mining: beforeDeath, active: null });
    await reload(); expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.mineExtraction.snapshot())).toEqual(beforeDeath);
    expect(errors).toEqual([]);
});
