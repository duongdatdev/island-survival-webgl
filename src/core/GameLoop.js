export class GameLoop {
    constructor() {
        this.isActive = false;
        this.lastTime = 0;
        this.fpsUpdateTime = 0;
        this.fpsFrameCount = 0;
        this.fps = 0;

        this.onUpdate = null;
        this.onRender = null;

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

        let deltaTime = (currentTime - this.lastTime) / 1000.0;
        this.lastTime = currentTime;

        if (deltaTime > 0.1) {
            deltaTime = 0.1;
        }

        this.fpsFrameCount++;
        const elapsed = currentTime - this.fpsUpdateTime;
        if (elapsed >= 500) {
            this.fps = Math.round((this.fpsFrameCount * 1000.0) / elapsed);
            this.fpsFrameCount = 0;
            this.fpsUpdateTime = currentTime;
            
            const fpsEl = document.getElementById('debug-fps');
            if (fpsEl) {
                fpsEl.textContent = `FPS: ${this.fps}`;
            }
        }

        if (this.onUpdate) {
            this.onUpdate(deltaTime);
        }
        if (this.onRender) {
            this.onRender();
        }

        requestAnimationFrame(this._tick);
    }
}
