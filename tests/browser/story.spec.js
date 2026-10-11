import { test, expect } from '@playwright/test';

test('station gate, installed circuit, partial resume and coordinates follow actual interaction controls', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Station repairs'); await page.locator('#world-seed-input').fill('station-repairs');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const station = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, p = s.world.pois.find(p => p.id === 'weather_station').position;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(true); s.dayNight.timeOfDay = 0.45; c.respawnProtection = 1000;
        c.progress.chapter = 4; c.progress.tier = 2; c.progress.completedChapters = new Set([1, 2, 3]);
        // This focused console story starts after the field expedition, covered by survey.spec.js.
        c.fieldSurvey.wind.readings = [...c.fieldSurvey.layout.wind]; c.fieldSurvey.wind.angle = c.fieldSurvey.wind.readings[2]; c.fieldSurvey.wind.moves = 6;
        c.fieldSurvey.water.levels = [...c.fieldSurvey.layout.water]; c.fieldSurvey.water.complete = true; c.fieldSurvey.water.moves = c.fieldSurvey.layout.waterMinimumMoves + 1;
        const [x, y, z] = c.fieldSurvey.layout.pressure, a = (4 * x - 2 * y + z) / 9, b = x - 2 * a;
        c.fieldSurvey.pressure.valves = [a, b, y - 2 * b]; c.fieldSurvey.pressure.complete = true; c.fieldSurvey.pressure.moves = c.fieldSurvey.pressure.valves.reduce((sum, value) => sum + value, 0) + 1;
        for (const id of ['wind', 'water', 'pressure']) c.events.emit('deviceRepaired', { id: 'survey_' + id });
        s.player.position.set([p[0], p[1] + 0.9, p[2] + 4.5]);
        s.player.rotation[1] = Math.PI; s.camera._yaw = s.camera._smoothYaw = Math.PI; s.camera._firstUpdate = true;
        s.inventory.addItem('iron_ingot', 8); s.inventory.addItem('copper_ingot', 4); return p;
    });
    await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.player.position[2])).toBeGreaterThan(station[2] + 3.26);
    await page.keyboard.down('e'); await expect(page.locator('#pickup-notification')).toContainText('cuốc sắt'); await page.keyboard.up('e');
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.addItem('iron_pickaxe', 1));
    await page.keyboard.down('e'); await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['deviceRepaired:station_gate']); await page.keyboard.up('e');
    await page.keyboard.down('w');
    try { await page.waitForFunction(z => window.__GAME_ENGINE__.scenes.activeScene.player.position[2] < z + 0.5, station[2], { timeout: 20000 }); }
    finally { await page.keyboard.up('w'); }
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.player.position[2])).toBeLessThan(station[2] + 2);
    await page.keyboard.down('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Khôi phục bảng điều khiển'); await page.keyboard.up('e');
    await expect(page.locator('[data-action="repair-test"]')).toBeDisabled();
    await page.locator('[data-action="repair-install"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('iron_ingot'))).toBe(4);
    await page.locator('[data-action="repair-test"]').click(); await expect(page.locator('#campaign-panel-feedback')).toContainText('Chưa nối đủ');
    await page.locator('[data-action="repair-rotate"][data-arg="7"]').click();
    await page.keyboard.press('ArrowRight'); await expect(page.locator('[data-action="repair-rotate"][data-arg="8"]')).toBeFocused();
    await page.keyboard.press('Enter');
    const saved = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.stationCircuit.snapshot());
    await expect.poll(() => page.evaluate(async expected => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, stored = await s.engine.worldRepository.loadWorld(s.activeWorldId);
        return s.isPaused && JSON.stringify(stored?.campaign.stationCircuit) === JSON.stringify(expected);
    }, saved), { timeout: 20000 }).toBe(true);
    await page.screenshot({ path: '.cache/browser-results/station-circuit-partial.png' });
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 }); await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.stationCircuit.snapshot())).toEqual(saved);
    await page.evaluate(() => window.__GAME_ENGINE__.input.setPointerLockEnabled(false));
    await page.keyboard.down('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Khôi phục bảng điều khiển'); await page.keyboard.up('e');
    await expect(page.locator('[data-action="repair-install"]')).toHaveCount(0);
    // Fixture solution supplies known rotations; all player operations still use rendered tile controls.
    const rotations = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.stationCircuit.rotations);
    for (let index = 0; index < 25; index++) for (let turn = 0; turn < (4 - rotations[index]) % 4; turn++) await page.locator(`[data-action="repair-rotate"][data-arg="${index}"]`).click();
    await page.locator('[data-action="repair-test"]').click(); await expect(page.locator('.repair-status')).toContainText('Đã sửa xong');
    await page.locator('[data-action="journal"][data-arg="station_coordinates"]').click();
    const result = await page.evaluate(async () => { const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign; return { chapter: c.progress.chapter, tier: c.progress.tier,
        coordinates: c.progress.questItems.has('island_coordinates'), iron: s.inventory.getCount('iron_ingot'), copper: s.inventory.getCount('copper_ingot'), saved: await s.saveController.save(false) }; });
    expect(result).toEqual({ chapter: 5, tier: 3, coordinates: true, iron: 4, copper: 2, saved: true }); expect(errors).toEqual([]);
});
