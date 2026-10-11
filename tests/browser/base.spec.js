import { test, expect } from '@playwright/test';

async function start(page, name) {
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill(name); await page.locator('#world-seed-input').fill('base-ui');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    return page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); c.progress.tier = 3; s.dayNight.timeOfDay = 0.45;
        for (const [id, count] of Object.entries({ wood: 198, stone: 99, rope: 30, fiber: 40, iron_ingot: 30,
            iron_ore: 20, charcoal: 20, carrot_seed: 4, fresh_water: 20, barrel: 10, torch: 1 })) {
            if (!s.inventory.addItem(id, count)) throw new Error('supplies do not fit');
        }
        let origin;
        const spawn = s.world.spawnPosition;
        for (const radius of [8, 12, 16, 24, 32, 48]) {
            for (let index = 0; index < 32; index++) {
                const angle = index * Math.PI / 16;
                const foundation = c.registry.preview('foundation', [spawn[0] + Math.cos(angle) * radius, 0, spawn[2] + Math.sin(angle) * radius]);
                if (!foundation.valid) continue;
                const p = foundation.record.position;
                if ([['smelter', 8, 0], ['chest', 11, 0], ['planter', 0, 6], ['workbench', 4, 6]].every(([type, dx, dz]) => c.registry.preview(type, [p[0] + dx, 0, p[2] + dz]).valid)) { origin = p; break; }
            }
            if (origin) break;
        }
        if (!origin) throw new Error('no base fixture location');
        s.player.position.set([origin[0], s.terrain.getHeight(origin[0], origin[2] - 3) + 0.9, origin[2] - 3]);
        s.player.rotation[1] = 0; s.camera._yaw = s.camera._smoothYaw = 0; s.camera._firstUpdate = true;
        return origin;
    });
}
async function build(page, type, rotations = 0) {
    await page.keyboard.down('b'); await expect(page.locator('#campaign-panel')).toBeVisible(); await page.keyboard.up('b');
    await page.locator(`[data-action="build"][data-arg="${type}"]`).click();
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.placement?.preview?.valid);
    for (let i = 1; i <= rotations; i++) {
        await page.keyboard.down('r'); await page.waitForFunction(turns => Math.abs(window.__GAME_ENGINE__.scenes.activeScene.campaign.placement.yaw - turns * Math.PI / 2) < 1e-5, i);
        await page.keyboard.up('r');
    }
    await page.keyboard.down('e'); await page.waitForFunction(type => [...window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.values()].some(r => r.type === type), type);
    await page.keyboard.up('e');
}

