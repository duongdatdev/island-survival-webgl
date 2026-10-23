import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createGameServer } from '../../server/index.js';

let app, serverURL, dataDir;
const url = 'http://127.0.0.1:5173';
test.beforeAll(async () => {
    await mkdir('.cache', { recursive: true });
    dataDir = await mkdtemp(resolve('.cache', 'multiplayer-browser-'));
    app = await createGameServer({ dataDir });
    const address = await app.listen(0, '127.0.0.1');
    serverURL = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
    await app?.close();
    if (dataDir && resolve(dataDir).startsWith(resolve('.cache') + sep)) await rm(dataDir, { recursive: true, force: true });
});

async function menu(page, name) {
    await page.goto(url);
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 45000 });
    await page.locator('#menu-multiplayer-btn').click();
    await expect(page.locator('#network-menu')).toBeVisible();
    await page.locator('#network-host').click();
    await page.locator('#network-name').fill(name);
    await page.locator('#network-server').fill(serverURL);
}
async function ready(page) {
    await page.waitForFunction(() => window.__GAME_ENGINE__?.scenes.activeScene?.multiplayer?.ready, null, { timeout: 45000 });
    await expect(page.locator('.network-disconnect')).toHaveCount(0);
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
    });
}
async function settled(page) {
    await page.waitForFunction(() => {
        const m = window.__GAME_ENGINE__.scenes.activeScene.multiplayer;
        return m.ready && !m.pending && !m.client.queue.length;
    });
}

