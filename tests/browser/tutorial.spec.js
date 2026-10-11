import { test, expect } from '@playwright/test';

test('Campaign onboarding is independent of Classic, follows rebound pickup and real journal controls, and persists dismissal', async ({ page }) => {
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('island_survival_tutorial_done', 'true'));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Campaign onboarding'); await page.locator('#world-seed-input').fill('campaign-onboarding');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => { const input = window.__GAME_ENGINE__.input; input.setPointerLockEnabled(false); input.setBinding('interact', 'KeyF'); });
    await expect(page.locator('#tutorial-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#tutorial-step')).toHaveText('1 / 8');
    await page.keyboard.press('w', { delay: 150 });
    await expect(page.locator('#tutorial-step')).toHaveText('2 / 8');
    await page.evaluate(() => window.__GAME_ENGINE__.input.setPointerLockEnabled(true));
    await page.mouse.click(450, 350);
    await page.waitForFunction(() => window.__GAME_ENGINE__.input.mouse.isLocked);
    await page.mouse.move(500, 400, { steps: 5 });
    await expect(page.locator('#tutorial-step')).toHaveText('3 / 8');
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.engine.input.setPointerLockEnabled(false); s.engine.input.releasePointerLock();
    });
    // Releasing an acquired lock intentionally opens the real pause menu.
    await expect(page.locator('#pause-menu')).toBeVisible(); await page.locator('#pause-resume-btn').click();
    await expect(page.locator('#pause-menu')).toBeHidden();
    await expect(page.locator('#tutorial-text')).toContainText('F');
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const resource = s.resourceManager.worldResources.find(r => ['stone', 'wood', 'fiber'].includes(r.resourceId)
            && Object.values(c.journals).every(j => Math.hypot(j.position[0] - r.position[0], j.position[2] - r.position[2]) > 6));
        if (!resource) throw new Error('No pickup approach');
        s.player.position.set([resource.position[0], s.terrain.getHeight(resource.position[0], resource.position[2] + 1.5) + .9, resource.position[2] + 1.5]);
        s.player.velocity.fill(0); s.camera.setLookAngles(Math.PI, -.3); s.player.rotation[1] = Math.PI;
    });
    await page.keyboard.press('f'); await expect(page.locator('#tutorial-step')).toHaveText('4 / 8');
    await expect(page.locator('#tutorial-text')).toContainText('Nhật ký');
    await page.keyboard.press('j'); await expect(page.locator('#campaign-panel-title')).toHaveText('Nhật ký chiến dịch');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.tutorial._panelsSeen.has('journal'))).toBe(true);
    await page.keyboard.press('Escape'); await expect(page.locator('#tutorial-step')).toHaveText('5 / 8');
    await page.screenshot({ path: '.cache/tutorial-results/campaign-build-hint.png' });
    await page.locator('#tutorial-skip').click(); await expect(page.locator('#tutorial-overlay')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => [localStorage.getItem('island_survival_tutorial_done'), localStorage.getItem('island_survival_campaign_tutorial_done')])).toEqual(['true', 'true']);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.tutorial.isComplete)).toBe(true);
    await expect(page.locator('#tutorial-overlay')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
});