test('the actual workbench tabletop blocks a standing player while its side remains walkable', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, 'Workbench clearance'); await build(page, 'workbench');
    await page.keyboard.down('Escape');
    await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.placement);
    await page.keyboard.up('Escape');
    const fixture = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const bench = [...c.registry.structures.values()].find(r => r.type === 'workbench');
        const geometry = s.engine.assets.getModel('campaign:survival_workbench').collisionGeometry;
        let minZ = Infinity, maxX = -Infinity;
        for (let i = 0; i < geometry.length; i += 3) { minZ = Math.min(minZ, geometry[i + 2]); maxX = Math.max(maxX, geometry[i]); }
        if (Math.abs(bench.yaw) > 1e-5) throw new Error('fixture requires unrotated bench');
        const origin = [bench.position[0], s.terrain.getHeight(bench.position[0], bench.position[2] + minZ - 2) + 0.9, bench.position[2] + minZ - 2];
        s.player.position.set(origin); s.player.rotation[1] = 0; s.camera.setLookAngles(0); s.camera._firstUpdate = true;
        c.respawnProtection = 1000; s.weather.currentWeather = 'clear'; s.weather.nextWeather = 'clear';
        return { origin, front: bench.position[2] + minZ, side: bench.position[0] + maxX + 1, centerZ: bench.position[2] };
    });
    await page.keyboard.down('w');
    await page.waitForFunction(front => window.__GAME_ENGINE__.scenes.activeScene.player.position[2] > front - 0.7, fixture.front);
    await page.waitForTimeout(1200); await page.keyboard.up('w');
    const blocked = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { position: [...s.player.position], clear: s.campaign.collision.capsuleClear(s.player.position) };
    });
    expect(blocked.position[2]).toBeLessThan(fixture.front + 0.05); expect(blocked.clear).toBe(true);
    await page.screenshot({ path: '.cache/browser-results/workbench-head-clearance.png' });
    await page.evaluate(f => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.player.position.set([f.side, s.terrain.getHeight(f.side, f.origin[2]) + 0.9, f.origin[2]]);
    }, fixture);
    await page.keyboard.down('w');
    await page.waitForFunction(z => window.__GAME_ENGINE__.scenes.activeScene.player.position[2] > z + 1, fixture.centerZ);
    await page.keyboard.up('w');
    const legacy = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const bench = [...c.registry.structures.values()].find(r => r.type === 'workbench');
        s.player.position.set([bench.position[0], bench.position[1] + 0.9, bench.position[2]]);
        if (c.collision.capsuleClear(s.player.position)) throw new Error('legacy fixture must intersect the real tabletop');
        const result = { benchId: bench.id, position: [...s.player.position], wood: s.inventory.getCount('wood') };
        if (!await s.saveController.save(false)) throw new Error('legacy fixture save failed'); return result;
    });
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const recovered = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        return { position: [...s.player.position], clear: c.collision.capsuleClear(s.player.position),
            benchId: [...c.registry.structures.values()].find(r => r.type === 'workbench')?.id, wood: s.inventory.getCount('wood') };
    });
    expect(recovered.clear).toBe(true); expect(recovered.benchId).toBe(legacy.benchId); expect(recovered.wood).toBe(legacy.wood);
    expect(Math.hypot(recovered.position[0] - legacy.position[0], recovered.position[2] - legacy.position[2])).toBeLessThan(3);
    expect(errors).toEqual([]);
});

test('foundation, floor, roof and bed build through controls; roof permits sleep without walls and the bed persists as a safe respawn', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const origin = await start(page, 'Base construction');
    for (const type of ['foundation', 'floor', 'roof', 'bed']) await build(page, type);
    await page.keyboard.down('Escape'); await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.placement); await page.keyboard.up('Escape');
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene, r = [...s.campaign.registry.structures.values()].find(r => r.type === 'foundation'); s.campaign.ui.open('structure', r.id); });
    await page.locator('[data-action="dismantle"]').click(); await expect(page.locator('#campaign-panel-feedback')).toContainText('bộ phận gắn vào');
    await page.evaluate(origin => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, bed = [...c.registry.structures.values()].find(r => r.type === 'bed');
        s.player.position.set([origin[0] + 0.8, origin[1] + 1.3, origin[2]]); s.dayNight.timeOfDay = 0.9;
        s.exposure.setState({ warmth: 100, wetness: 0 }); s.vitals.hunger = s.vitals.thirst = 100;
        c.ui.open('structure', bed.id);
    }, origin);
    await page.locator('[data-action="bed"]').click();
    await expect(page.locator('[data-action="sleep"]')).toBeEnabled(); await expect(page.locator('#campaign-panel-body')).toContainText('đói −');
    const before = await page.evaluate(() => ({ actual: window.__GAME_ENGINE__.scenes.activeScene.campaign.playSeconds, sim: window.__GAME_ENGINE__.scenes.activeScene.survivalSeconds }));
    await page.locator('[data-action="sleep"]').click(); await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.stats.nightsSurvived === 1);
    const after = await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return { actual: s.campaign.playSeconds, sim: s.survivalSeconds, warmth: s.exposure.warmth, wetness: s.exposure.wetness }; });
    expect(after.actual - before.actual).toBeLessThan(2); expect(after.sim - before.sim).toBeGreaterThan(530); expect(after.wetness).toBe(0);
    await page.screenshot({ path: '.cache/browser-results/base-roof-bed.png' });
    const saved = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign; c.respawnProtection = 0;
        s.vitals.applyDamage(200, 'test'); const p = Array.from(s.player.position), previous = [...p]; c.collision.resolve(p, previous, 0.28, 1.8);
        return { saved: await s.saveController.save(false), id: c.registry.respawnBedId, near: Math.hypot(s.player.position[0] - c.registry.structures.get(c.registry.respawnBedId).position[0], s.player.position[2] - c.registry.structures.get(c.registry.respawnBedId).position[2]), clear: Math.hypot(p[0] - previous[0], p[2] - previous[2]) < 0.02 };
    });
    expect(saved.saved).toBe(true); expect(saved.near).toBeLessThan(5); expect(saved.clear).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 }); await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.respawnBedId)).toBe(saved.id); expect(errors).toEqual([]);
});

