import { QualityPresets } from './SettingsManager.js';
import { Achievements } from './AchievementSystem.js';

/**
 * MenuUI (v1.0) — DOM controller for the settings, achievements, credits and
 * how-to-play overlays.
 *
 * Both the main menu and the in-game pause menu open the same panels, so the
 * binding lives here once instead of being duplicated per scene. A scene
 * constructs one instance, calls `openSettings()` / `openAchievements()` /
 * `openCredits()` / `openGuide()`, and disposes it on teardown.
 */
export class MenuUI {
    /**
     * @param {object} engine Engine instance (settings, audio, achievements)
     * @param {object} [hooks]
     * @param {() => void} [hooks.onClose] Called when any panel is dismissed.
     * @param {() => void} [hooks.onGuidePlay] Start-the-game action for the
     *   guide panel. Only the main menu supplies it; without it the guide's
     *   "play" button stays hidden (there is nothing to start mid-run).
     */
    constructor(engine, hooks = {}) {
        this.engine = engine;
        this.settings = engine.settings;
        this.achievements = engine.achievements;
        this.onClose = hooks.onClose || null;
        this.onGuidePlay = hooks.onGuidePlay || null;

        /** @type {Array<{el: Element, type: string, fn: Function}>} */
        this._bound = [];

        this._settingsEl = document.getElementById('settings-menu');
        this._achievementsEl = document.getElementById('achievements-menu');
        this._creditsEl = document.getElementById('credits-menu');
        this._guideEl = document.getElementById('guide-menu');

        this._bindSettings();
        this._bindPanelButtons();
        this._bindSettingsTabs();
        this._bindGuide();
        this.syncSettingsUI();
    }

    // ── Panel visibility ─────────────────────────────────────────

    openSettings() {
        this.syncSettingsUI();
        this._show(this._settingsEl);
    }

    openAchievements() {
        this._renderAchievements();
        this._show(this._achievementsEl);
    }

    openCredits() {
        this._show(this._creditsEl);
    }

    openGuide() {
        const playBtn = document.getElementById('guide-play-btn');
        if (playBtn) playBtn.classList.toggle('hidden', !this.onGuidePlay);
        this._show(this._guideEl);
    }

    closeAll() {
        if (this.engine.input) {
            this.engine.input.cancelListeningForRebind();
        }
        this._hide(this._settingsEl);
        this._hide(this._achievementsEl);
        this._hide(this._creditsEl);
        this._hide(this._guideEl);
        if (this.onClose) this.onClose();
    }

    /** True when any v1.0 panel is currently on screen. */
    isAnyOpen() {
        return [this._settingsEl, this._achievementsEl, this._creditsEl, this._guideEl]
            .some(el => el && !el.classList.contains('hidden'));
    }

    /**
     * Detach every listener this instance added. Scenes must call it in
     * `destroy()` — the overlays are shared DOM, so leaving handlers behind
     * would make a re-entered scene fire each action twice.
     */
    dispose() {
        for (const { el, type, fn } of this._bound) {
            el.removeEventListener(type, fn);
        }
        this._bound = [];
        this.closeAll();
    }

    // ── Settings bindings ────────────────────────────────────────

