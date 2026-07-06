import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

/**
 * Waterfall POI - Renders a flowing waterfall stream and a splash pond.
 * Emits splash particles at the bottom.
 */
export class Waterfall extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number[]} position - Position of the waterfall pond [x, y, z]
     */
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.copy(this.position, position);

        // Visual properties
        // Stream: Sloped flowing water panel
        this.streamMesh = new Mesh(gl, this._createCubeData(0.3, 0.65, 0.95, 0.8)); // Light blue translucent
        // Pond: Circular water surface at the base
        this.pondMesh = new Mesh(gl, this._createCubeData(0.2, 0.6, 0.9, 0.7)); // Deeper translucent blue

        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        this.updateModelMatrix();
    }

    update(deltaTime, particleSystem) {
        this.time += deltaTime;

        // Emit splashing particles at the base of the waterfall periodically
        if (particleSystem && Math.random() < 0.25) {
            // Emit particles at the pond center (clamped waterfall base coordinates)
            const splashPos = [
                this.position[0] + (Math.random() - 0.5) * 1.5,
                0.25,
                this.position[2] + (Math.random() - 0.5) * 1.5
            ];
            // Simulate splash particles
            particleSystem.emit(splashPos, {
                count: 4,
                color: [0.6, 0.8, 1.0],
                colorVariance: 0.1,
                size: 5,
                sizeVariance: 2,
                speed: 1.8,
                speedVariance: 0.7,
                lifetime: 0.5,
                lifetimeVariance: 0.2,
                gravity: -4.0,
                spread: 0.8,
                yBias: 2.0,
            });
        }
    }

    /**
     * Check if player is near the waterfall pond to drink water
     */
    isPlayerInPond(playerPos) {
        const dx = playerPos[0] - this.position[0];
        const dz = playerPos[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        // Pond interaction radius is 3.5 units
        return distSq <= 3.5 * 3.5;
    }

    /**
     * Render the Waterfall stream and pond
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode
     */
    draw(shaderProgram, drawMode) {
        const baseMatrix = this.modelMatrix;

        // 1. RENDER WATERFALL STREAM (Flowing down from cliff)
        // Positioned slightly behind the pond and sloped
        Mat4.copy(this.tempMatrix, baseMatrix);
        // Translate stream to fit from the top cliff (around Y=5.5) down to pond (Y=0)
        // Adjust angle and scale
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 2.5, -2.5]);
        Mat4.rotateX(this.tempMatrix, this.tempMatrix, -0.45); // Tilt to make it flow sloped
        // Scale stream: width=2.4, thickness=0.2, height/length=7.0
        Mat4.scale(this.tempMatrix, this.tempMatrix, [2.4, 0.2, 7.0]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.streamMesh.draw(drawMode);

        // 2. RENDER WATERFALL POND (Translucent flat sheet at the bottom)
        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.15, 0.0]); // Flat on water surface
        Mat4.scale(this.tempMatrix, this.tempMatrix, [3.8, 0.1, 3.8]); // Circular splash area
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.pondMesh.draw(drawMode);
    }

    delete() {
        if (this.streamMesh) {
            this.streamMesh.delete();
            this.streamMesh = null;
        }
        if (this.pondMesh) {
            this.pondMesh.delete();
            this.pondMesh = null;
        }
    }

    _createCubeData(r, g, b, a) {
        const positions = new Float32Array([
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
             0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,
             0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,
             0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,
             0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,
              1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,
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
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            0.0, 1.0,  0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
            1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        ]);

        const indices = new Uint16Array([
            0, 1, 2,      0, 2, 3,
            4, 5, 6,      4, 6, 7,
            8, 9, 10,     8, 10, 11,
            12, 13, 14,   12, 14, 15,
            16, 17, 18,   16, 18, 19,
            20, 21, 22,   20, 22, 23
        ]);

        return { positions, normals, colors, texCoords, indices };
    }
}