test('chest consent, five-job queue, cancellation, fuel, full output and partial collection use actual station buttons and reload intact', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const origin = await start(page, 'Base production');
    const ids = await page.evaluate(origin => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const smelter = c.registry.place('smelter', [origin[0] + 8, 0, origin[2]], 0, s.inventory).structure;
        const chest = c.registry.place('chest', [origin[0] + 11, 0, origin[2]], 0, s.inventory).structure;
        if (!smelter || !chest) throw new Error('base placements failed');
        s.player.position.set([smelter.position[0], smelter.position[1] + 0.9, smelter.position[2] - 1.3]);
        c.ui.open('structure', chest.id); return { smelter: smelter.id, chest: chest.id };
    }, origin);
    await page.locator('[data-action="store"][data-arg="iron_ore"]').click();
    await page.evaluate(ids => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('structure', ids.smelter), ids);
    await expect(page.locator('[data-action="craft"][data-arg="iron_ingot"]')).toBeDisabled();
    await page.evaluate(ids => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('structure', ids.chest), ids);
    await page.locator('[data-action="craft-source"]').click();
    await page.evaluate(ids => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('structure', ids.smelter), ids);
    for (let i = 0; i < 5; i++) await page.locator('[data-action="craft"][data-arg="iron_ingot"]').click();
    await expect(page.locator('[data-action="craft"][data-arg="iron_ingot"]')).toBeDisabled();
    await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(1); c.ui.render(); });
    await expect(page.locator('#campaign-panel-body')).toContainText('Hết nhiên liệu');
    await page.locator('[data-action="cancel-job"]').first().click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('iron_ore'))).toBe(2);
    await page.locator('[data-action="fuel"][data-arg="charcoal"]').click();
    const full = await page.evaluate(ids => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, r = c.registry.structures.get(ids.smelter);
        r.container.slots.fill(null); r.container.slots.forEach((_, i) => { r.container.slots[i] = { id: 'stone', count: 99 }; });
        const fuel = r.fuelSeconds; c.production.update(180); c.ui.render(); return { fuel, remaining: r.fuelSeconds, progress: r.jobs[0].progress, burning: c.production.isBurning(r) };
    }, ids);
    expect(full.remaining).toBe(full.fuel); expect(full.progress).toBe(0); expect(full.burning).toBe(false);
    await expect(page.locator('#campaign-panel-body')).toContainText('Kho đầu ra đầy');
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.inventory.slots.forEach((_, i) => { s.inventory.slots[i] = { id: 'wood', count: 99 }; }); s.inventory.slots[0] = null; });
    await page.locator('[data-action="collect"][data-arg="stone"]').first().click();
    await expect(page.locator('#campaign-panel-feedback')).toContainText('còn 693');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('stone'))).toBe(99);
    await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(90); c.ui.render(); });
    await expect(page.locator('[data-action="collect"][data-arg="iron_ingot"]')).toBeVisible();
    await page.screenshot({ path: '.cache/browser-results/base-station-queue.png' });
    expect(await page.evaluate(async () => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 }); await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const restored = await page.evaluate(ids => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign, r = c.registry.structures.get(ids.smelter); return { consent: c.registry.structures.get(ids.chest).allowCrafting, jobs: r.jobs.length, output: r.container.getCount('iron_ingot') }; }, ids);
    expect(restored).toEqual({ consent: true, jobs: 2, output: 2 }); expect(errors).toEqual([]);
});