    _bindSettings() {
        // Sliders: [element id, setting key, scale, formatter]
        const sliders = [
            ['set-master-volume', 'masterVolume', 0.01, v => `${Math.round(v * 100)}%`],
            ['set-sfx-volume', 'sfxVolume', 0.01, v => `${Math.round(v * 100)}%`],
            ['set-ambient-volume', 'ambientVolume', 0.01, v => `${Math.round(v * 100)}%`],
            ['set-music-volume', 'musicVolume', 0.01, v => `${Math.round(v * 100)}%`],
            ['set-sensitivity', 'mouseSensitivity', 0.01, v => `${v.toFixed(2)}x`],
            ['set-fov', 'fov', 1, v => `${Math.round(v)}°`],
            ['set-render-scale', 'renderScale', 0.01, v => `${Math.round(v * 100)}%`],
            ['set-view-distance', 'viewDistance', 1, v => `${Math.round(v)}m`],
            ['set-bloom-intensity', 'bloomIntensity', 0.01, v => v.toFixed(2)],
            ['set-particles', 'particleDensity', 0.01, v => `${Math.round(v * 100)}%`],
        ];

        for (const [id, key, scale, format] of sliders) {
            const el = document.getElementById(id);
            if (!el) continue;
            this._on(el, 'input', () => {
                const value = parseFloat(el.value) * scale;
                this.settings.set(key, value);
                this._setValueLabel(id, format(this.settings.get(key)));
                this._syncQualityButtons();
            });
        }

        const toggles = [
            ['set-muted', 'muted'],
            ['set-invert-y', 'invertY'],
            ['set-post', 'postProcessing'],
            ['set-bloom', 'bloom'],
            ['set-vignette', 'vignette'],
            ['set-culling', 'frustumCulling'],
            ['set-show-fps', 'showFps'],
        ];

        for (const [id, key] of toggles) {
            const el = document.getElementById(id);
            if (!el) continue;
            this._on(el, 'change', () => {
                this.settings.set(key, el.checked);
                // Mute lives in two places (AudioManager owns the live gain,
                // settings own the persisted value) — keep them in step.
                if (key === 'muted') {
                    this.engine.audio._ensureContext();
                    this.engine.audio.setMuted(el.checked);
                }
                this._syncQualityButtons();
            });
        }

        const qualityButtons = document.querySelectorAll('.quality-btn');
        qualityButtons.forEach(btn => {
            this._on(btn, 'click', () => {
                const name = btn.getAttribute('data-quality');
                this.settings.applyQualityPreset(name);
                this.syncSettingsUI();
                this.engine.audio.playClick();
            });
        });

        const resetBtn = document.getElementById('settings-reset-btn');
        if (resetBtn) {
            this._on(resetBtn, 'click', () => {
                this.settings.resetToDefaults();
                this.engine.audio.applySettings(this.settings);
                if (this.engine.input) {
                    this.engine.input.setBindings(this.settings.get('keyBindings'));
                }
                this.syncSettingsUI();
                this.engine.audio.playClick();
            });
        }

        // Key Rebinding Buttons
        const keybindButtons = document.querySelectorAll('.keybind-btn');
        keybindButtons.forEach(btn => {
            this._on(btn, 'click', () => {
                const action = btn.getAttribute('data-action');
                const slot = parseInt(btn.getAttribute('data-slot') || '0', 10);
                if (!action || !this.engine.input) return;

                // Reset all other listening buttons
                keybindButtons.forEach(b => {
                    b.classList.remove('listening');
                    const a = b.getAttribute('data-action');
                    const s = parseInt(b.getAttribute('data-slot') || '0', 10);
                    b.textContent = this.engine.input.getBindingDisplayName(a, s);
                });

                btn.classList.add('listening');
                btn.textContent = '... Bấm phím ...';

                this.engine.input.startListeningForRebind((keyCode) => {
                    btn.classList.remove('listening');
                    if (keyCode) {
                        const bindings = JSON.parse(JSON.stringify(this.settings.get('keyBindings') || {}));
                        if (!bindings[action]) bindings[action] = [];
                        if (!Array.isArray(bindings[action])) bindings[action] = [bindings[action]];
                        bindings[action][slot] = keyCode;

                        this.settings.set('keyBindings', bindings);
                        this.engine.input.setBindings(bindings);
                        this.engine.audio.playClick();
                    }
                    this.syncSettingsUI();
                });
            });
        });

        const keybindResetBtn = document.getElementById('keybind-reset-btn');
        if (keybindResetBtn) {
            this._on(keybindResetBtn, 'click', () => {
                this.settings.resetKeyBindings();
                if (this.engine.input) {
                    this.engine.input.setBindings(this.settings.get('keyBindings'));
                }
                this.syncSettingsUI();
                this.engine.audio.playClick();
            });
        }
    }

    _bindPanelButtons() {
        const closers = [
            'settings-close-btn', 'settings-done-btn',
            'achievements-close-btn', 'achievements-done-btn',
            'credits-close-btn', 'credits-done-btn',
            'guide-close-btn', 'guide-done-btn',
        ];

        for (const id of closers) {
            const el = document.getElementById(id);
            if (!el) continue;
            this._on(el, 'click', () => {
                this.engine.audio.playClick();
                this.closeAll();
            });
        }
    }

    _bindGuide() {
        const playBtn = document.getElementById('guide-play-btn');
        if (!playBtn) return;

        this._on(playBtn, 'click', () => {
            this.engine.audio.playClick();
            // Close first: the scene swap tears this controller down, and the
            // guide is shared DOM that would otherwise stay on screen.
            this.closeAll();
            if (this.onGuidePlay) this.onGuidePlay();
        });
    }

    _bindSettingsTabs() {
        const tabs = document.querySelectorAll('.settings-tab');
        const sections = document.querySelectorAll('.settings-section.tab-section');

        for (const tab of tabs) {
            this._on(tab, 'click', () => {
                const target = tab.getAttribute('data-tab');
                for (const t of tabs) {
                    t.classList.toggle('active', t === tab);
                    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                }
                for (const s of sections) {
                    s.classList.toggle('active', s.getAttribute('data-tab') === target);
                }
                this.engine.audio.playClick();
            });
        }
    }

