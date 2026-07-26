import { GameLoop } from './GameLoop.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { AssetManager } from './AssetManager.js';
import { AudioManager } from './AudioManager.js';
import { SettingsManager } from '../systems/SettingsManager.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';

/**
 * Core game engine orchestrating WebGL contexts and manager instances
 */
export class Engine {
    /**
     * @param {string} canvasId - DOM ID of the target rendering canvas
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Engine: Canvas element with ID '${canvasId}' not found.`);
        }

        // Initialize WebGL 2.0 context
        this.gl = this.canvas.getContext('webgl2', {
            antialias: true,
            depth: true,
            alpha: false,
            stencil: false,
            premultipliedAlpha: false
        });

        if (!this.gl) {
            alert('Trình duyệt của bạn không hỗ trợ WebGL 2. Vui lòng cập nhật trình duyệt để chơi game.');
            throw new Error('Engine: WebGL 2 context creation failed.');
        }

        console.log('Engine: WebGL 2 context initialized successfully.');

        // Set default WebGL state variables
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        // Core Managers
        this.input = new InputManager(this.canvas);
        this.assets = new AssetManager(gl);
        this.audio = new AudioManager();
        this.scenes = new SceneManager(this);
        this.loop = new GameLoop();

        // v1.0 profile-level managers — these outlive individual scenes, so
        // settings and unlocked achievements survive a return to the menu.
        this.settings = new SettingsManager();
        this.achievements = new AchievementSystem();

        // Audio levels come straight from the stored settings; the AudioContext
        // itself is created lazily on the first user gesture.
        this.audio.applySettings(this.settings);

        /** @type {object|null} Save payload staged for the next GameScene. */
        this.pendingLoad = null;

        // Pause state
        this.isPaused = false;

        // Connect Loop Callbacks
        this.loop.onUpdate = (deltaTime) => this._update(deltaTime);
        this.loop.onRender = () => this._render();

        // Hook Window Resize Events. The listener is a wrapper rather than the
        // bound method itself so the DOM Event object can't land in `force`.
        this._resize = this._resize.bind(this);
        this._onWindowResize = () => this._resize();
        window.addEventListener('resize', this._onWindowResize);

        // Render scale is a graphics setting, so re-run the sizing logic
        // whenever it changes rather than waiting for the next window resize.
        this._unsubscribeSettings = this.settings.onChange((key) => {
            if (key === 'renderScale' || key === '*') this._resize(true);
            if (key === 'masterVolume' || key === 'sfxVolume' || key === 'ambientVolume' || key === '*') {
                this.audio.applySettings(this.settings);
            }
        });

        this._resize(); // Trigger immediate scale check
    }

    start() {
        this.loop.start();
    }

    stop() {
        this.loop.stop();
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    /**
     * Match the drawing buffer to the window, scaled by the `renderScale`
     * graphics setting. The CSS size always fills the window — only the
     * backing store shrinks — so lowering the scale trades sharpness for fill
     * rate without changing the layout.
     * @param {boolean} [force] Recompute even if the window size is unchanged.
     */
    _resize(force = false) {
        const scale = this.settings ? this.settings.get('renderScale') : 1.0;
        const displayWidth = Math.max(1, Math.floor(window.innerWidth * scale));
        const displayHeight = Math.max(1, Math.floor(window.innerHeight * scale));

        if (force || this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _update(deltaTime) {
        // When paused, skip game logic updates but still allow scene to handle pause rendering
        if (this.isPaused) {
            // Still reset input deltas so they don't accumulate
            this.input.resetDeltas();
            return;
        }

        this.scenes.update(deltaTime);
        
        // Reset key/mouse movement deltas post updates
        this.input.resetDeltas();
    }

    _render() {
        this.scenes.render();
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', this._onWindowResize);
        if (this._unsubscribeSettings) {
            this._unsubscribeSettings();
            this._unsubscribeSettings = null;
        }
        this.input = null;
        this.assets.clear();
        this.assets = null;
        if (this.audio) {
            this.audio.destroy();
            this.audio = null;
        }
        this.scenes.destroy();
        this.scenes = null;
        this.gl = null;
        console.log('Engine destroyed.');
    }
}