test('crop watering/rain, herb harvest, upgraded water storage, smoker fuel and fish traps work through panels and persist', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const origin = await start(page, 'Base farming');
    const ids = await page.evaluate(origin => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.inventory.addItem('herb_seed', 2); s.inventory.addItem('raw_fish', 2);
        const place = (type, preferred) => {
            for (const radius of [0, 2, 4, 6, 8, 12]) for (let i = 0; i < 16; i++) {
                const p = [preferred[0] + Math.cos(i * Math.PI / 8) * radius, 0, preferred[2] + Math.sin(i * Math.PI / 8) * radius];
                const result = c.registry.place(type, p, 0, s.inventory); if (result.ok) return result.structure;
            }
            throw new Error('cannot place ' + type);
        };
        const planter = place('planter', [origin[0], 0, origin[2] + 6]), tank = place('large_water_collector', [origin[0] + 4, 0, origin[2] + 2]), smoker = place('smoker', [origin[0] + 8, 0, origin[2] + 4]);
        s.player.position.set([planter.position[0], planter.position[1] + 0.9, planter.position[2] - 1.4]); c.ui.open('structure', planter.id);
        return { planter: planter.id, tank: tank.id, smoker: smoker.id };
    }, origin);
    await page.locator('[data-action="plant"][data-arg="carrot"]').click(); await expect(page.locator('[data-action="harvest"]')).toBeDisabled();
    await page.locator('[data-action="water"]').click();
    const dry = await page.evaluate(ids => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(600); c.production.update(600); c.ui.render();
        return c.registry.structures.get(ids.planter).crop;
    }, ids);
    expect(dry.progress).toBe(600); expect(dry.waterSeconds).toBe(0); await expect(page.locator('[data-action="harvest"]')).toBeDisabled();
    await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(1200, { rainFactor: 1 }); c.ui.render(); });
    await page.locator('[data-action="harvest"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('carrot'))).toBe(3);
    await page.locator('[data-action="plant"][data-arg="herb"]').click();
    await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(1200, { rainFactor: 1 }); c.ui.render(); });
    await page.locator('[data-action="harvest"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('herb'))).toBe(3);
    await page.evaluate(ids => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('structure', ids.tank), ids);
    await expect(page.locator('#campaign-panel-body')).toContainText('15/15'); await page.locator('[data-action="drink-source"]').click();
    await expect(page.locator('#campaign-panel-body')).toContainText('14/15');
    await page.evaluate(ids => { const s = window.__GAME_ENGINE__.scenes.activeScene, r = s.campaign.registry.structures.get(ids.smoker); s.player.position.set([r.position[0], r.position[1] + 0.9, r.position[2] - 1.4]); s.campaign.ui.open('structure', ids.smoker); }, ids);
    await page.locator('[data-action="craft"][data-arg="smoked_meal"]').click(); await page.locator('[data-action="fuel"][data-arg="charcoal"]').click();
    await page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; c.production.update(300, { rainFactor: 1 }); c.ui.render(); });
    await page.locator('[data-action="collect"][data-arg="smoked_meal"]').click();
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('smoked_meal'))).toBe(1);
    const trapId = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign, island = s.world.terrainGenerator.island;
        const angle = Math.atan2(s.world.spawnPosition[2], s.world.spawnPosition[0]); let trap;
        coastSearch: for (const delta of [0, 0.03, -0.03, 0.06]) for (const extent of [1, 2, 3, 4]) {
            const p = [Math.cos(angle + delta) * (island.radius + extent), 0, Math.sin(angle + delta) * (island.radius + extent)];
            const result = c.registry.place('fish_trap', p, 0, s.inventory); if (result.ok) { trap = result.structure; break coastSearch; }
        }
        if (!trap) throw new Error('no shallow trap position'); c.production.update(300); c.ui.open('structure', trap.id); return trap.id;
    });
    await page.locator('[data-action="collect"][data-arg="raw_fish"]').click();
    expect(await page.evaluate(async () => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 }); await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const restored = await page.evaluate(({ ids, trapId }) => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; return { crop: c.registry.structures.get(ids.planter).crop, tank: c.registry.structures.get(ids.tank).waterStored, trap: c.registry.structures.get(trapId).type }; }, { ids, trapId });
    expect(restored).toEqual({ crop: null, tank: 15, trap: 'fish_trap' }); expect(errors).toEqual([]);
});

