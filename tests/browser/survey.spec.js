import { test, expect } from '@playwright/test';

async function close(page) {
    await page.keyboard.down('Escape');
    try { await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.isOpen); }
    finally { await page.keyboard.up('Escape'); }
}
async function visit(page, id) {
    await page.evaluate(id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, p = s.campaign.landmarks.surveyStations[id].position;
        s.player.position.set([p[0], p[1] + 0.1, p[2] + 2.2]); s.player.velocity.fill(0);
        s.player.rotation[1] = Math.PI; s.camera._yaw = s.camera._smoothYaw = Math.PI; s.camera._firstUpdate = true;
    }, id);
    await page.keyboard.down('e');
    try { await page.waitForFunction(id => { const ui = window.__GAME_ENGINE__.scenes.activeScene.campaign.ui; return ui.isOpen && ui.kind === 'field-survey' && ui.argument === id; }, id); }
    finally { await page.keyboard.up('e'); }
}
async function angle(page, value) {
    const slider = page.locator('[data-survey-wind]'); await slider.focus(); await page.keyboard.press('Home');
    for (let step = 0; step < value / 5; step++) await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue(String(value)); await expect(slider).toBeFocused();
}

test('three actual field devices preserve partial calibration and unlock station coordinates only with all readings', async ({ page }) => {
    test.setTimeout(210000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Field expedition'); await page.locator('#world-seed-input').fill('field-expedition');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, p = s.world.pois.find(p => p.id === 'weather_station').position;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(true); s.dayNight.timeOfDay = 0.45; c.respawnProtection = 1000;
        c.progress.chapter = 4; c.progress.tier = 2; c.progress.completedChapters = new Set([1, 2, 3]);
        c.progress.lastMilestone = 'Dưới lòng đảo';
        c.stationCircuit.installed = c.stationCircuit.solved = true; c.stationCircuit.rotations.fill(0); c.stationCircuit.attempts = 1;
        c.events.emit('deviceRepaired', { id: 'station_gate' }); c.events.emit('deviceRepaired', { id: 'station_console' });
        s.player.position.set([p[0] + 1.7, p[1] + 1.1, p[2] - 1]); s.player.velocity.fill(0);
    });
    await page.keyboard.down('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Đối chiếu thiết bị ngoài hiện trường'); await page.keyboard.up('e');
    await expect(page.locator('[data-action="journal"][data-arg="station_coordinates"]')).toBeDisabled();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.input.pointerLockEnabled)).toBe(false);
    await close(page); await visit(page, 'wind');
    const targets = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fieldSurvey.layout);
    await angle(page, (targets.wind[0] + 45) % 360); await page.locator('[data-arg="wind:measure"]').click();
    await expect(page.locator('#campaign-panel-feedback')).toContainText('Kim chưa trùng');
    await angle(page, targets.wind[0]); await page.locator('[data-arg="wind:measure"]').click();
    await expect(page.locator('#campaign-panel-body')).toContainText('1/3 mẫu');
    await close(page); await visit(page, 'water'); await page.locator('[data-arg="water:pour:0,1"]').click();
    await page.locator('[data-arg="water:test"]').click(); await expect(page.locator('#campaign-panel-feedback')).toContainText('chưa khớp');
    await close(page); await visit(page, 'pressure'); await page.locator('[data-arg="pressure:turn:0,1"]').click();
    const partial = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fieldSurvey.snapshot());
    await expect.poll(() => page.evaluate(async expected => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, saved = await s.engine.worldRepository.loadWorld(s.activeWorldId);
        return JSON.stringify(saved?.campaign.fieldSurvey) === JSON.stringify(expected);
    }, partial), { timeout: 20000 }).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fieldSurvey.snapshot())).toEqual(partial);
    await expect(page.locator('#objective-tracker')).toContainText('Gần nhất: Dưới lòng đảo');
    await expect(page.locator('#objective-tracker')).toContainText('Hiệu chỉnh cột gió');
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.campaign.respawnProtection = 0; s.vitals.applyDamage(200, 'field-test');
        return { survey: s.campaign.fieldSurvey.snapshot(), deaths: s.campaign.deaths, health: s.vitals.health };
    })).toEqual({ survey: partial, deaths: 1, health: 100 });
    await page.evaluate(() => window.__GAME_ENGINE__.input.setPointerLockEnabled(true));
    await visit(page, 'wind');
    for (const value of targets.wind.slice(1)) { await angle(page, value); await page.locator('[data-arg="wind:measure"]').click(); }
    await expect(page.locator('[data-arg="wind:measure"]')).toBeDisabled(); await page.screenshot({ path: '.cache/browser-results/survey-wind.png' });
    await close(page); await visit(page, 'water'); await page.locator('[data-arg="water:reset"]').click();
    const route = await page.evaluate(async target => {
        const { waterSurveyStates } = await import('/src/systems/FieldSurvey.js');
        return waterSurveyStates().find(node => node.levels.every((value, i) => value === target[i])).route;
    }, targets.water);
    for (const [from, to] of route) await page.locator(`[data-arg="water:pour:${from},${to}"]`).click();
    await page.locator('[data-arg="water:test"]').click(); await expect(page.locator('[data-arg="water:test"]')).toBeDisabled();
    await page.screenshot({ path: '.cache/browser-results/survey-water.png' });
    await close(page); await visit(page, 'pressure'); await page.locator('[data-arg="pressure:reset"]').click();
    const [x, y, z] = targets.pressure, a = (4 * x - 2 * y + z) / 9, b = x - 2 * a, solution = [a, b, y - 2 * b];
    for (let index = 0; index < 3; index++) for (let step = 0; step < solution[index]; step++) await page.locator(`[data-arg="pressure:turn:${index},1"]`).click();
    await page.locator('[data-arg="pressure:test"]').click(); await expect(page.locator('[data-arg="pressure:test"]')).toBeDisabled();
    await page.screenshot({ path: '.cache/browser-results/survey-pressure.png' });
    await close(page);
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, p = s.world.pois.find(p => p.id === 'weather_station').position;
        s.player.position.set([p[0] + 1.7, p[1] + 1.1, p[2] - 1]); s.player.velocity.fill(0);
    });
    await page.keyboard.down('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được'); await page.keyboard.up('e');
    const result = await page.evaluate(async () => { const s = window.__GAME_ENGINE__.scenes.activeScene; return { done: s.campaign.fieldSurvey.allComplete(),
        chapter: s.campaign.progress.chapter, tier: s.campaign.progress.tier, coordinates: s.campaign.progress.questItems.has('island_coordinates'), saved: await s.saveController.save(false) }; });
    expect(result).toEqual({ done: true, chapter: 5, tier: 3, coordinates: true, saved: true }); expect(errors).toEqual([]);
});
