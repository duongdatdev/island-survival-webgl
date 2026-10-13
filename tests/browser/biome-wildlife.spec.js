import { test, expect } from '@playwright/test';

test('biome wildlife renders and new population persists across reload', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Biome wildlife QA');
    await page.locator('#world-seed-input').fill('biome-wildlife-qa');
    await page.locator('#world-form button[type="submit"]').click();
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const result = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.dayNight.timeOfDay = .45; s.update(.01); s.isPaused = true;
        return {
            version: s.world.generatorVersion, count: s.creatures.length,
            loaded: ['deer', 'goat', 'monitor'].map(id => s.engine.assets.getModel('creature:' + id)?.drawables.length),
            trees: ['mangrovetree', 'acaciatree'].map(id => s.world.placedObjects.filter(o => o.id === id).length),
        };
    });
    expect(result.version).toBe(3); expect(result.count).toBe(62);
    expect(result.loaded).toEqual([1, 1, 1]);
    expect(result.trees.every(count => count > 0)).toBe(true);
    for (const [biome, lx, lz] of [['savanna', 150, -25], ['jungle', -130, 80], ['mangrove', 183, 139]]) {
        await page.evaluate(async ([lx, lz]) => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, g = s.world.terrainGenerator;
            const { Mat4 } = await import('/src/math/Mat4.js');
            const x = lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
            const z = lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
            const h = g.getHeight(x, z);
            s.player.position.set([x, h + 1, z]);
            s.camera.position.set([x + 25, h + 17, z + 27]);
            s.camera.target.set([x, h + 1, z]);
            Mat4.lookAt(s.camera.viewMatrix, s.camera.position, s.camera.target, [0, 1, 0]);
        }, [lx, lz]);
        await page.screenshot({ path: `.cache/browser-results/biome-${biome}.png` });
    }
    await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        const { Mat4 } = await import('/src/math/Mat4.js');
        const [x, h, z] = s.world.spawnPosition;
        for (const [index, species] of ['deer', 'goat', 'monitor'].entries()) {
            const animal = s.creatures.find(a => a.campaignId === species + '-0');
            const ax = x + (index - 1) * 2.2;
            animal.position.set([ax, s.terrain.getHeight(ax, z) + animal.meshScale[1] / 2, z]);
            animal.rotation[1] = 0; animal.rotation[2] = 0; animal.updateModelMatrix();
        }
        s.player.position.set([x, h + 1, z + 6]);
        s.camera.position.set([x + 2, h + 2.4, z + 7]);
        s.camera.target.set([x, h + .8, z]);
        Mat4.lookAt(s.camera.viewMatrix, s.camera.position, s.camera.target, [0, 1, 0]);
    });
    await page.screenshot({ path: '.cache/browser-results/biome-wildlife-lineup.png' });
    const saved = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        const monitor = s.creatures.find(a => a.campaignId === 'monitor-0');
        monitor.takeDamage(1000);
        const deer = s.creatures.find(a => a.campaignId === 'deer-0'); deer.takeDamage(7);
        s.player.position.set(s.world.spawnPosition); s.player.position[1] += .9;
        return { ok: await s.saveController.save(false), deerHealth: deer.health };
    });
    expect(saved.ok).toBe(true);
    await page.reload();
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#campaign-ui .campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const restored = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { version: s.world.generatorVersion, count: s.creatures.length,
            monitor: s.creatures.some(a => a.campaignId === 'monitor-0'),
            deerHealth: s.creatures.find(a => a.campaignId === 'deer-0').health };
    });
    expect(restored).toEqual({ version: 3, count: 61, monitor: false, deerHealth: saved.deerHealth });
    expect(errors).toEqual([]);
});
