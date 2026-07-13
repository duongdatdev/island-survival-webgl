export class CameraZoomController {
    constructor(defaultDistance) {
        this._target = defaultDistance;
    }

    handleScroll(delta, config) {
        this._target += delta * config.zoomSpeed;
        this._target = Math.max(
            config.minDistance,
            Math.min(this._target, config.maxDistance)
        );
    }

    applyCollisionPush(safeDistance) {
        if (safeDistance < this._target) {
            this._target = safeDistance;
        }
    }

    getTarget() {
        return this._target;
    }

    reset(distance) {
        this._target = distance;
    }
}