    /**
     * Push the stored settings into every control. Called on open and after a
     * preset/reset so the widgets never drift from the real values.
     */
    syncSettingsUI() {
        const s = this.settings;

        this._setSlider('set-master-volume', s.get('masterVolume') * 100, 'val-master-volume', `${Math.round(s.get('masterVolume') * 100)}%`);
        this._setSlider('set-sfx-volume', s.get('sfxVolume') * 100, 'val-sfx-volume', `${Math.round(s.get('sfxVolume') * 100)}%`);
        this._setSlider('set-ambient-volume', s.get('ambientVolume') * 100, 'val-ambient-volume', `${Math.round(s.get('ambientVolume') * 100)}%`);
        this._setSlider('set-music-volume', s.get('musicVolume') * 100, 'val-music-volume', `${Math.round(s.get('musicVolume') * 100)}%`);
        this._setSlider('set-sensitivity', s.get('mouseSensitivity') * 100, 'val-sensitivity', `${s.get('mouseSensitivity').toFixed(2)}x`);
        this._setSlider('set-fov', s.get('fov'), 'val-fov', `${Math.round(s.get('fov'))}°`);
        this._setSlider('set-render-scale', s.get('renderScale') * 100, 'val-render-scale', `${Math.round(s.get('renderScale') * 100)}%`);
        this._setSlider('set-view-distance', s.get('viewDistance'), 'val-view-distance', `${Math.round(s.get('viewDistance'))}m`);
        this._setSlider('set-bloom-intensity', s.get('bloomIntensity') * 100, 'val-bloom-intensity', s.get('bloomIntensity').toFixed(2));
        this._setSlider('set-particles', s.get('particleDensity') * 100, 'val-particles', `${Math.round(s.get('particleDensity') * 100)}%`);

        this._setToggle('set-muted', this.engine.audio.isMuted);
        this._setToggle('set-invert-y', s.get('invertY'));
        this._setToggle('set-post', s.get('postProcessing'));
        this._setToggle('set-bloom', s.get('bloom'));
        this._setToggle('set-vignette', s.get('vignette'));
        this._setToggle('set-culling', s.get('frustumCulling'));
        this._setToggle('set-show-fps', s.get('showFps'));

        // Sync keybinding buttons
        const keybindButtons = document.querySelectorAll('.keybind-btn');
        keybindButtons.forEach(btn => {
            btn.classList.remove('listening');
            const action = btn.getAttribute('data-action');
            const slot = parseInt(btn.getAttribute('data-slot') || '0', 10);
            if (action && this.engine.input) {
                btn.textContent = this.engine.input.getBindingDisplayName(action, slot);
            }
        });

        this._syncQualityButtons();
    }

    _syncQualityButtons() {
        const active = this.settings.get('quality');
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-quality') === active);
        });

        const label = document.getElementById('val-quality');
        if (label) {
            const preset = QualityPresets[active];
            label.textContent = preset ? preset.label : 'Tùy chỉnh';
        }
    }

    // ── Achievements panel ───────────────────────────────────────

    _renderAchievements() {
        const listEl = document.getElementById('achievements-list');
        const progressEl = document.getElementById('achievements-progress');

        const progress = this.achievements.getProgress();
        if (progressEl) {
            const pct = Math.round((progress.unlocked / progress.total) * 100);
            progressEl.textContent = `Đã mở khóa ${progress.unlocked}/${progress.total} (${pct}%)`;
        }

        if (!listEl) return;

        let html = '';
        for (const def of Achievements) {
            const unlocked = this.achievements.isUnlocked(def.id);
            // Locked cards keep their own glyph (dimmed by the card's filter)
            // with a lock badge, so the list reads as one set of achievements
            // rather than a row of identical padlocks.
            html += `
                <div class="achv-card${unlocked ? ' unlocked' : ''}">
                    <div class="achv-card-icon">${def.icon}${unlocked ? ''
                        : '<svg class="ui-icon achv-lock" aria-hidden="true"><use href="#i-lock"/></svg>'}</div>
                    <div>
                        <div class="achv-card-name">${def.name}</div>
                        <div class="achv-card-desc">${def.description}</div>
                    </div>
                </div>
            `;
        }
        listEl.innerHTML = html;
    }

    // ── DOM helpers ──────────────────────────────────────────────

    _show(el) {
        if (el) el.classList.remove('hidden');
    }

    _hide(el) {
        if (el) el.classList.add('hidden');
    }

    _on(el, type, fn) {
        el.addEventListener(type, fn);
        this._bound.push({ el, type, fn });
    }

    _setSlider(id, value, labelId, labelText) {
        const el = document.getElementById(id);
        if (el) el.value = String(value);
        if (labelId) this._setValueLabel(id, labelText, labelId);
    }

    _setToggle(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = !!checked;
    }

    /**
     * Update the readout next to a control. The label id is derived from the
     * control id (`set-foo` → `val-foo`) unless one is passed explicitly.
     */
    _setValueLabel(controlId, text, labelId = null) {
        const id = labelId || controlId.replace(/^set-/, 'val-');
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
}