test('R rotates a real doorway; E opens its blocking door and the build manager dismantles dependent parts in order', async ({ page }) => {
    test.setTimeout(150000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, 'Base doors'); await build(page, 'foundation'); await build(page, 'doorway', 1); await build(page, 'door');
    await page.keyboard.down('Escape'); await page.waitForFunction(() => !window.__GAME_ENGINE__.scenes.activeScene.campaign.placement); await page.keyboard.up('Escape');
    const records = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const frame = [...c.registry.structures.values()].find(r => r.type === 'doorway'), door = [...c.registry.structures.values()].find(r => r.type === 'door'), foundation = [...c.registry.structures.values()].find(r => r.type === 'foundation');
        s.player.position.set([frame.position[0] - 1, foundation.position[1] + 1.1, frame.position[2]]);
        s.player.rotation[1] = frame.yaw; s.camera._yaw = s.camera._smoothYaw = frame.yaw; s.camera._firstUpdate = true;
        return { frame: frame.id, door: door.id, foundation: foundation.id, x: frame.position[0], yaw: frame.yaw };
    });
    expect(records.yaw).toBeCloseTo(Math.PI / 2);
    await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.player.position[0])).toBeLessThan(records.x - 0.26);
    await page.keyboard.down('e'); await page.waitForFunction(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id).open, records.door); await page.keyboard.up('e');
    await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.player.position[0])).toBeGreaterThan(records.x + 0.4);
    await page.keyboard.down('b'); await expect(page.locator('#campaign-panel')).toBeVisible(); await page.keyboard.up('b');
    await page.locator(`[data-action="inspect-structure"][data-arg="${records.foundation}"]`).click();
    await page.locator('[data-action="dismantle"]').click(); await expect(page.locator('#campaign-panel-feedback')).toContainText('bộ phận gắn vào');
    await page.locator('[data-action="close"]').click(); await page.keyboard.down('b'); await expect(page.locator('#campaign-panel')).toBeVisible(); await page.keyboard.up('b');
    const before = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'));
    await page.locator(`[data-action="inspect-structure"][data-arg="${records.door}"]`).click();
    await expect(page.locator('[data-action="toggle-door"]')).toHaveText('Đóng cửa');
    await page.locator('[data-action="toggle-door"]').click(); await expect(page.locator('[data-action="toggle-door"]')).toHaveText('Mở cửa');
    await page.locator('[data-action="toggle-door"]').click(); await expect(page.locator('[data-action="toggle-door"]')).toHaveText('Đóng cửa');
    await page.locator('[data-action="dismantle"]').click();
    await page.locator(`[data-action="inspect-structure"][data-arg="${records.frame}"]`).click(); await page.locator('[data-action="dismantle"]').click();
    await page.locator(`[data-action="inspect-structure"][data-arg="${records.foundation}"]`).click(); await page.locator('[data-action="dismantle"]').click();
    const after = await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return { count: s.campaign.registry.structures.size, wood: s.inventory.getCount('wood'), collision: [...s.campaign.collision.instances.keys()].filter(id => id.startsWith('structure-')).length }; });
    expect(after).toEqual({ count: 0, wood: before + 6, collision: 0 }); expect(errors).toEqual([]);
});
