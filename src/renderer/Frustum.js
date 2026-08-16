import { Mat4 } from '../math/Mat4.js';

export class Frustum {
    constructor() {
        this.planes = new Float32Array(24);
        this._viewProjection = Mat4.create();

        this.enabled = true;

        this.testedCount = 0;
        this.culledCount = 0;
    }

    update(projectionMatrix, viewMatrix) {
        const m = this._viewProjection;
        Mat4.multiply(m, projectionMatrix, viewMatrix);

        this._setPlane(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
        this._setPlane(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
        this._setPlane(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
        this._setPlane(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
        this._setPlane(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
        this._setPlane(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);

        this.testedCount = 0;
        this.culledCount = 0;
    }

    containsSphere(x, y, z, radius) {
        if (!this.enabled) return true;

        this.testedCount++;
        const p = this.planes;
        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            if (p[o] * x + p[o + 1] * y + p[o + 2] * z + p[o + 3] < -radius) {
                this.culledCount++;
                return false;
            }
        }
        return true;
    }

    isVisible(position, radius, viewerPos, maxDistance) {
        if (!this.enabled) return true;

        if (maxDistance > 0) {
            const dx = position[0] - viewerPos[0];
            const dy = position[1] - viewerPos[1];
            const dz = position[2] - viewerPos[2];
            const limit = maxDistance + radius;
            if (dx * dx + dy * dy + dz * dz > limit * limit) {
                this.testedCount++;
                this.culledCount++;
                return false;
            }
        }
        return this.containsSphere(position[0], position[1], position[2], radius);
    }

    _setPlane(index, a, b, c, d) {
        const len = Math.sqrt(a * a + b * b + c * c);
        const inv = len > 1e-8 ? 1 / len : 0;
        const o = index * 4;
        this.planes[o] = a * inv;
        this.planes[o + 1] = b * inv;
        this.planes[o + 2] = c * inv;
        this.planes[o + 3] = d * inv;
    }
}
