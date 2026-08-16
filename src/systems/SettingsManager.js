
const STORAGE_KEY = 'island_survival_settings_v1';

import { DEFAULT_KEY_BINDINGS } from '../core/InputManager.js';

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
    masterVolume: 0.8,
    sfxVolume: 0.9,
    ambientVolume: 0.7,
    musicVolume: 0.6,
    muted: false,

    mouseSensitivity: 1.0,
    invertY: false,
    keyBindings: DEFAULT_KEY_BINDINGS,

    quality: 'high',
    renderScale: 1.0,
    postProcessing: true,
    bloom: true,
    bloomIntensity: 0.75,
    vignette: true,
    particleDensity: 1.0,
    viewDistance: 130,
    fov: 70,
    frustumCulling: true,

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
        this.values = JSON.parse(JSON.stringify(DEFAULTS));

        this._listeners = new Set();

        this.load();
    }


    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                for (const key of Object.keys(DEFAULTS)) {
                    if (parsed[key] !== undefined) {
                        if (key === 'keyBindings' && typeof parsed[key] === 'object') {
                            this.values[key] = Object.assign(
                                JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS)),
                                parsed[key]
                            );
                        } else {
                            this.values[key] = parsed[key];
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('SettingsManager: could not read stored settings, using defaults.', e);
        }

        try {
            const legacyMute = localStorage.getItem('island_survival_muted');
            if (legacyMute !== null) {
                this.values.muted = legacyMute === 'true';
            }
        } catch (e) { }

        this._clampAll();
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch (e) {
            console.warn('SettingsManager: could not persist settings.', e);
        }
    }


    get(key) {
        return this.values[key];
    }

    set(key, value, fromPreset = false) {
        if (!(key in DEFAULTS)) {
            console.warn(`SettingsManager: unknown setting '${key}'`);
            return;
        }

        this.values[key] = this._clamp(key, value);

        if (!fromPreset && GRAPHICS_KEYS.includes(key) && this.values.quality !== 'custom') {
            this.values.quality = 'custom';
        }

        this.save();
        this._notify(key, this.values[key]);
    }

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
        this.values = JSON.parse(JSON.stringify(DEFAULTS));
        this.save();
        this._notify('*', null);
    }

    resetKeyBindings() {
        this.set('keyBindings', JSON.parse(JSON.stringify(DEFAULT_KEY_BINDINGS)));
    }


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

const GRAPHICS_KEYS = [
    'renderScale', 'postProcessing', 'bloom', 'bloomIntensity',
    'vignette', 'particleDensity', 'viewDistance', 'frustumCulling',
];
