import { Scene } from '../core/Scene.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { SkyShader } from '../shaders/SkyShader.js';
import { Water } from '../entities/Water.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { Camera } from '../renderer/Camera.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { MenuUI } from '../systems/MenuUI.js';

/**
 * Sun sits ~2.5° above the waterline so it reads as setting, and ~27° off-axis
 * so the menu panel never covers it. The camera looks down +Z, which puts world
 * +X on the *left* of the frame — the drift swings the sun between roughly 11%
 * and 23% of screen width.
 */
const SUN_DIRECTION = Vec3.create(0.50, 0.049, 1.0);

/**
 * The key light is deliberately *not* the sun. A light this low would leave
 * the ocean lit by ambient alone — near black — so the diffuse key is lifted
 * while the sun direction still drives the sky and the glitter path, which is
 * what the eye actually reads as "the sun is over there".
 */
const KEY_LIGHT_DIRECTION = [0.50, 0.55, 1.0];

/** Distant water fades into this over ~130 units, hiding the plane's far edge. */
const FOG_START = 18.0;
const FOG_DENSITY = 0.018;

/**
 * Wave heading, slightly off the camera axis so the swell rolls in at an angle
 * rather than marching straight at the viewer.
 */
const WAVE_HEADING = [0.32, -0.95];

/** Unused here (the menu plane is all deep water) but the uniform must be set. */
const SHALLOW_COLOR = [0.24, 0.66, 0.62];

/**
 * Main Menu Scene — first screen after loading.
 * Renders an animated dusk ocean behind the menu overlay: a procedural sky
 * dome (SkyShader), then the wave grid fogged into the same horizon colour.
 *
 * v1.0 adds Continue (resume a stored save), Settings, Achievements and
 * Credits, all sharing the overlay controller in MenuUI.
 */
export class MainMenuScene extends Scene {
    init() {
        console.log('MainMenuScene: Initializing...');
        const gl = this.gl;

        // Setup water background rendering. The plane is far wider than the
        // gameplay one because nothing hides its far edge here — distance fog
        // has to carry it all the way to the horizon.
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);
        this.water = new Water(gl, 96, 300.0);

        // Procedural sky dome. A failure here must not cost us the menu, so
        // fall back to the old flat clear colour.
        this.skyShader = null;
        this.skyVao = null;
        try {
            this.skyShader = new ShaderProgram(gl, SkyShader.vertex, SkyShader.fragment);
            // The fullscreen triangle comes from gl_VertexID, but WebGL 2 still
            // insists on some VAO being bound for the draw.
            this.skyVao = gl.createVertexArray();
        } catch (e) {
            console.error('MainMenuScene: sky shader failed to compile, using a flat sky.', e);
        }

        // Camera — static cinematic ocean view. The shallow pitch puts the
        // waterline just above centre, which leaves room for actual sky.
        this.camera = new Camera(50 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.1, 500.0);
        this.camera.position = Vec3.create(0, 4.0, -12.0);
        this.camera.target = Vec3.create(0, 1.2, 8.0);
        const up = Vec3.create(0, 1, 0);
        Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

        // Reused every frame to hand the sky shader its view rays.
        this._viewProj = Mat4.create();
        this._invViewProj = Mat4.create();
        this._updateInvViewProj();

        // Lighting — see KEY_LIGHT_DIRECTION for why this isn't the sun.
        this.dirLight = new DirectionalLight(KEY_LIGHT_DIRECTION, [1.0, 0.80, 0.56], 0.95);
        this.ambientLight = new AmbientLight([0.15, 0.20, 0.35], 0.5);

        this.time = 0;

        // Only shows on the first frame, or if the sky shader failed — hence
        // the mid-sky blue rather than the horizon's orange.
        const fallback = SkyShader.palette.mid;
        gl.clearColor(fallback[0], fallback[1], fallback[2], 1.0);

        // Show menu overlay
        this._showMenu();

