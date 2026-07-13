export class CameraDebug {
    constructor(enabled) {
        this.enabled = enabled;
        this._lookTargetEl = null;
        this._pivotEl = null;
        this._desiredEl = null;
        this._finalEl = null;
        this._collisionEl = null;
        this._terrainEl = null;
        this._rotEl = null;
        this._distEl = null;
    }

    update(camera) {
        if (!this.enabled) return;

        this._ensureElements();

        if (this._rotEl) {
            const yawDeg = Math.round((camera._yaw * 180 / Math.PI)) % 360;
            const pitchDeg = Math.round(camera._pitch * 180 / Math.PI);
            this._rotEl.textContent = `Y: ${yawDeg}°, P: ${pitchDeg}°`;
        }

        if (this._distEl) {
            this._distEl.textContent = `${camera._distance.toFixed(2)}m`;
        }

        if (this._lookTargetEl && camera._lookTarget) {
            const t = camera._lookTarget;
            this._lookTargetEl.textContent = `X:${t[0].toFixed(1)} Y:${t[1].toFixed(1)} Z:${t[2].toFixed(1)}`;
        }

        if (this._pivotEl && camera._pivot) {
            const p = camera._pivot;
            this._pivotEl.textContent = `X:${p[0].toFixed(1)} Y:${p[1].toFixed(1)} Z:${p[2].toFixed(1)}`;
        }

        if (this._finalEl && camera.position) {
            const p = camera.position;
            this._finalEl.textContent = `X:${p[0].toFixed(1)} Y:${p[1].toFixed(1)} Z:${p[2].toFixed(1)}`;
        }

        if (this._collisionEl && camera._collision) {
            const c = camera._collision;
            this._collisionEl.textContent = c.hit
                ? `HIT d:${c.distance.toFixed(2)}`
                : 'clear';
        }

        if (this._terrainEl) {
            this._terrainEl.textContent = camera._terrainYDelta
                ? `+${camera._terrainYDelta.toFixed(2)}m`
                : 'none';
        }
    }

    _ensureElements() {
        if (this._rotEl) return;
        this._rotEl = document.getElementById('debug-cam-rot');
        this._distEl = document.getElementById('debug-cam-dist');
        this._lookTargetEl = document.getElementById('debug-cam-look');
        this._pivotEl = document.getElementById('debug-cam-pivot');
        this._finalEl = document.getElementById('debug-cam-final');
        this._collisionEl = document.getElementById('debug-cam-collision');
        this._terrainEl = document.getElementById('debug-cam-terrain');
    }
}
