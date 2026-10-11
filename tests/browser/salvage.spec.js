import { test, expect } from '@playwright/test';

async function approach(page, id) {
    await page.evaluate(async id => {
        const { findWreckApproach } = await import('/tests/fixtures/wreck-approach.js');
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, node = c.landmarks.salvageNodes.find(n => n.id === id);
        const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
        const rivals = [...c.landmarks.salvageNodes.filter(n => n.id !== id && !c.wreckSalvage.parts[n.id].claimed), ...Object.values(c.journals)];
        const point = findWreckApproach(node, c.collision, s.terrain, point => rivals.every(other => dist(point, other.position) > dist(point, node.position) + 0.1));
        if (!point) throw new Error('No unobstructed interaction approach for ' + id);
        s.player.position.set(point); s.player.velocity.fill(0); c.swimY = point[1];
        const yaw = Math.atan2(node.position[0] - point[0], node.position[2] - point[2]);
        s.player.rotation[1] = yaw; s.camera.setLookAngles(yaw, -0.3);
        s.camera._firstUpdate = true;
    }, id);
}

test('real held salvage controls retain partial work and full-bag rewards across reloads, then complete all three sites once', async ({ page }) => {
    test.setTimeout(180000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const enter = async () => {
        await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
        await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
        await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
        await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene; s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000;
        });
    };
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Wreck salvage'); await page.locator('#world-seed-input').fill('salvage-browser');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000;
        s.inventory.slots.fill(null); for (const id of ['dive_kit', 'stone_axe', 'stone_pickaxe']) s.inventory.addItem(id, 1);
        s.campaign.oxygen = 120; s.dayNight.timeOfDay = 0.45;
    });
    await approach(page, 'cargo'); await expect(page.locator('#campaign-action-hint')).toContainText('Thùng hàng mắc dây');
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.removeItem('stone_axe', 1));
    await page.keyboard.press('e', { delay: 100 });
    await expect(page.locator('#pickup-notification')).toContainText('rìu đá hoặc rìu sắt');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.active)).toBeNull();
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.addItem('stone_axe', 1));
    await page.keyboard.down('e');
    try {
        await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts.cargo.progress > 1.5);
        await expect(page.locator('#campaign-reel-label')).toContainText('Trục vớt');
        await expect(page.locator('#campaign-tension-label')).toContainText('Oxy');
        await page.screenshot({ path: '.cache/browser-results/wreck-salvage-working.png' });
    }
    finally { await page.keyboard.up('e'); }
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.active === null);
    await page.keyboard.down('e');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.active === 'cargo');
    await page.keyboard.press('j', { delay: 100 }); await page.keyboard.up('e');
    await expect(page.locator('#campaign-panel-title')).toHaveText('Nhật ký chiến dịch');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.active)).toBeNull();
    const menuTime = await page.evaluate(() => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign;
        return { played: c.playSeconds, work: c.wreckSalvage.parts.cargo.progress, oxygen: c.oxygen };
    });
    await page.waitForFunction(played => window.__GAME_ENGINE__.scenes.activeScene.campaign.playSeconds > played + 0.5, menuTime.played);
    expect(await page.evaluate(() => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; return { work: c.wreckSalvage.parts.cargo.progress, oxygen: c.oxygen };
    })).toEqual({ work: menuTime.work, oxygen: menuTime.oxygen });
    const partial = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { progress: s.campaign.wreckSalvage.parts.cargo.progress, oxygen: s.campaign.oxygen, saved: await s.saveController.save(false) };
    });
    expect(partial.progress).toBeLessThan(6); expect(partial.oxygen).toBeLessThan(119); expect(partial.saved).toBe(true);
    await enter();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts.cargo.progress)).toBe(partial.progress);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.active)).toBeNull();
    await approach(page, 'cargo'); await page.keyboard.down('e');
    try { await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts.cargo.claimed); }
    finally { await page.keyboard.up('e'); }
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('scrap'))).toBe(8);
    await approach(page, 'wiring');
    await page.evaluate(() => {
        const bag = window.__GAME_ENGINE__.scenes.activeScene.inventory;
        for (let count = 0; count < 28 && bag.slots.some(slot => !slot); count++) {
            if (!bag.addItem('wood', 99)) throw new Error('Cannot fill inventory fixture');
        }
        if (bag.slots.some(slot => !slot)) throw new Error('Inventory fixture is not full');
    });
    await expect(page.locator('#campaign-action-hint')).toContainText('Hộp dây dẫn');
    await page.keyboard.down('e');
    try { await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts.wiring.progress === 5); }
    finally { await page.keyboard.up('e'); }
    const pending = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; return { part: s.campaign.wreckSalvage.parts.wiring,
            scrap: s.inventory.getCount('scrap'), copper: s.inventory.getCount('copper_ingot'), saved: await s.saveController.save(false) };
    });
    expect(pending.part.claimed).toBe(false); expect(pending.scrap).toBe(8); expect(pending.copper).toBe(0); expect(pending.saved).toBe(true);
    await enter(); await approach(page, 'wiring');
    await expect(page.locator('#campaign-action-hint')).toContainText('nhận vật tư đã tháo');
    await page.evaluate(() => { const bag = window.__GAME_ENGINE__.scenes.activeScene.inventory; bag.removeItem('wood', 99); });
    await page.keyboard.press('e', { delay: 100 });
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts.wiring.claimed);
    await page.keyboard.press('e', { delay: 100 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('copper_ingot'))).toBe(4);
    await approach(page, 'machinery'); await expect(page.locator('#campaign-action-hint')).toContainText('Cụm máy');
    await page.keyboard.down('e');
    try { await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.allClaimed()); }
    finally { await page.keyboard.up('e'); }
    const completed = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        return { scrap: s.inventory.getCount('scrap'), copper: s.inventory.getCount('copper_ingot'),
            cache: c.claimedCaches.has('wreck_salvage'), fact: c.progress.facts['deviceRepaired:wreck_salvage'],
            solids: [...c.collision.instances.keys()].filter(id => id.startsWith('wreck-part-')), saved: await s.saveController.save(false) };
    });
    expect(completed).toEqual({ scrap: 20, copper: 4, cache: true, fact: 1, solids: [], saved: true });
    await enter();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.allClaimed())).toBe(true);
    expect(errors).toEqual([]);
});