        // v1.0 shared overlay controller (settings / achievements / credits / guide)
        this.menuUI = new MenuUI(this.engine, {
            onGuidePlay: () => this._startWithTutorial(),
        });

        // Bind button events
        this._startBtn = document.getElementById('menu-start-btn');
        this._tutorialBtn = document.getElementById('menu-tutorial-btn');
        this._soundBtn = document.getElementById('menu-sound-btn');
        this._continueBtn = document.getElementById('menu-continue-btn');
        this._settingsBtn = document.getElementById('menu-settings-btn');
        this._achievementsBtn = document.getElementById('menu-achievements-btn');
        this._creditsBtn = document.getElementById('menu-credits-btn');

        this._onStartClick = () => {
            // A fresh run must not inherit a staged save, otherwise "Bắt đầu"
            // right after "Chơi tiếp" would silently reload the old game.
            this.engine.pendingLoad = null;
            this._enterGame();
        };

        // The guide button used to drop straight into the game, which made the
        // label a lie — now it opens the how-to-play panel and the player
        // starts from a button inside it.
        this._onTutorialClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.playClick();
            this.menuUI.openGuide();
        };

        this._onContinueClick = () => {
            const save = SaveSystem.load();
            if (!save) {
                // The save vanished between render and click (cleared in
                // another tab, or quota-evicted) — drop the button and bail.
                this._refreshContinueButton();
                return;
            }
            this.engine.pendingLoad = save;
            this._enterGame();
        };

        this._onSoundClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.resume();
            const muted = this.engine.audio.toggleMute();
            this.engine.settings.set('muted', muted);
            this._updateSoundButton(muted);
            if (!muted) this.engine.audio.playClick();
        };

        this._onSettingsClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.playClick();
            this.menuUI.openSettings();
        };

        this._onAchievementsClick = () => {
            this.engine.audio.playClick();
            this.menuUI.openAchievements();
        };

        this._onCreditsClick = () => {
            this.engine.audio.playClick();
            this.menuUI.openCredits();
        };

        if (this._startBtn) this._startBtn.addEventListener('click', this._onStartClick);
        if (this._tutorialBtn) this._tutorialBtn.addEventListener('click', this._onTutorialClick);
        if (this._soundBtn) this._soundBtn.addEventListener('click', this._onSoundClick);
        if (this._continueBtn) this._continueBtn.addEventListener('click', this._onContinueClick);
        if (this._settingsBtn) this._settingsBtn.addEventListener('click', this._onSettingsClick);
        if (this._achievementsBtn) this._achievementsBtn.addEventListener('click', this._onAchievementsClick);
        if (this._creditsBtn) this._creditsBtn.addEventListener('click', this._onCreditsClick);

        // Update sound button initial state
        this._updateSoundButton(this.engine.audio.isMuted);
        this._refreshContinueButton();
        this._refreshAchievementsButton();

        // Start ambient waves on menu
        this.engine.audio._ensureContext();
        this.engine.audio.startAmbientWaves();
        this.engine.audio.startMusic();
    }

    update(deltaTime) {
        this.time += deltaTime;

        // Achievement toasts can still be in flight when returning from a run.
        this.engine.achievements.update(deltaTime);

        // ESC closes whichever v1.0 panel is open.
        if (this.engine.input.isKeyPressed('Escape') && this.menuUI && this.menuUI.isAnyOpen()) {
            this.menuUI.closeAll();
        }

        // Slow camera drift
        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);

        const camX = Math.sin(this.time * 0.08) * 3.0;
        const camY = 4.0 + Math.sin(this.time * 0.15) * 0.35;
        Vec3.set(this.camera.position, camX, camY, -12.0);
        Vec3.set(this.camera.target, camX * 0.3, 1.2, 8.0);

        const up = Vec3.create(0, 1, 0);
        Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

        // The light no longer swings around: it is the sun the sky paints, and
        // a drifting key would pull the water highlights off the glitter path.
        this._updateInvViewProj();
    }

    /**
     * Rebuild the inverse view-projection the sky pass unprojects with. A
     * degenerate matrix would hand the shader NaN rays, so keep the last good
     * one rather than rendering garbage.
     */
    _updateInvViewProj() {
        Mat4.multiply(this._viewProj, this.camera.projectionMatrix, this.camera.viewMatrix);
        Mat4.invert(this._invViewProj, this._viewProj);
    }

    render() {
        const gl = this.gl;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this._renderSky();

        // Draw ocean background
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.waterShader.use();
        this.waterShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.waterShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.waterShader.setUniform3fv('uViewPosition', this.camera.position);
        this.waterShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.waterShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.waterShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.waterShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.waterShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);
        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', 1.0);

        // These used to be left unset, which meant amplitude and speed both
        // defaulted to zero — the "animated" menu ocean was a still plane.
        this.waterShader.setUniform1f('uWaveAmplitude', 1.2);
        this.waterShader.setUniform1f('uWaveSpeed', 0.7);
        // No island to break on, so the field runs at full height everywhere.
        this.waterShader.setUniform1f('uWaveAttenStart', 0.0);
        this.waterShader.setUniform1f('uWaveAttenEnd', 1.0);
        // Swell rolls towards the camera, which looks down +Z.
        this.waterShader.setUniform2f('uWaveHeading', WAVE_HEADING[0], WAVE_HEADING[1]);

        const horizon = SkyShader.palette.horizon;
        this.waterShader.setUniform3fv('uFogColor', horizon);
        this.waterShader.setUniform1f('uFogStart', FOG_START);
        this.waterShader.setUniform1f('uFogDensity', FOG_DENSITY);

        // The menu plane has no seabed, so every vertex is flagged deep: the
        // shallow tint never shows and the depth alpha lands on the old 0.85.
        this.waterShader.setUniform3fv('uHorizonColor', horizon);
        this.waterShader.setUniform3fv('uShallowColor', SHALLOW_COLOR);

        // Full ripple detail — the wide plane needs it to carry the glitter.
        // Both foams stay off: there is no shore here, and at this distance a
        // crest threshold flickers across the coarse grid instead of reading
        // as spray.
        this.waterShader.setUniform1f('uDetailStrength', 1.0);
        this.waterShader.setUniform1f('uFoamStrength', 0.0);
        this.waterShader.setUniform1f('uWhitecaps', 0.0);

        this.waterShader.setUniform3fv('uSunDirection', SUN_DIRECTION);
        this.waterShader.setUniform3fv('uSunColor', SkyShader.palette.sun);
        this.waterShader.setUniform1f('uSunGlitter', 0.6);

        this.water.draw(this.waterShader);

        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
    }

    /**
     * Fullscreen sky pass. Runs before everything with depth writes off so it
     * never occludes the water, and restores the state the water pass expects.
     */
    _renderSky() {
        if (!this.skyShader) return;

        const gl = this.gl;
        const palette = SkyShader.palette;

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.skyVao);

        this.skyShader.use();
        this.skyShader.setUniformMatrix4fv('uInvViewProj', this._invViewProj);
        this.skyShader.setUniform3fv('uCameraPos', this.camera.position);
        this.skyShader.setUniform3fv('uSunDirection', SUN_DIRECTION);
        this.skyShader.setUniform3fv('uSunColor', palette.sun);
        this.skyShader.setUniform3fv('uSkyHorizon', palette.horizon);
        this.skyShader.setUniform3fv('uSkyMid', palette.mid);
        this.skyShader.setUniform3fv('uSkyZenith', palette.zenith);
        this.skyShader.setUniform1f('uTime', this.time);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
    }

    _showMenu() {
        const el = document.getElementById('main-menu');
        if (el) el.classList.remove('hidden');

        // Hide gameplay HUD elements
        const hud = document.getElementById('resource-hud');
        if (hud) hud.style.display = 'none';
        const debug = document.getElementById('debug-panel');
        if (debug) debug.classList.add('hidden');
        const escapeHud = document.getElementById('escape-hud');
        if (escapeHud) escapeHud.classList.add('hidden');
        const vitalsHud = document.getElementById('vitals-hud');
        if (vitalsHud) vitalsHud.classList.add('hidden');
    }

    _hideMenu() {
        const el = document.getElementById('main-menu');
        if (el) el.classList.add('hidden');
    }

    /**
     * The menu renders sound as a tile: the icon and the tile colour carry the
     * state, so the label stays a stable width and the row doesn't reflow when
     * you toggle it.
     */
    _updateSoundButton(isMuted) {
        if (!this._soundBtn) return;

        this._soundBtn.innerHTML =
            `<svg class="ui-icon" aria-hidden="true"><use href="#i-volume${isMuted ? '-off' : ''}"/></svg>` +
            '<span class="tile-label">ÂM THANH</span>';
        this._soundBtn.classList.toggle('is-off', isMuted);
        this._soundBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
        this._soundBtn.setAttribute('aria-label', isMuted ? 'Bật âm thanh' : 'Tắt âm thanh');
    }

    /**
     * Start a fresh run from the guide panel, replaying the in-game step hints
     * even for a player who already dismissed them once.
     */
    _startWithTutorial() {
        this.engine.pendingLoad = null;
        try { localStorage.removeItem('island_survival_tutorial_done'); } catch (e) { /* ignore */ }
        this._enterGame();
    }

    /**
     * Common transition into gameplay — audio unlock, click SFX, fade out.
     */
    _enterGame() {
        this.engine.audio._ensureContext();
        this.engine.audio.resume();
        this.engine.audio.playClick();
        this._hideMenu();
        // Small delay for button click sound
        setTimeout(() => {
            this.engine.scenes.switchScene('Game');
        }, 150);
    }

    /**
     * Show "Chơi tiếp" only when a save exists, annotated with how far that
     * run got so the player can tell what they'd be resuming.
     */
    _refreshContinueButton() {
        if (!this._continueBtn) return;

        const meta = SaveSystem.getMeta();
        if (!meta) {
            this._continueBtn.classList.add('hidden');
            return;
        }

        this._continueBtn.classList.remove('hidden');
        const metaEl = document.getElementById('menu-continue-meta');
        if (metaEl) {
            const mins = Math.floor(meta.survivalSeconds / 60).toString().padStart(2, '0');
            const secs = Math.floor(meta.survivalSeconds % 60).toString().padStart(2, '0');
            metaEl.textContent = `${mins}:${secs}`;
        }
    }

    _refreshAchievementsButton() {
        const metaEl = document.getElementById('menu-achievements-meta');
        if (!metaEl) return;
        const progress = this.engine.achievements.getProgress();
        metaEl.textContent = `${progress.unlocked}/${progress.total}`;
    }

    destroy() {
        console.log('MainMenuScene: Destroying...');

        // Remove event listeners
        if (this._startBtn) this._startBtn.removeEventListener('click', this._onStartClick);
        if (this._tutorialBtn) this._tutorialBtn.removeEventListener('click', this._onTutorialClick);
        if (this._soundBtn) this._soundBtn.removeEventListener('click', this._onSoundClick);
        if (this._continueBtn) this._continueBtn.removeEventListener('click', this._onContinueClick);
        if (this._settingsBtn) this._settingsBtn.removeEventListener('click', this._onSettingsClick);
        if (this._achievementsBtn) this._achievementsBtn.removeEventListener('click', this._onAchievementsClick);
        if (this._creditsBtn) this._creditsBtn.removeEventListener('click', this._onCreditsClick);

        if (this.menuUI) {
            this.menuUI.dispose();
            this.menuUI = null;
        }

        if (this.waterShader) this.waterShader.delete();
        if (this.water) this.water.delete();
        if (this.skyShader) {
            this.skyShader.delete();
            this.skyShader = null;
        }
        if (this.skyVao) {
            this.gl.deleteVertexArray(this.skyVao);
            this.skyVao = null;
        }

        this.engine.audio.stopMusic();
    }
}
