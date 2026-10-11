import { test, expect } from '@playwright/test';

test('chapters one to five connect from a new world through timed smelting, field repairs, equipment crafting and wreck salvage', async ({ page }) => {
    test.setTimeout(720000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Early campaign path'); await page.locator('#world-seed-input').fill('early-campaign-path');
    await page.locator('#world-form button[type="submit"]').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    const origin = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); c.respawnProtection = 1000; s.dayNight.timeOfDay = .45;
        s.vitals.thirst = 80;
        const slots = Array(28).fill(null);
        for (const [index, id, count] of [[0, 'wood', 99], [1, 'wood', 99], [2, 'stone', 90], [3, 'fiber', 60], [4, 'iron_ore', 32], [5, 'copper_ore', 4], [20, 'fresh_water', 6]]) slots[index] = { id, count };
        s.inventory.restore(slots);
        const spawn = s.world.spawnPosition;
        for (const radius of [16, 24, 32, 40, 48, 64]) for (let i = 0; i < 32; i++) {
            const x = Math.round((spawn[0] + Math.cos(i * Math.PI / 16) * radius) / 2) * 2;
            const z = Math.round((spawn[2] + Math.sin(i * Math.PI / 16) * radius) / 2) * 2;
            if ([[0, 0], [6, 0], [12, 0], [0, 6], [6, 6], [12, 6]].every(([dx, dz]) => c.registry.preview('shelter', [x + dx, 0, z + dz]).valid)) return [x, z];
        }
        throw new Error('No clear initial base cluster');
    });
    const state = () => page.evaluate(() => { const c = window.__GAME_ENGINE__.scenes.activeScene.campaign; return { chapter: c.progress.chapter, tier: c.progress.tier, completed: [...c.progress.completedChapters] }; });
    expect(await state()).toEqual({ chapter: 1, tier: 1, completed: [] });
    const close = async () => { await page.keyboard.press('Escape'); await expect(page.locator('#campaign-panel')).toBeHidden(); };
    const craft = async (id, count = 1) => {
        await page.locator('[data-action="panel"][data-arg="craft"]').click();
        await page.locator(`[data-action="recipe"][data-arg="${id}"]`).click();
        for (let i = 0; i < count; i++) { const button = page.locator(`[data-action="craft"][data-arg="${id}"]`); await expect(button).toBeEnabled(); await button.click(); }
        await close();
    };
    const pose = async (x, z, yaw = 0) => page.evaluate(({ x, z, yaw }) => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.player.position.set([x, s.terrain.getHeight(x, z) + .9, z]); s.player.velocity.fill(0);
        s.camera.setLookAngles(yaw, -.3); s.player.rotation[1] = yaw;
    }, { x, z, yaw });
    const build = async (type, dx, dz) => {
        await pose(origin[0] + dx, origin[1] + dz - 3);
        await page.keyboard.press('b'); await page.locator(`[data-action="build"][data-arg="${type}"]`).click();
        await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.placement?.preview?.valid);
        const before = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.size);
        await page.keyboard.press('e'); await page.waitForFunction(n => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.size === n + 1, before);
        const record = await page.evaluate(() => [...window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.values()].at(-1));
        await page.keyboard.press('Escape'); return { id: record.id, position: record.position };
    };
    const read = async id => {
        const p = await page.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.journals[id].position, id);
        await pose(p[0], p[2] + 1.8, Math.PI);
        await expect(async () => { await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được', { timeout: 500 }); }).toPass({ timeout: 5000 });
        expect(await page.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.journals.has(id), id)).toBe(true);
        await close();
    };
    await page.locator('[data-action="panel"][data-arg="craft"]').click();
    await page.locator('[data-action="recipe"][data-arg="iron_pickaxe"]').click();
    await expect(page.locator('[data-action="craft"][data-arg="iron_pickaxe"]')).toBeDisabled(); await close();
    await page.keyboard.press('Digit1'); await page.keyboard.press('q');
    await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['drank:fresh_water'])).toBe(1);
    await craft('rope', 4); await craft('torch');
    await build('shelter', 0, 0); await build('campfire', 6, 0); await read('wreck_log');
    expect(await state()).toEqual({ chapter: 2, tier: 1, completed: [1] });
    const workbench = await build('workbench', 12, 0); await build('chest', 0, 6); await read('camp_log');
    expect(await state()).toEqual({ chapter: 3, tier: 2, completed: [1, 2] });
    await craft('stone_pickaxe'); await read('mine_log');
    const smelters = [await build('smelter', 6, 6), await build('smelter', 12, 6)];
    const inspect = async record => {
        await pose(record.position[0], record.position[2] - 1.8);
        await expect(async () => { await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Lò nung', { timeout: 500 }); }).toPass({ timeout: 5000 });
    };
    for (const record of smelters) {
        await inspect(record);
        for (let i = 0; i < 2; i++) await page.locator('[data-action="craft"][data-arg="iron_ingot"]').click();
        for (let i = 0; i < 4; i++) await page.locator('[data-action="fuel"][data-arg="wood"]').click();
        await close();
    }
    await page.waitForTimeout(5000);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await state()).toEqual({ chapter: 3, tier: 2, completed: [1, 2] });
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.engine.input.setPointerLockEnabled(false); s.campaign.respawnProtection = 1000; });
    // Normal world simulation produces these ingots. No production.update/time-scale fixture.
    await page.waitForFunction(ids => ids.every(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id).container.getCount('iron_ingot') === 2), smelters.map(r => r.id), { timeout: 240000 });
    for (const record of smelters) { await inspect(record); await page.locator('[data-action="collect"][data-arg="iron_ingot"]').click(); await close(); }
    await pose(workbench.position[0] - 2, workbench.position[2]); await craft('iron_pickaxe');
    expect(await state()).toEqual({ chapter: 4, tier: 2, completed: [1, 2, 3] });
    await page.keyboard.press('j'); await expect(page.locator('#campaign-panel-body')).toContainText('Trạm im lặng');
    await page.screenshot({ path: '.cache/early-campaign-results/chapter-four-unlocked.png' });
    await close();
    const buildExtra = async type => {
        const point = await page.evaluate(({ origin, type }) => {
            const c = window.__GAME_ENGINE__.scenes.activeScene.campaign;
            for (const radius of [18, 24, 30, 36, 48]) for (let i = 0; i < 32; i++) {
                const x = Math.round((origin[0] + Math.cos(i * Math.PI / 16) * radius) / 2) * 2;
                const z = Math.round((origin[1] + Math.sin(i * Math.PI / 16) * radius) / 2) * 2;
                if (c.registry.preview(type, [x, 0, z]).valid) return [x - origin[0], z - origin[1]];
            }
            throw new Error('No extra building site for ' + type);
        }, { origin, type });
        return build(type, ...point);
    };
    smelters.push(await buildExtra('smelter'));
    // Reserve only raw ore. Three actual queues supply the console, repair bench and dive kit.
    for (let index = 0; index < smelters.length; index++) {
        await inspect(smelters[index]);
        for (let i = 0; i < (index < 2 ? 5 : 2); i++) await page.locator('[data-action="craft"][data-arg="iron_ingot"]').click();
        if (index === 2) for (let i = 0; i < 2; i++) await page.locator('[data-action="craft"][data-arg="copper_ingot"]').click();
        for (let i = 0; i < 5; i++) await page.locator('[data-action="fuel"][data-arg="wood"]').click();
        await close();
    }
    await page.waitForFunction(ids => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign;
        return ids.every(id => c.registry.structures.get(id).jobs.length === 0);
    }, smelters.map(r => r.id), { timeout: 420000 });
    for (const record of smelters) {
        await inspect(record);
        for (const id of ['iron_ingot', 'copper_ingot']) {
            const collect = page.locator(`[data-action="collect"][data-arg="${id}"]`);
            if (await collect.count()) await collect.click();
        }
        await close();
    }
    const station = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.world.pois.find(p => p.id === 'weather_station').position);
    await pose(station[0], station[2] + 4.5, Math.PI);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.progress.facts['deviceRepaired:station_gate']);
    await page.keyboard.down('w');
    try { await page.waitForFunction(z => window.__GAME_ENGINE__.scenes.activeScene.player.position[2] < z + .5, station[2], { timeout: 20000 }); }
    finally { await page.keyboard.up('w'); }
    await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Khôi phục bảng điều khiển');
    await page.locator('[data-action="repair-install"]').click();
    const rotations = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.stationCircuit.rotations);
    for (let index = 0; index < 25; index++) for (let turn = 0; turn < (4 - rotations[index]) % 4; turn++) await page.locator(`[data-action="repair-rotate"][data-arg="${index}"]`).click();
    await page.locator('[data-action="repair-test"]').click(); await expect(page.locator('.repair-status')).toContainText('Đã sửa xong');
    await expect(page.locator('[data-action="journal"][data-arg="station_coordinates"]')).toBeDisabled();
    await close();
    const visitSurvey = async id => {
        const p = await page.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.landmarks.surveyStations[id].position, id);
        await pose(p[0], p[2] + 2.2, Math.PI);
        await page.keyboard.press('e');
        await expect.poll(() => page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.kind)).toBe('field-survey');
    };
    const targets = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.fieldSurvey.layout);
    await visitSurvey('wind');
    for (const angle of targets.wind) {
        const slider = page.locator('[data-survey-wind]'); await slider.focus(); await page.keyboard.press('Home');
        for (let i = 0; i < angle / 5; i++) await page.keyboard.press('ArrowRight');
        await page.locator('[data-arg="wind:measure"]').click();
    }
    await close(); await visitSurvey('water');
    const pours = await page.evaluate(async target => {
        const { waterSurveyStates } = await import('/src/systems/FieldSurvey.js');
        return waterSurveyStates().find(node => node.levels.every((value, i) => value === target[i])).route;
    }, targets.water);
    for (const [from, to] of pours) await page.locator(`[data-arg="water:pour:${from},${to}"]`).click();
    await page.locator('[data-arg="water:test"]').click(); await close(); await visitSurvey('pressure');
    const [x, y, z] = targets.pressure, a = (4 * x - 2 * y + z) / 9, b = x - 2 * a, valves = [a, b, y - 2 * b];
    for (let i = 0; i < 3; i++) for (let step = 0; step < valves[i]; step++) await page.locator(`[data-arg="pressure:turn:${i},1"]`).click();
    await page.locator('[data-arg="pressure:test"]').click(); await close();
    await page.evaluate(p => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.player.position.set([p[0] + 1.7, p[1] + 1.1, p[2] - 1]); s.player.velocity.fill(0);
        s.camera._firstUpdate = true;
    }, station);
    await page.waitForFunction(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; return !s.isPaused && !s.campaign.ui.isOpen && s.campaign.fieldSurvey.allComplete(); });
    // Nearby loose resources may be selected before the note. Pick them through E,
    // then read the note, rather than deleting world resources or forcing a journal event.
    await expect(async () => {
        await page.keyboard.press('e', { delay: 100 });
        await expect(page.locator('#campaign-panel')).toBeVisible({ timeout: 500 });
        await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được', { timeout: 500 });
    }).toPass({ timeout: 10000 });
    await close();
    expect(await state()).toEqual({ chapter: 5, tier: 3, completed: [1, 2, 3, 4] });
    const repairBench = await buildExtra('repair_bench');
    await pose(repairBench.position[0] - 2, repairBench.position[2]); await craft('rope'); await craft('dive_kit'); await craft('stone_axe');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('dive_kit'))).toBe(1);
    await read('depot_log');
    const underwaterApproach = async id => page.evaluate(async id => {
        const { findWreckApproach } = await import('/tests/fixtures/wreck-approach.js');
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        const note = id === 'wreck_manifest';
        const node = note ? { position: c.journals[id].position, base: c.journals[id].position, modelId: 'note-' + id }
            : c.landmarks.salvageNodes.find(node => node.id === id);
        const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
        const rivals = [...c.landmarks.salvageNodes.filter(n => n.id !== id && !c.wreckSalvage.parts[n.id].claimed),
            ...Object.entries(c.journals).filter(([key]) => key !== id).map(([, note]) => note)];
        const point = findWreckApproach(node, c.collision, s.terrain, point => rivals.every(other => dist(point, other.position) > dist(point, node.position) + .1));
        if (!point) throw new Error('No underwater approach for ' + id);
        s.player.position.set(point); s.player.velocity.fill(0); c.swimY = point[1];
        const yaw = Math.atan2(node.position[0] - point[0], node.position[2] - point[2]);
        s.player.rotation[1] = yaw; s.camera.setLookAngles(yaw, -.3); s.camera._firstUpdate = true;
    }, id);
    await underwaterApproach('wreck_manifest');
    await page.keyboard.press('e'); await expect(page.locator('#campaign-panel-title')).toHaveText('Ghi chép tìm được'); await close();
    for (const id of ['cargo', 'wiring', 'machinery']) {
        await underwaterApproach(id); await page.keyboard.down('e');
        try { await page.waitForFunction(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.wreckSalvage.parts[id].claimed, id); }
        finally { await page.keyboard.up('e'); }
    }
    expect(await state()).toEqual({ chapter: 6, tier: 3, completed: [1, 2, 3, 4, 5] });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click(); await page.locator('#world-play-btn').click(); await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    expect(await state()).toEqual({ chapter: 6, tier: 3, completed: [1, 2, 3, 4, 5] });
    await page.keyboard.press('j'); await expect(page.locator('#campaign-panel-body')).toContainText('Rời đảo');
    await page.screenshot({ path: '.cache/early-campaign-results/chapter-six-unlocked.png' });
    expect(errors).toEqual([]);
});
