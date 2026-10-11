import { test, expect } from '@playwright/test';

test('reduced motion can be enabled through settings, persists, and follows live OS changes without stopping movement', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-settings-btn').click();
    await page.locator('.settings-tab[data-tab="controls"]').click();
    const toggle = page.getByLabel('Giảm chuyển động', { exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toBeChecked();
    await expect(page.locator('#set-reduced-motion + .slider')).toHaveCSS('outline-width', '3px');
    await expect(page.locator('html')).toHaveClass(/reduced-motion/);
    await expect(page.locator('#set-reduced-motion + .slider')).toHaveCSS('transition-duration', '1e-05s');
    await page.screenshot({ path: '.cache/reduced-motion-results/settings.png' });
    await page.locator('#settings-done-btn').click();
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-settings-btn').click();
    await page.locator('.settings-tab[data-tab="controls"]').click(); await expect(toggle).toBeChecked();
    await page.locator('#settings-done-btn').click();
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Comfort controls');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.campaign.safetySeconds = 1000;
    });
    const reduced = () => page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { camera: s.movementFeedback.reducedMotion, hand: s.firstPersonViewModel.reducedMotion };
    });
    expect(await reduced()).toEqual({ camera: true, hand: true });
    const before = await page.evaluate(() => Array.from(window.__GAME_ENGINE__.scenes.activeScene.player.position));
    await page.keyboard.down('w'); await page.keyboard.down('Shift');
    try {
        await page.waitForFunction(before => {
            const p = window.__GAME_ENGINE__.scenes.activeScene.player.position;
            return Math.hypot(p[0] - before[0], p[2] - before[2]) > 1;
        }, before);
        expect(await page.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            return { offset: Array.from(s.camera._motionOffset), boost: s.movementFeedback.fovBoostDegrees };
        })).toEqual({ offset: [0, 0, 0], boost: 0 });
        const handFrames = await page.evaluate(async () => {
            const v = window.__GAME_ENGINE__.scenes.activeScene.firstPersonViewModel;
            await new Promise(requestAnimationFrame);
            const first = Array.from(v._handMatrix), time = v._time;
            await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
            return { first, second: Array.from(v._handMatrix), elapsed: v._time - time };
        });
        expect(handFrames.elapsed).toBeGreaterThan(0);
        expect(handFrames.second).toEqual(handFrames.first);
    } finally { await page.keyboard.up('w'); await page.keyboard.up('Shift'); }
    await page.keyboard.press('Escape'); await page.locator('#pause-settings-btn').click();
    await page.locator('.settings-tab[data-tab="controls"]').click();
    await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).not.toBeChecked();
    expect(await reduced()).toEqual({ camera: false, hand: false });
    await expect(page.locator('html')).not.toHaveClass(/reduced-motion/);
    // OS changes are applied while this same scene remains alive; no reload is needed.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(reduced).toEqual({ camera: true, hand: true });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(reduced).toEqual({ camera: false, hand: false });
    expect(errors).toEqual([]);
});
