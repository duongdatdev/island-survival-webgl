import { test, expect } from '@playwright/test';

test('combat and work poses render both hands, preserve equipment, and recover without runtime errors', async ({ page }) => {
    test.setTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Animation review');
    await page.locator('#world-seed-input').fill('animation-review');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        // Freeze simulation to capture reproducible contact keyframes while rendering stays active.
        s.isPaused = true;
        s.camera.setLookAngles(0, 0);
    });
    await page.screenshot({ path: '.cache/animation-review/idle.png' });
    for (const [id, time] of [['fist', 0.16], ['stone_axe', 0.24], ['spear', 0.28], ['bow', 0.8]]) {
        const pose = await page.evaluate(({ id, time }) => {
            const v = window.__GAME_ENGINE__.scenes.activeScene.firstPersonViewModel;
            v.cancel(); v.cancelActivity();
            if (id === 'bow') v.beginBowCharge(); else v.beginAttack(id);
            v.update(time, false);
            return v._getWeaponPose();
        }, { id, time });
        expect(Number.isFinite(pose.pitch)).toBe(true);
        await page.screenshot({ path: `.cache/animation-review/${id}-contact.png` });
    }
    for (const kind of ['mine', 'salvage', 'fish', 'hook', 'build', 'craft', 'cook', 'repair', 'pickup', 'eat', 'drink', 'swim']) {
        const state = await page.evaluate(kind => {
            const v = window.__GAME_ENGINE__.scenes.activeScene.firstPersonViewModel;
            v.cancel(); v.cancelActivity(); v.setWeapon('spear');
            if (['mine', 'salvage', 'fish', 'hook', 'swim'].includes(kind)) {
                v.setActivity({ kind, weapon: kind === 'mine' ? 'iron_pickaxe' : undefined, phase: 'reeling' });
            } else v.playAction(kind);
            v.update(0.32, false);
            return { equipped: v.weaponId, visible: v.visualWeaponId, work: v._getWeaponPose().work };
        }, kind);
        expect(state.equipped).toBe('spear');
        expect(state.work).toBe(kind);
        if (kind === 'mine') expect(state.visible).toBe('iron_pickaxe');
        if (kind === 'fish') expect(state.visible).toBe('fishing_rod');
        await page.screenshot({ path: `.cache/animation-review/${kind}.png` });
    }
    expect(errors).toEqual([]);
});
