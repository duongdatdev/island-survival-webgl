export class CameraConfig {
    constructor() {
        this.Projection = {
            fov: 45 * Math.PI / 180,
            near: 0.1,
            far: 1000.0,
            aspect: 1.0,
        };

        this.Orbit = {
            headHeight: 1.2,
            pivotHeight: 1.8,
            defaultDistance: 4.0,
            minDistance: 1.5,
            maxDistance: 20.0,
            defaultPitch: 20 * Math.PI / 180,
            defaultYaw: Math.PI,
            pitchMin: -35 * Math.PI / 180,
            pitchMax: 65 * Math.PI / 180,
            mouseSensitivity: 0.003,
        };

        this.Collision = {
            radius: 0.3,
            enabled: true,
        };

        this.Terrain = {
            offset: 0.2,
            enabled: true,
        };

        this.Zoom = {
            speed: 0.75,
            restitution: 0.2,
        };

        this.Shoulder = {
            offsetX: 0.0,
            offsetY: 0.0,
        };

        this.Debug = {
            enabled: true,
        };

        this.Smoothing = {
            rotationSmoothSpeed: 8.0,
            positionSmoothSpeed: 10.0,
            distanceSmoothSpeed: 6.0,
        };
    }

    clone() {
        const c = new CameraConfig();
        this._copyGroup(c.Projection, this.Projection);
        this._copyGroup(c.Orbit, this.Orbit);
        this._copyGroup(c.Collision, this.Collision);
        this._copyGroup(c.Terrain, this.Terrain);
        this._copyGroup(c.Zoom, this.Zoom);
        this._copyGroup(c.Shoulder, this.Shoulder);
        this._copyGroup(c.Debug, this.Debug);
        this._copyGroup(c.Smoothing, this.Smoothing);
        return c;
    }

    applyOverrides(overrides) {
        for (const key in overrides) {
            if (overrides.hasOwnProperty(key)) {
                this._setDeep(this, key, overrides[key]);
            }
        }
    }

    _copyGroup(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
    }

    _setDeep(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) return;
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }
}
