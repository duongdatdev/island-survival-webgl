import { GameLoop } from './GameLoop.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { AssetManager } from './AssetManager.js';
import { AudioManager } from './AudioManager.js';
import { SettingsManager } from '../systems/SettingsManager.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';

export class Engine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Engine: Canvas element with ID '${canvasId}' not found.`);
        }

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

        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        this.input = new InputManager(this.canvas);
        this.assets = new AssetManager(gl);
        this.audio = new AudioManager();
        this.scenes = new SceneManager(this);
        this.loop = new GameLoop();

        this.settings = new SettingsManager();
        this.achievements = new AchievementSystem();

        this.input.setBindings(this.settings.get('keyBindings'));

        this.audio.applySettings(this.settings);

        this.pendingLoad = null;
        this.activeWorldId = null;
        this.generatedWorld = null;
        this.worldSeed = '';

        this.isPaused = false;

        this.loop.onUpdate = (deltaTime) => this._update(deltaTime);
        this.loop.onRender = () => this._render();

        this._resize = this._resize.bind(this);
        this._onWindowResize = () => this._resize();
        window.addEventListener('resize', this._onWindowResize);

        this._unsubscribeSettings = this.settings.onChange((key) => {
            if (key === 'renderScale' || key === '*') this._resize(true);
            if (key === 'masterVolume' || key === 'sfxVolume' || key === 'ambientVolume' || key === '*') {
                this.audio.applySettings(this.settings);
            }
            if (key === 'keyBindings' || key === '*') {
                this.input.setBindings(this.settings.get('keyBindings'));
            }
        });

        this._resize();
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
        if (this.isPaused) {
            this.input.resetDeltas();
            return;
        }

        this.scenes.update(deltaTime);
        
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
