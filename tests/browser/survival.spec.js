import { test, expect } from '@playwright/test';

for (const difficulty of ['relaxed', 'standard', 'harsh']) test(`${difficulty}: live damage, bed respawn, persistent death bags and capacity-limited recovery`, async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Survival ' + difficulty);
    await page.locator('#world-seed-input').fill('survival-live');
    await page.locator('#world-difficulty-input').selectOption(difficulty);
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const fixture = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.dayNight.timeOfDay = .45;
        for (const [id, count] of Object.entries({ wood: 5, rope: 2, fiber: 4 })) s.inventory.addItem(id, count);
        const spawn = s.world.spawnPosition; let bed, nearby, death;
        search: for (const radius of [16, 24, 32, 48]) for (let i = 0; i < 32; i++) {
            const x = spawn[0] + Math.cos(i * Math.PI / 16) * radius, z = spawn[2] + Math.sin(i * Math.PI / 16) * radius;
            if (!c.registry.preview('bed', [x, 0, z]).valid) continue;
            nearby = [x, s.terrain.getHeight(x, z - 1.8) + .9, z - 1.8];
            death = [x, s.terrain.getHeight(x, z - 8) + .9, z - 8];
            if (nearby[1] <= 1.1 || death[1] <= 1.1 || ![nearby, death].every(p => c.collision.capsuleClear(p, .28, 1.8))) continue;
            const result = c.registry.place('bed', [x, 0, z], 0, s.inventory);
            if (result.ok) { bed = result.structure; break search; }
        }
        if (!bed) throw new Error('No clear bed/death fixture site');
        s.player.position.set(nearby); s.player.velocity.fill(0); s.camera.setLookAngles(0);
        return { bed: bed.id, bedPosition: bed.position, nearby, death, spawn };
    });
    await page.keyboard.press('e'); await expect(page.locator('[data-action="bed"]')).toBeVisible();
    await page.locator('[data-action="bed"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.respawnBedId)).toBe(fixture.bed);
    await page.keyboard.press('Escape');
    const first = await page.evaluate(({ fixture }) => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const slots = Array(28).fill(null); slots[0] = { id: 'stone', count: 7 }; slots[1] = { id: 'dive_kit', count: 1 };
        slots[2] = { id: 'iron_ore', count: 5 }; slots[20] = { id: 'iron_axe', count: 1 }; s.inventory.restore(slots);
        c.progress.questItems.add('island_coordinates'); c.progress.blueprints.add('fishing_rod_blueprint');
        s.player.position.set(fixture.death); s.player.velocity.fill(0); c.respawnProtection = 0;
        s.vitals.reset(); s.vitals.applyDamage(10, 'browser-fixture'); const damage = 100 - s.vitals.health;
        s.vitals.applyDamage(1000, 'browser-fixture');
        return { damage, hungerRate: s.vitals.hungerDrainRate, thirstRate: s.vitals.thirstDrainRate,
            deaths: c.deaths, bags: c.deathBags.map(b => ({ id: b.id, position: b.position, slots: b.container.snapshot() })),
            position: [...s.player.position], clear: c.collision.capsuleClear(s.player.position, .28, 1.8),
            stone: s.inventory.getCount('stone'), axe: s.inventory.getCount('iron_axe'), kit: s.inventory.getCount('dive_kit'),
            quest: c.progress.questItems.has('island_coordinates'), blueprint: c.progress.blueprints.has('fishing_rod_blueprint'),
            classicGameOver: s._isGameOver, health: s.vitals.health, oxygen: c.oxygen };
    }, { fixture });
    const factor = difficulty === 'relaxed' ? .6 : difficulty === 'harsh' ? 1.4 : 1;
    expect(first.damage).toBeCloseTo(10 * factor); expect(first.hungerRate).toBeCloseTo(100 / 1500 * factor);
    expect(first.thirstRate).toBeCloseTo(100 / 1080 * factor); expect(first.deaths).toBe(1);
    expect(first.clear).toBe(true); expect(first.health).toBe(100); expect(first.classicGameOver).toBeFalsy();
    expect(first.quest && first.blueprint).toBe(true);
    expect(Math.hypot(first.position[0] - fixture.bedPosition[0], first.position[2] - fixture.bedPosition[2])).toBeLessThanOrEqual(4.1);
    expect(first.stone).toBe(difficulty === 'relaxed' ? 7 : 0); expect(first.kit).toBe(difficulty === 'relaxed' ? 1 : 0);
    expect(first.axe).toBe(difficulty === 'harsh' ? 0 : 1); expect(first.oxygen).toBe(difficulty === 'relaxed' ? 120 : 45);
    expect(first.bags.length).toBe(difficulty === 'relaxed' ? 0 : 1);
    if (first.bags[0]) expect(first.bags[0].position).toEqual(fixture.death.map(Math.fround));
    // Ordinary saves and actual reload, rather than restoring a fixture snapshot in memory.
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const restored = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign; s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        return { bags: c.deathBags.map(b => ({ id: b.id, position: b.position, slots: b.container.snapshot() })), deaths: c.deaths,
            bed: c.registry.respawnBedId, quest: c.progress.questItems.has('island_coordinates'), blueprint: c.progress.blueprints.has('fishing_rod_blueprint') };
    });
    expect(restored.bags).toEqual(first.bags); expect(restored.deaths).toBe(1); expect(restored.bed).toBe(fixture.bed);
    expect(restored.quest && restored.blueprint).toBe(true);
    if (difficulty !== 'relaxed') {
        await page.evaluate(position => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            const slots = Array.from({ length: 28 }, () => ({ id: 'wood', count: 99 })); slots[0] = { id: 'stone', count: 96 };
            s.inventory.restore(slots); s.player.position.set(position); s.player.velocity.fill(0);
        }, fixture.death);
        await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-body')).toContainText('Đồ đã rơi');
        await page.locator('[data-action="collect"][data-arg="stone"]').click();
        await expect(page.locator('#campaign-panel-feedback')).toContainText('còn 4');
        const partial = await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return { stone: s.inventory.getCount('stone'), left: s.campaign.deathBags[0].container.getCount('stone') }; });
        expect(partial).toEqual({ stone: 99, left: 4 });
        await page.locator('[data-action="collect"][data-arg="stone"]').click();
        expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.deathBags[0].container.getCount('stone'))).toBe(4);
        await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.inventory.slots[1] = null; s.campaign.ui.render(); });
        await page.locator('[data-action="collect"][data-arg="stone"]').click();
        const recovered = await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return { stone: s.inventory.getCount('stone'), left: s.campaign.deathBags[0].container.getCount('stone') }; });
        expect(recovered).toEqual({ stone: 103, left: 0 }); await page.keyboard.press('Escape');
    }
    // Remove the chosen bed through its panel, then die again with a distinct payload.
    await page.evaluate(fixture => {
        const s = window.__GAME_ENGINE__.scenes.activeScene; s.inventory.restore(Array(28).fill(null));
        s.player.position.set(fixture.nearby); s.player.velocity.fill(0); s.camera.setLookAngles(0);
    }, fixture);
    await page.keyboard.press('e'); await expect(page.locator('[data-action="dismantle"]')).toBeVisible();
    await page.locator('[data-action="dismantle"]').click(); await page.keyboard.press('Escape');
    const second = await page.evaluate(fixture => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, slots = Array(28).fill(null);
        slots[0] = { id: 'fiber', count: 9 }; slots[20] = { id: 'iron_axe', count: 1 }; s.inventory.restore(slots);
        s.player.position.set(fixture.death); s.player.velocity.fill(0); c.respawnProtection = 0; s.vitals.applyDamage(1000, 'browser-fixture');
        return { deaths: c.deaths, bed: c.registry.respawnBedId, bags: c.deathBags.map(b => ({ id: b.id, slots: b.container.snapshot() })),
            position: [...s.player.position], clear: c.collision.capsuleClear(s.player.position, .28, 1.8), quest: c.progress.questItems.has('island_coordinates') };
    }, fixture);
    expect(second.deaths).toBe(2); expect(second.bed).toBeNull(); expect(second.quest && second.clear).toBe(true);
    expect(Math.hypot(second.position[0] - fixture.spawn[0], second.position[2] - fixture.spawn[2])).toBeLessThanOrEqual(30.1);
    expect(second.bags.length).toBe(difficulty === 'relaxed' ? 0 : 2);
    if (second.bags.length) expect(second.bags.map(b => b.id)).toEqual(['death-bag-1', 'death-bag-2']);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; return { deaths: c.deaths, bed: c.registry.respawnBedId, bags: c.deathBags.map(b => ({ id: b.id, slots: b.container.snapshot() })) }; })).toEqual({ deaths: 2, bed: null, bags: second.bags });
    expect(errors).toEqual([]);
});
