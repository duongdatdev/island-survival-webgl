import { Scene } from '../core/Scene.js';

/**
 * Loading screen scene that tracks AssetManager status and updates the UI
 */
export class LoadingScene extends Scene {
    init() {
        console.log('LoadingScene: Initializing resources...');

        // Reset and display the HTML loader overlay
        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.remove('hidden');
        }

        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.classList.add('hidden'); // Hide debug during load
        }

        // 1. Queue core textures (using small data URLs to guarantee immediate, CORS-free resolution)
        this.engine.assets.loadTexture(
            'player_skin', 
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );

        // 2. Queue simulated heavy loads (1.5s delay) to showcase the UI animation smoothly
        this.loadingDelay = new Promise(resolve => setTimeout(resolve, 1500));

        // Wait for all assets to resolve
        Promise.all([this.loadingDelay])
            .then(() => {
                this._onLoadComplete();
            })
            .catch(err => {
                console.error('LoadingScene: Error during asset retrieval', err);
                this._onLoadComplete(); // Safe fallback
            });
    }

    update(deltaTime) {
        // Track AssetManager progress ratio
        const progress = this.engine.assets.getProgress();
        const percent = Math.round(progress * 100);

        // Update loading progress bar element
        const barEl = document.getElementById('loader-bar');
        if (barEl) {
            barEl.style.width = `${percent}%`;
        }

        // Update progress readout text
        const textEl = document.getElementById('loader-text');
        if (textEl) {
            textEl.textContent = `Đang tải tài nguyên (${percent}%)...`;
        }
    }

    render() {
        const gl = this.gl;
        
        // Clear with deep space/night background
        gl.clearColor(0.04, 0.05, 0.09, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    _onLoadComplete() {
        console.log('LoadingScene: Assets loaded. Transitioning to Game...');

        // Fade out overlay
        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.add('hidden');
        }

        // Reveal debug panel
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.classList.remove('hidden');
        }

        // Switch to Game Scene
        this.engine.scenes.switchScene('Game');
    }

    destroy() {
        console.log('LoadingScene destroyed.');
    }
}