test('LAN campaign: two players, shared pickup and base, personal inventories, reconnect and host departure', async ({ browser }) => {
    test.setTimeout(180000);
    const contextA = await browser.newContext(), contextB = await browser.newContext();
    const a = await contextA.newPage(), b = await contextB.newPage();
    const errors = [];
    a.on('pageerror', error => errors.push(error.message)); b.on('pageerror', error => errors.push(error.message));
    try {
        await menu(a, 'Lan A');
        await a.locator('#network-seed').fill('online-coop-test');
        await a.locator('#network-password').fill('private');
        await a.locator('#network-submit').click();
        await ready(a);
        const code = await a.evaluate(() => window.__GAME_ENGINE__.networkClient.room);
        await menu(b, 'Lan B');
        await b.locator('#network-join-tab').click();
        await b.locator('#network-room').fill(code);
        await b.locator('#network-password').fill('wrong');
        await b.locator('#network-submit').click();
        await expect(b.locator('#network-error')).toContainText('sai mật khẩu');
        await b.locator('#network-password').fill('private');
        await b.locator('#network-submit').click();
        await ready(b);
        await expect(a.locator('#network-hud')).toContainText('2/8');
        await expect(b.locator('#network-hud')).toContainText('Lan A');
        await a.waitForFunction(() => [...window.__GAME_ENGINE__.networkClient.peers.values()].every(p => p.pose));
        await settled(a); await settled(b);

        // Exercise the same resource+inventory mutation used by the interact action.
        const pickup = await a.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.isPaused = true;
            const r = s.resourceManager.worldResources.find(r => r.resourceId === 'wood');
            const amount = r.amount || 1;
            if (!s.inventory.addItem(r.resourceId, amount)) throw new Error('Inventory full');
            r.collect();
            s.multiplayer.flush();
            return { id: r.netId, amount, position: Array.from(s.player.position) };
        });
        await b.waitForFunction(id => !window.__GAME_ENGINE__.scenes.activeScene.resourceManager.worldResources.some(r => r.netId === id && !r.isCollected), pickup.id);
        await expect.poll(() => a.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'))).toBe(pickup.amount);
        expect(await b.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'))).toBe(0);

        await a.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.player.position[0] += 2;
        });
        await b.waitForFunction(x => Math.abs([...window.__GAME_ENGINE__.networkClient.peers.values()][0].pose.position[0] - x) < 0.1, pickup.position[0] + 2);

        // Hold incoming delivery on both browsers so both clients can submit the same resource version.
        for (const page of [a, b]) {
            await page.evaluate(() => {
                const s = window.__GAME_ENGINE__.scenes.activeScene, m = s.multiplayer;
                s.isPaused = true;
                m.normalUpdate = m.update.bind(m);
                m.update = seconds => {
                    const result = m.normalUpdate(seconds);
                    if (!m.pending && m.ready) { m.testHeld = true; m.update = () => false; return false; }
                    return result;
                };
            });
            await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.multiplayer.testHeld, null, { timeout: 10000 });
        }
        const contested = await a.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            return s.resourceManager.worldResources.find(r => r.resourceId === 'wood' && !r.isCollected).netId;
        });
        for (const page of [a, b]) await page.evaluate(id => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            const r = s.resourceManager.worldResources.find(r => r.netId === id);
            s.inventory.addItem(r.resourceId, r.amount || 1); r.collect();
            s.multiplayer.flush();
        }, contested);
        await b.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.multiplayer.client.queue.some(m => m.type === 'rejected'), null, { timeout: 10000 });
        for (const page of [a, b]) await page.evaluate(() => {
            const m = window.__GAME_ENGINE__.scenes.activeScene.multiplayer;
            m.update = m.normalUpdate; delete m.normalUpdate;
        });
        await settled(a); await settled(b);
        expect(await b.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.inventory.getCount('wood'))).toBe(0);
        await expect(b.locator('.network-disconnect')).toHaveCount(0);

        await b.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene.debrisManager.debris.length > 0, null, { timeout: 10000 });
        const drift = await a.evaluate(() => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            const d = s.debrisManager.debris.find(d => !d.isCollected && !d.isExpired);
            const reward = d.debrisDef.gives;
            if (!s.inventory.addItem(reward.resourceId, reward.amount)) throw new Error('Inventory full');
            d.collect();
            return d.netId;
        });
        await b.waitForFunction(id => !window.__GAME_ENGINE__.scenes.activeScene.debrisManager.debris.some(d => d.netId === id), drift, { timeout: 10000 });

        // Shared functional structure and its container contents must reach the peer.
        const structure = await a.evaluate(async () => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, c = s.campaign;
            s.inventory.addItem('wood', 40); s.inventory.addItem('rope', 10);
            c.progress.tier = 3;
            let result;
            const p = s.world.spawnPosition;
            for (let r = 4; r <= 32 && !result?.ok; r += 4) {
                for (let i = 0; i < 16 && !result?.ok; i++) {
                    const angle = i * Math.PI / 8;
                    result = c.registry.place('chest', [p[0] + Math.cos(angle) * r, 0, p[2] + Math.sin(angle) * r], 0, s.inventory);
                }
            }
            if (!result?.ok) throw new Error(result?.error || 'No chest location');
            const chest = [...c.registry.structures.values()].find(r => r.type === 'chest');
            chest.container.addItem('stone', 3);
            return chest.id;
        });
        await b.waitForFunction(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id)?.container.getCount('stone') === 3, structure);
        expect(await a.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.isPaused)).toBe(true);
        await expect(b.locator('.network-disconnect')).toHaveCount(0);
        expect(await a.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.multiplayer.saveCheckpoint())).toBe(true);
        await b.evaluate(id => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.campaign.registry.structures.get(id).container.addItem('stone', 2);
        }, structure);
        await a.waitForFunction(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id)?.container.getCount('stone') === 5, structure);
        // Returning from an expedition restores only the traveller; the teammate's chest edit survives.
        await a.evaluate(async () => {
            const s = window.__GAME_ENGINE__.scenes.activeScene;
            s.campaign.ending.challenge.start('raft', { seed: s.worldSeed });
            await s.campaign.ending.returnToBase();
            s.engine.input.setPointerLockEnabled(false);
        });
        expect(await a.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id)?.container.getCount('stone'), structure)).toBe(5);
        expect(await a.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.campaign.ending.state)).toBe(null);
        expect(await a.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
        expect(await b.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);

        const bId = await b.evaluate(() => window.__GAME_ENGINE__.networkClient.id);
        await b.reload();
        await expect(b.locator('#main-menu')).toBeVisible({ timeout: 45000 });
        await b.locator('#menu-multiplayer-btn').click();
        await b.locator('#network-direct-connect').click();
        await b.locator('#network-join-tab').click();
        await b.locator('#network-password').fill('private');
        await b.locator('#network-submit').click();
        await ready(b);
        expect(await b.evaluate(() => window.__GAME_ENGINE__.networkClient.id)).toBe(bId);
        expect(await b.evaluate(id => window.__GAME_ENGINE__.scenes.activeScene.campaign.registry.structures.get(id)?.container.getCount('stone'), structure)).toBe(5);

        await a.close();
        await b.waitForFunction(() => { const m = window.__GAME_ENGINE__.scenes.activeScene.multiplayer; return m.isLeader && !m.client.closed; });
        await expect(b.locator('#network-hud')).toContainText('1/8');
        expect(await b.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
        await b.screenshot({ path: '.cache/multiplayer-gameplay.png' });
        expect(errors).toEqual([]);
    } finally { await contextA.close(); await contextB.close(); }
});

