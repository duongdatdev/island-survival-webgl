import { GameLoop } from './GameLoop.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { AssetManager } from './AssetManager.js';

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
        this.scenes = new SceneManager(this);
        this.loop = new GameLoop();

        // Connect Loop Callbacks
        this.loop.onUpdate = (deltaTime) => this._update(deltaTime);
        this.loop.onRender = () => this._render();

        // Hook Window Resize Events
        this._resize = this._resize.bind(this);
        window.addEventListener('resize', this._resize);
        this._resize(); // Trigger immediate scale check
    }

    start() {
        this.loop.start();
    }

    stop() {
        this.loop.stop();
    }

    _resize() {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _update(deltaTime) {
        this.scenes.update(deltaTime);
        
        // Reset key/mouse movement deltas post updates
        this.input.resetDeltas();
    }

    _render() {
        this.scenes.render();
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', this._resize);
        this.input = null;
        this.assets.clear();
        this.assets = null;
        this.scenes.destroy();
        this.scenes = null;
        this.gl = null;
        console.log('Engine destroyed.');
    }
}
