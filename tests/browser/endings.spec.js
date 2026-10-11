import { test, expect } from '@playwright/test';

test('both routes save checkpoints, allow failure/retry, resume, and preserve the same base after completion', async ({ page }) => {
    test.setTimeout(210000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Ending integration');
    await page.locator('#world-seed-input').fill('ending-integration');
    await page.locator('#world-form button[type="submit"]').click();
    await expect(page.locator('#world-list')).toContainText('Ending integration');
    await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('raft'));
    await expect(page.locator('[data-action="start-ending"][data-arg="raft"]')).toBeDisabled();
    await expect(page.locator('#campaign-panel-body')).toContainText('Hoàn thành chương 5');
    await expect(page.locator('#campaign-panel-body')).toContainText('La bàn');
    const chestId = await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
        s.tutorial.skip();
        const bindings = s.engine.input.getBindings();
        Object.assign(bindings, { moveLeft: ['KeyJ'], moveRight: ['KeyL'], moveForward: ['KeyI'], moveBackward: ['KeyK'], interact: ['KeyF'] });
        s.engine.settings.set('keyBindings', bindings); s.engine.input.setBindings(bindings);
        c.progress.chapter = 6; c.progress.tier = 3; c.progress.completedChapters = new Set([1, 2, 3, 4, 5]);
        c.progress.questItems.add('island_coordinates');
        for (const [id, count] of Object.entries({ wood: 40, rope: 5, raft_frame: 1, barrel_floats: 1, paddle: 1, raft_sail: 1, raft_motor: 1,
            compass: 1, fresh_water: 12, smoked_meal: 6, repair_kit: 6, radio: 1, battery: 2, copper_wire: 6, iron_ingot: 3 })) {
            if (!s.inventory.addItem(id, count)) throw new Error('fixture inventory full');
        }
        let chest;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const p = [s.player.position[0] + Math.sin(angle) * 4, 0, s.player.position[2] + Math.cos(angle) * 4];
            const result = c.registry.place('chest', p, 0, s.inventory);
            if (result.ok) { chest = result.structure; break; }
        }
        if (!chest) throw new Error('fixture could not place chest');
        chest.container.addItem('stone', 17);
        c.ui.open('raft');
        return chest.id;
    });
    await expect(page.locator('#campaign-panel-body')).toContainText('J/L lái');
    for (const id of ['raft_frame', 'barrel_floats', 'paddle', 'raft_sail', 'raft_motor']) await page.locator(`[data-action="install-raft"][data-arg="${id}"]`).click();
    await expect(page.locator('[data-action="start-ending"][data-arg="raft"]')).toBeEnabled();
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, repository = s.engine.worldRepository;
        s._endingRepositorySave = repository.saveWorld.bind(repository);
        repository.saveWorld = (id, snapshot, options) => options?.checkpoint ? Promise.resolve(false) : s._endingRepositorySave(id, snapshot, options);
    });
    await page.locator('[data-action="start-ending"][data-arg="raft"]').click();
    await expect(page.locator('#campaign-panel-feedback')).toContainText('Không thể lưu checkpoint');
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { water: s.inventory.getCount('fresh_water'), state: s.campaign.ending.state };
    })).toEqual({ water: 12, state: null });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.engine.worldRepository.saveWorld = s._endingRepositorySave;
        s._endingSceneSave = s.saveController.save.bind(s.saveController); s.saveController.save = async () => false;
    });
    await page.locator('[data-action="start-ending"][data-arg="raft"]').click();
    await expect(page.locator('#campaign-panel-feedback')).toContainText('Vật tư đã được hoàn lại');
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { water: s.inventory.getCount('fresh_water'), state: s.campaign.ending.state };
    })).toEqual({ water: 12, state: null });
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.saveController.save = s._endingSceneSave; });
    await page.locator('[data-action="start-ending"][data-arg="raft"]').click();
    await expect(page.locator('#ending-radar')).toBeVisible();
    const checkpoint = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        const saved = await s.engine.worldRepository.loadWorld(s.activeWorldId, 'checkpoint');
        return { water: saved.inventory.slots.filter(item => item?.id === 'fresh_water').reduce((n, item) => n + item.count, 0),
            structures: saved.campaign.registry.structures.length, active: !!saved.campaign.ending.challenge };
    });
    expect(checkpoint).toEqual({ water: 12, structures: 1, active: false });
    await expect(page.locator('#campaign-ending-hud')).toContainText('J/L lái');
    await page.keyboard.down('l');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.heading > 0.05);
    await page.keyboard.up('l');
    await page.locator('[data-action="abandon-ending"]').click();
    await expect(page.locator('#campaign-panel-title')).toHaveText('Dừng chuyến đi?');
    const held = await page.evaluate(() => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign;
        return { elapsed: c.ending.state.elapsed, played: c.playSeconds };
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => {
        const c = window.__GAME_ENGINE__.scenes.activeScene.campaign;
        return { elapsed: c.ending.state.elapsed, played: c.playSeconds };
    })).toEqual(held);
    await page.locator('#campaign-panel-body [data-action="close"]').click();
    await expect(page.locator('#campaign-ending-hud')).toBeFocused();
    await page.waitForFunction(elapsed => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.elapsed > elapsed + 0.1, held.elapsed);
    await page.locator('[data-action="abandon-ending"]').click();
    await page.locator('#campaign-panel-body [data-action="return-base"]').click();
    await expect(page.locator('#campaign-panel')).toBeHidden();
    expect(await page.evaluate(id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { ending: s.campaign.ending.state, water: s.inventory.getCount('fresh_water'), stone: s.campaign.registry.structures.get(id).container.getCount('stone') };
    }, chestId)).toEqual({ ending: null, water: 12, stone: 17 });
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('raft'));
    await page.locator('[data-action="start-ending"][data-arg="raft"]').click();
    await expect(page.locator('#ending-radar')).toBeVisible();
    await page.screenshot({ path: '.cache/browser-results/campaign-ocean-route.png' });
    await page.evaluate(() => { window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.hull = 0; });
    await expect(page.locator('[data-action="retry-ending"]')).toBeVisible();
    await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, repository = s.engine.worldRepository;
        const key = `${s.activeWorldId}:checkpoint`; s._endingCheckpoint = await repository._read('snapshots', key);
        const database = await repository.open(), transaction = database.transaction('snapshots', 'readwrite');
        transaction.objectStore('snapshots').put({ ...s._endingCheckpoint, checksum: 'corrupt' });
        await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = transaction.onabort = reject; });
    });
    await page.locator('[data-action="retry-ending"]').click();
    await expect(page.locator('#campaign-panel-feedback')).toContainText('Không đọc được checkpoint');
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { status: s.campaign.ending.state.status, water: s.inventory.getCount('fresh_water') };
    })).toEqual({ status: 'failed', water: 6 });
    await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene, database = await s.engine.worldRepository.open();
        const transaction = database.transaction('snapshots', 'readwrite'); transaction.objectStore('snapshots').put(s._endingCheckpoint);
        await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = transaction.onabort = reject; });
    });
    await page.locator('[data-action="retry-ending"]').click();
    await expect(page.locator('#ending-radar')).toBeVisible();
    await page.waitForFunction(() => {
        const state = window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state;
        return state?.status === 'active' && state.hull > 90;
    });
    await page.evaluate(async () => { await window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false); });
    await page.reload();
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 30000 });
    await page.locator('#menu-play-btn').click();
    await expect(page.locator('#world-list')).toContainText('Ending integration');
    await page.locator('#world-play-btn').click();
    await expect(page.locator('#ending-radar')).toBeVisible({ timeout: 45000 });
    await page.evaluate(async () => {
        const { oceanLane } = await import('/src/systems/EndingChallenge.js');
        const state = window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state;
        state.along = 1799.99; state.across = oceanLane(1800); state.heading = 0; state.elapsed = 560;
    });
    await expect(page.locator('[data-action="return-base"]')).toBeVisible();
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s._endingSceneSave = s.saveController.save.bind(s.saveController); s.saveController.save = async () => false;
    });
    await page.locator('[data-action="return-base"]').click();
    await expect(page.locator('[data-action="retry-save"]')).toBeVisible();
    expect(await page.evaluate(async id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { routes: (await s.engine.worldRepository.getWorld(s.activeWorldId)).completedRoutes,
            pending: s.campaign.ending.pendingRoute, stone: s.campaign.registry.structures.get(id).container.getCount('stone') };
    }, chestId)).toEqual({ routes: [], pending: 'raft', stone: 17 });
    await page.evaluate(() => { const s = window.__GAME_ENGINE__.scenes.activeScene; s.saveController.save = s._endingSceneSave; });
    await page.locator('[data-action="retry-save"]').click();
    await expect(page.locator('#campaign-panel')).toBeHidden();
    await expect(page.locator('.campaign-toolbar')).toBeVisible();
    const first = await page.evaluate(async id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { stone: s.campaign.registry.structures.get(id).container.getCount('stone'), world: await s.engine.worldRepository.getWorld(s.activeWorldId),
            ending: s.campaign.ending.state };
    }, chestId);
    expect(first.stone).toBe(17); expect(first.world.completedRoutes).toEqual(['raft']); expect(first.ending).toBeNull();
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('rescue'));
    await page.locator('[data-action="repair-tower"]').click();
    const rescueWood = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'));
    await page.locator('[data-action="start-ending"][data-arg="rescue"]').click();
    await expect(page.locator('#ending-tuning')).toBeVisible();
    await page.locator('[data-action="abandon-ending"]').click();
    await expect(page.locator('#campaign-panel-title')).toHaveText('Dừng chuyến đi?');
    await page.keyboard.down('Escape'); await expect(page.locator('#campaign-panel')).toBeHidden(); await page.keyboard.up('Escape');
    await expect(page.locator('#campaign-ending-hud')).toBeFocused();
    await page.keyboard.press('Space', { delay: 100 });
    await expect(page.locator('#campaign-panel')).toBeHidden();
    await expect(page.locator('#campaign-ending-hud')).toContainText('J/L chỉnh');
    await expect(page.locator('#campaign-ending-hud')).toContainText('F nhiên liệu');
    await page.keyboard.down('l');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.tuning > 53);
    await page.keyboard.up('l');
    const tuned = await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.tuning);
    await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.tuning)).toBeCloseTo(tuned, 2);
    await page.evaluate(() => { window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.power = 60; });
    await page.keyboard.down('f');
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state.fuel === 14);
    await page.keyboard.up('f');
    await page.locator('[data-action="abandon-ending"]').click();
    await page.locator('#campaign-panel-body [data-action="return-base"]').click();
    await expect(page.locator('#campaign-panel')).toBeHidden();
    expect(await page.evaluate(async id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { ending: s.campaign.ending.state, repaired: s.campaign.ending.towerRepaired, wood: s.inventory.getCount('wood'),
            routes: (await s.engine.worldRepository.getWorld(s.activeWorldId)).completedRoutes,
            stone: s.campaign.registry.structures.get(id).container.getCount('stone') };
    }, chestId)).toEqual({ ending: null, repaired: true, wood: rescueWood, routes: ['raft'], stone: 17 });
    await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ui.open('rescue'));
    await page.locator('[data-action="start-ending"][data-arg="rescue"]').click();
    await expect(page.locator('#ending-tuning')).toBeVisible();
    await page.locator('[data-action="ending-command"][data-arg="transmit"]').click();
    await page.screenshot({ path: '.cache/browser-results/campaign-rescue-route.png' });
    await page.evaluate(() => {
        const state = window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state;
        state.elapsed = 550; state.nextStrike = 650; state.signal = 479.99;
        const storm = Math.sin(state.elapsed / 27) > 0.35;
        state.tuning = 50 + Math.sin(state.elapsed / 33 + state.frequencyPhase) * 17 + (storm ? Math.sin(state.elapsed / 7) * 4 : 0);
    });
    await expect(page.locator('[data-action="return-base"]')).toBeVisible();
    await page.locator('[data-action="return-base"]').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible();
    const second = await page.evaluate(async id => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        const world = await s.engine.worldRepository.getWorld(s.activeWorldId);
        const save = await s.engine.worldRepository.loadWorld(s.activeWorldId);
        return { routes: world.completedRoutes, stone: s.campaign.registry.structures.get(id).container.getCount('stone'),
            facts: save.campaign.facts, achievement: s.achievements.isUnlocked('both_routes') };
    }, chestId);
    expect(second.routes).toEqual(['raft', 'rescue']); expect(second.stone).toBe(17);
    expect(second.facts['endingCompleted:raft']).toBe(1); expect(second.facts['endingCompleted:rescue']).toBe(1);
    expect(second.achievement).toBe(true); expect(errors).toEqual([]);
});
