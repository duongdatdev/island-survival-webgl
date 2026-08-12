import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { ColliderFactory } from '../systems/ColliderFactory.js';

/**
 * EnvironmentObject - Represents placed environment props (trees, bushes, rocks)
 * Collider settings are data-driven via ColliderFactory from asset category metadata.
 */
export class EnvironmentObject extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {Mesh} mesh           Shared compiled mesh from AssetManager
     * @param {number[]} position   World position [x, y, z]
     * @param {number[]} rotation   Euler rotation [rx, ry, rz]
     * @param {number[]} scale      Scale [sx, sy, sz]
     * @param {boolean} collision   Whether this object blocks the player
     * @param {boolean} navigationBlocker
     * @param {string}  category    Asset category (Tree, Rock, Bush, etc.)
     */
    constructor(gl, mesh, position, rotation, scale, collision = true, navigationBlocker = true, category = '') {
        super();
        this.gl = gl;
        this.mesh = mesh;
        this.collision = collision;
        this.navigationBlocker = navigationBlocker;
        this.category = category;

        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this.rotation, rotation[0], rotation[1], rotation[2]);
        Vec3.set(this.scale, scale[0], scale[1], scale[2]);

        // Data-driven collider from category
        this.collider = ColliderFactory.createCollider(category, scale);
        this.collisionRadius = this.collider.radius;

        this.updateModelMatrix();
        this._updateCullingBounds();
    }

    draw(shaderProgram, drawMode) {
        if (!this.mesh) return;
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
    }

    _updateCullingBounds() {
        const bounds = this.mesh && this.mesh.bounds;
        if (!bounds || bounds.radius <= 0) {
            this.cullingCenter = this.position;
            this.cullingRadius = Math.max(1, this.collisionRadius || 0);
            return;
        }

        const c = bounds.center;
        const m = this.modelMatrix;
        this.cullingCenter = Vec3.create(
            m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12],
            m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13],
            m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14]
        );
        this.cullingRadius = bounds.radius * Math.max(
            Math.abs(this.scale[0]),
            Math.abs(this.scale[1]),
            Math.abs(this.scale[2])
        );
    }

    delete() {
        // Mesh resources are managed and cached inside AssetManager,
        // so we do not delete the mesh buffer directly here.
    }
}
