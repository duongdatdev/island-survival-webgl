import { Mat4 } from '../math/Mat4.js';

/**
 * Frustum (v1.0) — view-frustum plane extraction for draw-call culling.
 *
 * Planes are pulled straight out of the combined projection × view matrix
 * (Gribb/Hartmann), which means no extra matrix work beyond one multiply per
 * frame. Matrices here are column-major, so row `r` of the matrix is
 * [m[r], m[4+r], m[8+r], m[12+r]].
 *
 * Plane normals point *inward*, so a sphere is visible when
 * `dot(n, center) + d >= -radius` for all six planes.
 */
export class Frustum {
    constructor() {
        /** @type {Float32Array} 6 planes × (a, b, c, d) */
        this.planes = new Float32Array(24);
        this._viewProjection = Mat4.create();

        /** Set false to make every test pass (culling disabled in settings). */
        this.enabled = true;

        // Culling statistics, surfaced in the debug panel.
        this.testedCount = 0;
        this.culledCount = 0;
    }

    /**
     * Rebuild the planes for this frame.
     * @param {Float32Array} projectionMatrix
     * @param {Float32Array} viewMatrix
     */
    update(projectionMatrix, viewMatrix) {
        const m = this._viewProjection;
        Mat4.multiply(m, projectionMatrix, viewMatrix);

        // row3 ± rowN, normalized so `d` is a true world-space distance and the
        // radius comparison below stays meaningful.
        this._setPlane(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);  // left
        this._setPlane(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);  // right
        this._setPlane(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);  // bottom
        this._setPlane(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);  // top
        this._setPlane(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); // near
        this._setPlane(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]); // far

        this.testedCount = 0;
        this.culledCount = 0;
    }

    /**
     * Sphere-vs-frustum test.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} radius
     * @returns {boolean} True when the sphere is at least partly inside.
     */
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

    /**
     * Combined frustum + distance test — the common case for world props.
     * @param {number[]|Float32Array} position
     * @param {number} radius Bounding radius of the object
     * @param {number[]|Float32Array} viewerPos
     * @param {number} maxDistance Draw distance; <= 0 disables the check
     * @returns {boolean}
     */
    isVisible(position, radius, viewerPos, maxDistance) {
        // Turning culling off in settings disables the distance check too —
        // players who ask for "no culling" mean nothing should pop.
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
