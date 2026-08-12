/**
 * SettingsManager (v1.0) — persistent user preferences.
 *
 * Everything the settings menu can change lives here so gameplay code reads a
 * single source of truth instead of poking at localStorage. Values are clamped
 * on load, so a hand-edited or stale save can never push the renderer into an
 * invalid state.
 */

const STORAGE_KEY = 'island_survival_settings_v1';

/**
 * Graphics presets. `custom` is what the quality selector falls back to once
 * the player toggles an individual switch, so their tweak isn't silently
 * overwritten the next time a preset value is read.
 */
export const QualityPresets = {
    low: {
        label: 'Thấp',
        renderScale: 0.7,
        postProcessing: false,
        bloom: false,
        particleDensity: 0.4,
        viewDistance: 60,
    },
    medium: {
        label: 'Trung Bình',
        renderScale: 0.85,
        postProcessing: true,
        bloom: false,
        particleDensity: 0.7,
        viewDistance: 90,
    },
    high: {
        label: 'Cao',
        renderScale: 1.0,
        postProcessing: true,
        bloom: true,
        particleDensity: 1.0,
        viewDistance: 130,
    },
    ultra: {
        label: 'Siêu Cao',
        renderScale: 1.0,
        postProcessing: true,
        bloom: true,
        particleDensity: 1.4,
        viewDistance: 200,
    },
};

const DEFAULTS = {
    // Audio (0..1)
    masterVolume: 0.8,
    sfxVolume: 0.9,
    ambientVolume: 0.7,
    musicVolume: 0.6,
    muted: false,

    // Controls
    mouseSensitivity: 1.0,   // multiplier over CameraConfig.Orbit.mouseSensitivity
    invertY: false,

    // Graphics
    quality: 'high',
    renderScale: 1.0,
    postProcessing: true,
    bloom: true,
    bloomIntensity: 0.75,
    vignette: true,
    particleDensity: 1.0,
    viewDistance: 130,
    fov: 70,                 // degrees; wider first-person default
    frustumCulling: true,

    // Interface
    showFps: false,
};

const CLAMPS = {
    masterVolume: [0, 1],
    sfxVolume: [0, 1],
    ambientVolume: [0, 1],
    mouseSensitivity: [0.2, 3.0],
    renderScale: [0.5, 1.0],
    bloomIntensity: [0, 2],
    particleDensity: [0.1, 2.0],
    viewDistance: [40, 250],
    fov: [40, 90],
};

export class SettingsManager {
    constructor() {
        this.values = Object.assign({}, DEFAULTS);

        /** @type {Set<Function>} Listeners notified after any change */
        this._listeners = new Set();

        this.load();
    }

    // ── Persistence ──────────────────────────────────────────────

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                for (const key of Object.keys(DEFAULTS)) {
                    if (parsed[key] !== undefined) {
                        this.values[key] = parsed[key];
                    }
                }
            }
        } catch (e) {
            console.warn('SettingsManager: could not read stored settings, using defaults.', e);
        }

        // Migrate the standalone mute flag written by pre-v1.0 builds so the
        // sound button doesn't appear to reset itself on upgrade.
        try {
            const legacyMute = localStorage.getItem('island_survival_muted');
            if (legacyMute !== null) {
                this.values.muted = legacyMute === 'true';
            }
        } catch (e) { /* ignore */ }

        this._clampAll();
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch (e) {
            console.warn('SettingsManager: could not persist settings.', e);
        }
    }

    // ── Access ───────────────────────────────────────────────────

    get(key) {
        return this.values[key];
    }

    /**
     * Set a single value, persist, and notify listeners.
     * @param {string} key
     * @param {*} value
     * @param {boolean} [fromPreset] Internal flag — preset application should
     *        not flip the quality selector to "custom".
     */
    set(key, value, fromPreset = false) {
        if (!(key in DEFAULTS)) {
            console.warn(`SettingsManager: unknown setting '${key}'`);
            return;
        }

        this.values[key] = this._clamp(key, value);

        // Any manual graphics tweak means the active preset no longer describes
        // the configuration — mark it custom so the UI stays honest.
        if (!fromPreset && GRAPHICS_KEYS.includes(key) && this.values.quality !== 'custom') {
            this.values.quality = 'custom';
        }

        this.save();
        this._notify(key, this.values[key]);
    }

    /**
     * Apply a named quality preset (low | medium | high | ultra).
     */
    applyQualityPreset(name) {
        const preset = QualityPresets[name];
        if (!preset) return;

        this.values.quality = name;
        this.set('renderScale', preset.renderScale, true);
        this.set('postProcessing', preset.postProcessing, true);
        this.set('bloom', preset.bloom, true);
        this.set('particleDensity', preset.particleDensity, true);
        this.set('viewDistance', preset.viewDistance, true);
        this.values.quality = name;

        this.save();
        this._notify('quality', name);
    }

    resetToDefaults() {
        this.values = Object.assign({}, DEFAULTS);
        this.save();
        this._notify('*', null);
    }

    // ── Change notification ──────────────────────────────────────

    /**
     * @param {(key: string, value: *) => void} fn
     * @returns {() => void} unsubscribe
     */
    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify(key, value) {
        for (const fn of this._listeners) {
            try {
                fn(key, value);
            } catch (e) {
                console.error('SettingsManager: listener threw', e);
            }
        }
    }

    // ── Internals ────────────────────────────────────────────────

    _clamp(key, value) {
        const range = CLAMPS[key];
        if (!range || typeof value !== 'number' || Number.isNaN(value)) return value;
        return Math.max(range[0], Math.min(range[1], value));
    }

    _clampAll() {
        for (const key of Object.keys(CLAMPS)) {
            this.values[key] = this._clamp(key, this.values[key]);
        }
        if (this.values.quality !== 'custom' && !QualityPresets[this.values.quality]) {
            this.values.quality = DEFAULTS.quality;
        }
    }
}

/** Keys that belong to the graphics group (see `set`). */
const GRAPHICS_KEYS = [
    'renderScale', 'postProcessing', 'bloom', 'bloomIntensity',
    'vignette', 'particleDensity', 'viewDistance', 'frustumCulling',
];
