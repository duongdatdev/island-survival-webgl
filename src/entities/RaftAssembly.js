import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

/**
 * RaftAssembly - Handles the raft building site on the beach.
 * Shows solid parts for built modules and holographic ghost outlines for unbuilt modules.
 */
export class RaftAssembly extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {Float32Array|number[]} position - World [x, y, z] coordinate
     */
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.copy(this.position, position);

        // State of the three required modules
        this.framePlaced = false;
        this.floatsPlaced = false;
        this.paddlePlaced = false;

        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        // 1. Build Solid Meshes with distinct colors
        this.woodMesh = new Mesh(gl, this._createCubeData(0.55, 0.35, 0.18, 1.0));    // Warm brown logs
        this.barrelMesh = new Mesh(gl, this._createCubeData(0.45, 0.28, 0.15, 1.0));  // Dark wood barrels
        this.paddleMesh = new Mesh(gl, this._createCubeData(0.75, 0.60, 0.40, 1.0));  // Light wood paddle

        // 2. Build Holographic Ghost Mesh (translucent neon blue)
        this.ghostMesh = new Mesh(gl, this._createCubeData(0.20, 0.60, 1.00, 0.25));

        this.updateModelMatrix();
    }

    /**
     * Update animations (time elapsed)
     * @param {number} deltaTime
     */
    update(deltaTime) {
        this.time += deltaTime;
        // Keep assembly static but animate inside draw if needed
        this.updateModelMatrix();
    }

    /**
     * Check if all parts have been placed
     * @returns {boolean}
     */
    isComplete() {
        return this.framePlaced && this.floatsPlaced && this.paddlePlaced;
    }

    /**
     * Calculate 2D horizontal distance to a player position
     * @param {Float32Array} playerPosition
     * @returns {number}
     */
    distanceTo(playerPosition) {
        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Draw the raft modules.
     * Solid elements are drawn in the solid pass. Ghost elements are drawn in the ghost/blend pass.
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode
     * @param {boolean} isGhostPass - True if rendering the translucent blending pass
     */
    draw(shaderProgram, drawMode, isGhostPass) {
        // Holographic subtle scale pulsing
        const pulse = 1.0 + 0.02 * Math.sin(this.time * 3.5);

        // --- 1. RENDER RAFT FRAME ---
        if (this.framePlaced) {
            if (!isGhostPass) {
                this._drawFrame(shaderProgram, drawMode, this.woodMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawFrame(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }

        // --- 2. RENDER BARREL FLOATS ---
        if (this.floatsPlaced) {
            if (!isGhostPass) {
                this._drawFloats(shaderProgram, drawMode, this.barrelMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawFloats(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }

        // --- 3. RENDER PADDLE ---
        if (this.paddlePlaced) {
            if (!isGhostPass) {
                this._drawPaddle(shaderProgram, drawMode, this.paddleMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawPaddle(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }
    }

    /**
     * Renders the wooden raft logs & cross beams
     */
    _drawFrame(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        // 4 longitudinal logs (aligned with Z-axis)
        const logOffsets = [
            [-0.60, 0.10, 0.0],
            [-0.20, 0.10, 0.0],
            [ 0.20, 0.10, 0.0],
            [ 0.60, 0.10, 0.0]
        ];

        for (const offset of logOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [0.20 * scaleMult, 0.20 * scaleMult, 2.60 * scaleMult]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }

        // 3 transverse crossing logs (aligned with X-axis)
        const crossOffsets = [
            [0.0, 0.20, -1.00],
            [0.0, 0.20,  0.00],
            [0.0, 0.20,  1.00]
        ];

        for (const offset of crossOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [1.50 * scaleMult, 0.14 * scaleMult, 0.20 * scaleMult]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }
    }

    /**
     * Renders the 4 support float barrels under the frame
     */
    _drawFloats(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        const barrelOffsets = [
            [-0.45, -0.22, -0.70],
            [-0.45, -0.22,  0.70],
            [ 0.45, -0.22, -0.70],
            [ 0.45, -0.22,  0.70]
        ];

        for (const offset of barrelOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [0.42 * scaleMult, 0.50 * scaleMult, 0.42 * scaleMult]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }
    }

    /**
     * Renders the paddles resting on the raft structure
     */
    _drawPaddle(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;
        const rotY = 0.15; // Sleek angled rest position

        // 1. Paddle Shaft
        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.15, 0.28, -0.10]);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, rotY);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.06 * scaleMult, 0.06 * scaleMult, 1.50 * scaleMult]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mesh.draw(drawMode);

        // 2. Paddle Blade
        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.32, 0.28, 0.70]);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, rotY);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.20 * scaleMult, 0.03 * scaleMult, 0.40 * scaleMult]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mesh.draw(drawMode);
    }

    /**
     * Frees WebGL vertex buffer objects
     */
    delete() {
        if (this.woodMesh) {
            this.woodMesh.delete();
            this.woodMesh = null;
        }
        if (this.barrelMesh) {
            this.barrelMesh.delete();
            this.barrelMesh = null;
        }
        if (this.paddleMesh) {
            this.paddleMesh.delete();
            this.paddleMesh = null;
        }
        if (this.ghostMesh) {
            this.ghostMesh.delete();
            this.ghostMesh = null;
        }
    }

    /**
     * Generates a 24-vertex standard cube with customizable solid color & alpha transparency
     */
    _createCubeData(r, g, b, a) {
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
            colors[i * 4 + 3] = a;
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