test('Classic online: disconnect freezes gameplay and personal respawn keeps the room', async ({ page }) => {
    test.setTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await menu(page, 'Classic Survivor');
    await page.setViewportSize({ width: 800, height: 700 });
    await page.screenshot({ path: '.cache/multiplayer-connect.png' });
    await page.locator('#network-mode').selectOption('classic');
    await page.locator('#network-submit').click();
    await ready(page); await settled(page);
    const room = await page.evaluate(() => window.__GAME_ENGINE__.networkClient.room);
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.inventory.addItem('wood', 2); s.isPaused = true;
    });
    expect(await page.evaluate(() => window.__GAME_ENGINE__.scenes.activeScene.saveController.save(false))).toBe(true);
    await settled(page);
    await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s._showGameOver(); await s._restartWorld();
    });
    await settled(page);
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { online: !!s.multiplayer, health: s.vitals.health, wood: s.inventory.getCount('wood'), room: s.multiplayer.client.room };
    })).toMatchObject({ online: true, health: 100, wood: 0, room });
    const member = [...app.rooms.get(room).members.values()][0];
    member.socket.terminate();
    await expect(page.locator('.network-disconnect')).toBeVisible();
    const before = await page.evaluate(() => Array.from(window.__GAME_ENGINE__.scenes.activeScene.player.position));
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    expect(await page.evaluate(() => Array.from(window.__GAME_ENGINE__.scenes.activeScene.player.position))).toEqual(before);
    await page.locator('.network-disconnect button').click();
    await expect(page.locator('#main-menu')).toBeVisible();
    await expect(page.locator('#network-hud')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('connection form fits small and landscape screens and keeps keyboard focus inside the dialog', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await menu(page, 'Keyboard Survivor');
    for (const viewport of [{ width: 375, height: 667 }, { width: 800, height: 375 }]) {
        await page.setViewportSize(viewport);
        expect(await page.locator('.network-panel').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
                && element.scrollWidth <= element.clientWidth;
        })).toBe(true);
        await page.locator('#network-submit').scrollIntoViewIfNeeded();
        await expect(page.locator('#network-submit')).toBeInViewport();
    }
    await page.locator('#network-close').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#network-submit')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#network-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#network-menu')).toBeHidden();
    await expect(page.locator('#menu-multiplayer-btn')).toBeFocused();
});

test('offline worlds launch, save and continue without opening a multiplayer connection', async ({ page }) => {
    test.setTimeout(90000);
    const sockets = [], errors = [];
    page.on('websocket', socket => { if (new URL(socket.url()).pathname.endsWith('/ws')) sockets.push(socket.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await expect(page.locator('#main-menu')).toBeVisible();
    await page.locator('#menu-play-btn').click();
    await expect(page.locator('#network-menu')).toBeHidden();
    await page.locator('#world-create-btn').click();
    await page.locator('#world-mode-input').selectOption('classic');
    await page.locator('#world-name-input').fill('Đảo offline riêng');
    await page.locator('#world-seed-input').fill('offline-and-online');
    await page.locator('#world-form button[type=submit]').click();
    await page.locator('#world-play-btn').click();
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene?.inventoryController?._initialized);
    const id = await page.evaluate(async () => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false); s.isPaused = true;
        s.inventory.addItem('wood', 7);
        if (!await s.saveController.save(false)) throw new Error('Offline save failed');
        return s.activeWorldId;
    });
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible();
    await page.locator('#menu-play-btn').click();
    await page.locator('#world-play-btn').click();
    await page.waitForFunction(() => window.__GAME_ENGINE__.scenes.activeScene?.inventoryController?._initialized);
    expect(await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        return { id: s.activeWorldId, wood: s.inventory.getCount('wood'), online: !!s.multiplayer, connection: !!s.engine.networkClient };
    })).toEqual({ id, wood: 7, online: false, connection: false });
    expect(sockets).toEqual([]); expect(errors).toEqual([]);
});

test('Minecraft-style server list saves, edits, removes, refreshes and joins by address without a room code', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(url); await expect(page.locator('#main-menu')).toBeVisible();
    await page.locator('#menu-multiplayer-btn').click();
    await page.locator('#network-add-server').click();
    await page.locator('#network-bookmark-name').fill('Server bạn bè');
    await page.locator('#network-server').fill(serverURL);
    await page.locator('#network-save-server').click();
    const entry = page.locator('.network-server-entry').filter({ hasText: 'Server bạn bè' });
    await expect(entry).toContainText('Online', { timeout: 10000 });
    await page.locator('#network-edit-server').click();
    await page.locator('#network-bookmark-name').fill('LAN nhà mình');
    await page.locator('#network-save-server').click();
    await expect(page.locator('.network-server-entry').filter({ hasText: 'LAN nhà mình' })).toBeVisible();
    await page.locator('#network-remove-server').click();
    await expect(page.locator('.network-server-entry').filter({ hasText: 'LAN nhà mình' })).toHaveCount(0);
    await page.locator('#network-add-server').click();
    await page.locator('#network-bookmark-name').fill('LAN đã lưu');
    await page.locator('#network-server').fill(serverURL);
    await page.locator('#network-save-server').click();
    await page.reload(); await expect(page.locator('#main-menu')).toBeVisible();
    await page.locator('#menu-multiplayer-btn').click();
    await expect(page.locator('.network-server-entry').filter({ hasText: 'LAN đã lưu' })).toContainText('Online', { timeout: 10000 });
    await page.screenshot({ path: '.cache/server-browser-menu.png' });
    await page.locator('#network-join-selected').click();
    await ready(page);
    expect(await page.evaluate(() => window.__GAME_ENGINE__.networkClient.room)).toMatch(/^[A-Z2-9]{6}$/);
    await expect(page.locator('#network-hud')).toBeVisible();
});
