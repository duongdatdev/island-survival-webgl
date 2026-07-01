/**
 * Precise game loop manager utilizing requestAnimationFrame
 */
export class GameLoop {
    constructor() {
        this.isActive = false;
        this.lastTime = 0;
        this.fpsUpdateTime = 0;
        this.fpsFrameCount = 0;
        this.fps = 0;

        // Callback slots
        this.onUpdate = null;
        this.onRender = null;

        // Bind the tick method to the current context
        this._tick = this._tick.bind(this);
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.lastTime = performance.now();
        this.fpsUpdateTime = this.lastTime;
        this.fpsFrameCount = 0;
        requestAnimationFrame(this._tick);
    }

    stop() {
        this.isActive = false;
    }

    _tick(currentTime) {
        if (!this.isActive) return;

        // Calculate delta time in seconds
        let deltaTime = (currentTime - this.lastTime) / 1000.0;
        this.lastTime = currentTime;

        // Clamp delta time to avoid huge leaps during lags or tab suspends
        if (deltaTime > 0.1) {
            deltaTime = 0.1;
        }

        // Track and compute FPS (average every 500ms)
        this.fpsFrameCount++;
        const elapsed = currentTime - this.fpsUpdateTime;
        if (elapsed >= 500) {
            this.fps = Math.round((this.fpsFrameCount * 1000.0) / elapsed);
            this.fpsFrameCount = 0;
            this.fpsUpdateTime = currentTime;
            
            // Push FPS updates directly to DOM
            const fpsEl = document.getElementById('debug-fps');
            if (fpsEl) {
                fpsEl.textContent = `FPS: ${this.fps}`;
            }
        }

        // Trigger updates and renders
        if (this.onUpdate) {
            this.onUpdate(deltaTime);
        }
        if (this.onRender) {
            this.onRender();
        }

        // Loop next frame
        requestAnimationFrame(this._tick);
    }
}
