import { test, expect } from '@playwright/test';

test('local clues lead to six outdoor records, read by walking and interaction with persistent unique progress', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Island records'); await page.locator('#world-seed-input').fill('island-records-search');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.tutorial.skip();
        s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000; s.dayNight.timeOfDay = .45;
    });
    // Position fixtures isolate the last approach, not whole-island travel or human search duration.
    for (let i = 1; i <= 6; i++) {
        const id = 'optional_' + i;
        const start = await page.evaluate(id => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, site = s.campaign.landmarks.journalSearchSites[id];
            const x = site.base[0], z = site.base[2] - 3.5;
            s.player.position.set([x, s.terrain.getHeight(x, z) + .9, z]); s.player.velocity.fill(0);
            s.camera.setLookAngles(0, -.3); s.player.rotation[1] = 0;
            return { z, target: site.base[2], clue: site.clue, clueId: site.clueId };
        }, id);
        if (i === 1) {
            expect(await page.evaluate(id => {
                const s = window.__GAME_ENGINE__.scenes.activeScene;
                s.inventory.addItem('wood', 4);
                const before = JSON.stringify(s.inventory.snapshot());
                const result = s.campaign.registry.place('foundation', s.campaign.landmarks.journalSearchSites[id].base, 0, s.inventory);
                return { ok: result.ok, unchanged: before === JSON.stringify(s.inventory.snapshot()) };
            }, id)).toEqual({ ok: false, unchanged: true });
            // The same seed-specific clue renders when rereading a local record from the journal UI.
            await page.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('note', id), start.clueId);
            await expect(page.locator('.campaign-note')).toContainText(start.clue);
            await page.screenshot({ path: '.cache/journal-search-browser-results/local-clue.png' });
            await page.keyboard.press('Escape');
        }
        await page.keyboard.down('w');
        await page.waitForFunction(target => window.__GAME_ENGINE__.scenes.activeScene.player.position[2] > target - 2, start.target);
        await page.keyboard.up('w');
        expect(await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return s.campaign.collision.capsuleClear(s.player.position, .28, 1.8); })).toBe(true);
        if (i === 3) await page.screenshot({ path: '.cache/journal-search-browser-results/trail-crate.png' });
        await expect(async () => {
            await page.keyboard.press('e');
            await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được', { timeout: 500 });
            await expect(page.locator('.campaign-note')).toBeVisible({ timeout: 500 });
        }).toPass({ timeout: 5000 });
        expect(await page.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.journals.has(id), id)).toBe(true);
        if (i === 3) await page.screenshot({ path: '.cache/journal-search-browser-results/outdoor-record.png' });
        await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['optionalJournalRead:'])).toBe(6);
    // Rereading a found record does not count it twice.
    await page.keyboard.press('e'); await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['optionalJournalRead:'])).toBe(6);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['optionalJournalRead:'])).toBe(6);
    await page.locator('[data-action="panel"][data-arg="journal"]').click();
    for (let i = 1; i <= 6; i++) await expect(page.locator(`[data-action="journal"][data-arg="optional_${i}"]`)).toBeVisible();
});
