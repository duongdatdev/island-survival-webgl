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
    }

    draw(shaderProgram, drawMode) {
        if (!this.mesh) return;
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
    }

    delete() {
        // Mesh resources are managed and cached inside AssetManager,
        // so we do not delete the mesh buffer directly here.
    }
}
