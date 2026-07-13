export class CameraCollision {
    constructor() {
        this._provider = null;
        this._lastHitState = false;
    }

    setProvider(provider) {
        this._provider = provider;
    }

    solve(pivot, desired, radius) {
        const dx = desired[0] - pivot[0];
        const dy = desired[1] - pivot[1];
        const dz = desired[2] - pivot[2];
        const maxDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (maxDist < 0.001 || !this._provider || !this._provider.sphereCast) {
            return this._noHit(desired, maxDist);
        }

        const dir = [dx / maxDist, dy / maxDist, dz / maxDist];

        const result = this._provider.sphereCast(pivot, dir, radius, maxDist);

        if (result.hit && result.distance < maxDist) {
            const margin = 0.1;
            const safeDist = Math.max(margin, result.distance - radius * 0.5);
            const hitPos = [
                pivot[0] + dir[0] * safeDist,
                pivot[1] + dir[1] * safeDist,
                pivot[2] + dir[2] * safeDist,
            ];

            const hitResult = {
                hit: true,
                position: hitPos,
                distance: safeDist,
                normal: result.normal || [0, 0, 0],
                collider: result.collider || null,
            };

            this._lastHitState = true;
            return hitResult;
        }

        this._lastHitState = false;
        return this._noHit(desired, maxDist);
    }

    wasHit() {
        return this._lastHitState;
    }

    _noHit(position, distance) {
        return {
            hit: false,
            position: position,
            distance: distance,
            normal: null,
            collider: null,
        };
    }
}
