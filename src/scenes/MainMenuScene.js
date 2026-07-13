import { Scene } from '../core/Scene.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { Water } from '../entities/Water.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { Camera } from '../renderer/Camera.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * Main Menu Scene — first screen after loading.
 * Renders animated ocean background with glassmorphism UI overlay.
 */
export class MainMenuScene extends Scene {
    init() {
        console.log('MainMenuScene: Initializing...');
        const gl = this.gl;

        // Setup water background rendering
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);
        this.water = new Water(gl, 60, 120.0);

        // Camera — static cinematic ocean view
        this.camera = new Camera(50 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.1, 500.0);
        this.camera.position = Vec3.create(0, 6.0, -12.0);
        this.camera.target = Vec3.create(0, 0.5, 8.0);
        const up = Vec3.create(0, 1, 0);
        Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

        // Lighting
        this.dirLight = new DirectionalLight([0.5, 1.0, 0.3], [1.0, 0.92, 0.80], 1.0);
        this.ambientLight = new AmbientLight([0.15, 0.20, 0.35], 0.5);

        this.time = 0;

        // Sky gradient background
        gl.clearColor(0.08, 0.12, 0.22, 1.0);

        // Show menu overlay
        this._showMenu();

        // Bind button events
        this._startBtn = document.getElementById('menu-start-btn');
        this._tutorialBtn = document.getElementById('menu-tutorial-btn');
        this._soundBtn = document.getElementById('menu-sound-btn');

        this._onStartClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.resume();
            this.engine.audio.playClick();
            this._hideMenu();
            // Small delay for button click sound
            setTimeout(() => {
                this.engine.scenes.switchScene('Game');
            }, 150);
        };

        this._onTutorialClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.resume();
            this.engine.audio.playClick();
            // Reset tutorial so it plays again
            try { localStorage.removeItem('island_survival_tutorial_done'); } catch(e) {}
            this._hideMenu();
            setTimeout(() => {
                this.engine.scenes.switchScene('Game');
            }, 150);
        };

        this._onSoundClick = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.resume();
            const muted = this.engine.audio.toggleMute();
            this._updateSoundButton(muted);
            if (!muted) this.engine.audio.playClick();
        };

        if (this._startBtn) this._startBtn.addEventListener('click', this._onStartClick);
        if (this._tutorialBtn) this._tutorialBtn.addEventListener('click', this._onTutorialClick);
        if (this._soundBtn) this._soundBtn.addEventListener('click', this._onSoundClick);

        // Update sound button initial state
        this._updateSoundButton(this.engine.audio.isMuted);

        // Start ambient waves on menu
        this.engine.audio._ensureContext();
        this.engine.audio.startAmbientWaves();
    }

    update(deltaTime) {
        this.time += deltaTime;

        // Slow camera drift
        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);
        
        const camX = Math.sin(this.time * 0.08) * 3.0;
        const camY = 5.0 + Math.sin(this.time * 0.15) * 0.5;
        Vec3.set(this.camera.position, camX, camY, -12.0);
        Vec3.set(this.camera.target, camX * 0.3, 0.5, 8.0);
        
        const up = Vec3.create(0, 1, 0);
        Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, up);

        // Slowly rotate light
        const lx = Math.cos(this.time * 0.1) * 0.5;
        const lz = Math.sin(this.time * 0.1) * 0.5;
        this.dirLight.setDirection(lx, 1.0, lz);
    }

    render() {
        const gl = this.gl;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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

        this.water.draw(this.waterShader);

        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
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

    _updateSoundButton(isMuted) {
        if (this._soundBtn) {
            this._soundBtn.innerHTML = isMuted
                ? '<span class="btn-icon">🔇</span><span class="btn-text">ÂM THANH: TẮT</span>'
                : '<span class="btn-icon">🔊</span><span class="btn-text">ÂM THANH: BẬT</span>';
        }
    }

    destroy() {
        console.log('MainMenuScene: Destroying...');

        // Remove event listeners
        if (this._startBtn) this._startBtn.removeEventListener('click', this._onStartClick);
        if (this._tutorialBtn) this._tutorialBtn.removeEventListener('click', this._onTutorialClick);
        if (this._soundBtn) this._soundBtn.removeEventListener('click', this._onSoundClick);

        if (this.waterShader) this.waterShader.delete();
        if (this.water) this.water.delete();
    }
}
