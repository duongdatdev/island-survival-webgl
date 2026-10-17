
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
        antialiasing: false, shadows: false, shadowResolution: 512, shadowDistance: 28,
        ambientOcclusion: false, foliageDensity: 0.3, foliageDistance: 38, waterQuality: 0.15, pixelRatioLimit: 1,
    },
    medium: {
        label: 'Trung Bình',
        renderScale: 0.85,
        postProcessing: true,
        bloom: false,
        particleDensity: 0.7,
        viewDistance: 90,
        antialiasing: true, shadows: true, shadowResolution: 1024, shadowDistance: 38,
        ambientOcclusion: false, foliageDensity: 0.6, foliageDistance: 58, waterQuality: 0.4, pixelRatioLimit: 1,
    },
    high: {
        label: 'Cao',
        renderScale: 1.0,
        postProcessing: true,
        bloom: true,
        particleDensity: 1.0,
        viewDistance: 130,
        antialiasing: true, shadows: true, shadowResolution: 1536, shadowDistance: 62,
        ambientOcclusion: true, foliageDensity: 1, foliageDistance: 85, waterQuality: 0.7, pixelRatioLimit: 1.25,
    },
    ultra: {
        label: 'Siêu Cao',
        renderScale: 1.0,
        postProcessing: true,
        bloom: true,
        particleDensity: 1.4,
        viewDistance: 200,
        antialiasing: true, shadows: true, shadowResolution: 2048, shadowDistance: 90,
        ambientOcclusion: true, foliageDensity: 1.35, foliageDistance: 115, waterQuality: 1, pixelRatioLimit: 1.5,
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
    reducedMotion: false,
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
    antialiasing: true,
    shadows: true,
    shadowResolution: 1536,
    shadowDistance: 62,
    ambientOcclusion: true,
    foliageDensity: 1,
    foliageDistance: 85,
    waterQuality: 0.7,
    pixelRatioLimit: 1.25,

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
    shadowResolution: [256, 2048],
    shadowDistance: [20, 100],
    foliageDensity: [0, 1.5],
    foliageDistance: [24, 140],
    waterQuality: [0, 1],
    pixelRatioLimit: [1, 2],
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
        for (const [key, value] of Object.entries(preset)) {
            if (key !== 'label') this.set(key, value, true);
        }
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
    'antialiasing', 'shadows', 'shadowResolution', 'shadowDistance', 'ambientOcclusion',
    'foliageDensity', 'foliageDistance', 'waterQuality', 'pixelRatioLimit',
];
