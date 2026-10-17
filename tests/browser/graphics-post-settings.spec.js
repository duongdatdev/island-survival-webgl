import { test, expect } from '@playwright/test';

test('graphics controls persist and post effects expose their dependency when disabled', async ({ page }) => {
    await page.goto('/tests/browser/graphics-post-fixture.html');
    await page.evaluate(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="settings-menu" class="hidden">
                <div class="settings-tab active" data-tab="graphics"></div>
                <div class="settings-section tab-section active" data-tab="graphics"></div>
                <div class="setting-row"><label for="set-post">Post</label><input id="set-post" type="checkbox"></div>
                <div class="setting-row"><label for="set-bloom">Bloom</label><input id="set-bloom" type="checkbox"></div>
                <div class="setting-row"><label for="set-bloom-intensity">Bloom strength</label><input id="set-bloom-intensity" type="range" min="0" max="200"></div>
                <div class="setting-row"><label for="set-vignette">Vignette</label><input id="set-vignette" type="checkbox"></div>
                <div class="setting-row"><label for="set-antialiasing">Khử răng cưa</label><input id="set-antialiasing" type="checkbox"></div>
                <div class="setting-row"><label for="set-ambient-occlusion">Bóng tiếp xúc</label><input id="set-ambient-occlusion" type="checkbox"></div>
                <div class="setting-row"><label for="set-shadows">Bóng đổ</label><input id="set-shadows" type="checkbox"></div>
                <div class="setting-row"><label for="set-foliage-density">Mật độ cây cỏ</label><input id="set-foliage-density" type="range" min="0" max="150"></div>
                <div class="setting-row"><label for="set-water-quality">Chi tiết mặt nước</label><input id="set-water-quality" type="range" min="0" max="100"></div>
                <div class="setting-row"><label for="set-pixel-ratio-limit">Mật độ điểm ảnh tối đa</label><input id="set-pixel-ratio-limit" type="range" min="100" max="200"></div>
                <p id="graphics-post-hint" hidden></p>
            </div>`;
    });

    await page.evaluate(async () => {
        const [{ MenuUI }, { SettingsManager }] = await Promise.all([
            import('/src/systems/MenuUI.js'),
            import('/src/systems/SettingsManager.js'),
        ]);
        const settings = new SettingsManager();
        const engine = {
            settings,
            audio: { isMuted: false, playClick() {}, _ensureContext() {}, setMuted() {}, applySettings() {} },
            input: { cancelListeningForRebind() {} },
        };
        window.testSettings = settings;
        window.testMenuUI = new MenuUI(engine);
    });

    await page.locator('#set-antialiasing').uncheck();
    await page.locator('#set-antialiasing').check();
    await page.locator('#set-shadows').uncheck();
    await page.locator('#set-shadows').check();
    await page.locator('#set-ambient-occlusion').uncheck();
    await page.locator('#set-ambient-occlusion').check();
    for (const [id, value] of [['set-foliage-density', '80'], ['set-water-quality', '45'], ['set-pixel-ratio-limit', '180']]) {
        await page.locator(`#${id}`).evaluate((input, nextValue) => {
            input.value = nextValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, value);
    }

    const persisted = await page.evaluate(() => ({
        antialiasing: testSettings.get('antialiasing'),
        shadows: testSettings.get('shadows'),
        ambientOcclusion: testSettings.get('ambientOcclusion'),
        foliageDensity: testSettings.get('foliageDensity'),
        waterQuality: testSettings.get('waterQuality'),
        pixelRatioLimit: testSettings.get('pixelRatioLimit'),
        stored: JSON.parse(localStorage.getItem('island_survival_settings_v1')),
    }));
    expect(persisted).toMatchObject({
        antialiasing: true,
        shadows: true,
        ambientOcclusion: true,
        foliageDensity: 0.8,
        waterQuality: 0.45,
        pixelRatioLimit: 1.8,
    });
    expect(persisted.stored).toMatchObject({
        antialiasing: true,
        shadows: true,
        ambientOcclusion: true,
        foliageDensity: 0.8,
        waterQuality: 0.45,
        pixelRatioLimit: 1.8,
    });

    await page.locator('#set-post').uncheck();
    await expect(page.locator('#graphics-post-hint')).toBeVisible();
    for (const id of ['set-bloom', 'set-bloom-intensity', 'set-vignette', 'set-antialiasing', 'set-ambient-occlusion']) {
        await expect(page.locator(`#${id}`)).toBeDisabled();
        await expect(page.locator(`#${id}`)).toHaveAttribute('aria-describedby', 'graphics-post-hint');
    }
    await page.locator('#set-post').check();
    await expect(page.locator('#graphics-post-hint')).toBeHidden();
    await expect(page.locator('#set-antialiasing')).toBeEnabled();
    await expect(page.locator('#set-ambient-occlusion')).toBeEnabled();
    expect(await page.evaluate(() => testSettings.get('postProcessing'))).toBe(true);
});
