import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

/**
 * WorldResource - A collectible resource entity placed in the 3D world.
 * Renders with a shared detailed model when available, otherwise falls back to
 * a colored cube. Both visual paths keep the same bobbing + rotation animation.
 */
export class WorldResource extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} resourceDef - Definition from ResourceDatabase
     * @param {Float32Array|number[]} worldPos - [x, y, z] spawn position
     * @param {Mesh|null} modelMesh - Shared mesh owned by AssetManager
     */
    constructor(gl, resourceDef, worldPos, modelMesh = null) {
        super();
        this.gl = gl;
        this.resourceDef = resourceDef;
        this.resourceId = resourceDef.id;

        // Set world position
        Vec3.set(this.position, worldPos[0], worldPos[1], worldPos[2]);
        this.baseY = worldPos[1]; // Store base Y for bobbing animation

        // A loaded OBJ has already been normalized to world size. Procedural
        // fallbacks still use the per-axis box dimensions from the database.
        this.useModel = Boolean(modelMesh);
        if (this.useModel) {
            const modelScale = resourceDef.modelScale ?? 1;
            if (Array.isArray(modelScale)) {
                Vec3.set(this.scale, modelScale[0], modelScale[1], modelScale[2]);
            } else {
                Vec3.set(this.scale, modelScale, modelScale, modelScale);
            }
        } else {
            Vec3.set(this.scale, resourceDef.meshScale[0], resourceDef.meshScale[1], resourceDef.meshScale[2]);
        }

        // Animation state
        this.animTime = Math.random() * Math.PI * 2; // Random phase offset
        this.bobAmplitude = 0.15;
        this.bobSpeed = 2.0;
        this.rotSpeed = 1.2;

        if (this.useModel) {
            this.mesh = modelMesh;
        } else {
            const [r, g, b] = resourceDef.color;
            this.mesh = new Mesh(gl, this._createCubeData(r, g, b));
        }

        // State flags
        this.isCollected = false;

        this.updateModelMatrix();
    }

    /**
     * Update bobbing and rotation animation
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (this.isCollected) return;

        this.animTime += deltaTime;

        // Vertical bob (sine wave)
        this.position[1] = this.baseY + Math.sin(this.animTime * this.bobSpeed) * this.bobAmplitude;

        // Slow Y-axis rotation
        this.rotation[1] = this.animTime * this.rotSpeed;

        this.updateModelMatrix();
    }

    /**
     * Check if player is within pickup range
     * @param {Float32Array} playerPosition
     * @returns {boolean}
     */
    canPickup(playerPosition) {
        if (this.isCollected) return false;

        // Use horizontal XZ distance only (ignore height)
        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        const radiusSq = this.resourceDef.pickupRadius * this.resourceDef.pickupRadius;

        return distSq <= radiusSq;
    }

    /**
     * Get horizontal XZ distance to a position
     * @param {Float32Array} targetPos
     * @returns {number}
     */
    distanceTo(targetPos) {
        const dx = targetPos[0] - this.position[0];
        const dz = targetPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Mark this resource as collected
     */
    collect() {
        this.isCollected = true;
    }

    /**
     * Draw this resource using the provided shader
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode - gl.TRIANGLES or gl.LINES
     */
    draw(shaderProgram, drawMode) {
        if (this.isCollected) return;

        if (this.mesh && this.mesh.drawables) {
            this.mesh.draw(shaderProgram, this.modelMatrix, drawMode);
        } else if (this.mesh) {
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
            this.mesh.draw(drawMode);
        }
    }

    /**
     * Free GPU resources
     */
    delete() {
        // Detailed OBJ meshes and glTF ModelAssets are shared and disposed by AssetManager.
        if (this.mesh && !this.useModel) {
            this.mesh.delete();
        }
        this.mesh = null;
    }

    /**
     * Generate standard 24-vertex cube geometry with a solid color
     * Reuses the same pattern as GameScene._createCubeData()
     */
    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            // Back face
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            // Bottom face
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
            // Right face
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            // Left face
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
            // Front
             0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,
            // Back
             0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,
            // Top
             0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,
            // Bottom
             0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,
            // Right
             1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,
            // Left
            -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0,
        ]);

        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i * 4] = r;
            colors[i * 4 + 1] = g;
            colors[i * 4 + 2] = b;
            colors[i * 4 + 3] = 1.0;
        }

        const texCoords = new Float32Array([
            // Front
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
            // Back
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Top
            0.0, 1.0,  0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
            // Bottom
            1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
            // Right
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Left
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        ]);

        const indices = new Uint16Array([
            0, 1, 2,      0, 2, 3,    // Front
            4, 5, 6,      4, 6, 7,    // Back
            8, 9, 10,     8, 10, 11,  // Top
            12, 13, 14,   12, 14, 15, // Bottom
            16, 17, 18,   16, 18, 19, // Right
            20, 21, 22,   20, 22, 23  // Left
        ]);

        return { positions, normals, colors, texCoords, indices };
    }
}
