import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';

/**
 * Campfire Entity — Placeable cooking structure on the island.
 * Built from Stone + Wood. Allows cooking raw food into Cooked Meals.
 * 
 * Visual: Ring of gray stone blocks with an orange/red fire glow center.
 * Procedural mesh — no external assets required.
 */
export class Campfire extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number[]} position - World position [x, y, z]
     */
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);

        this.isBuilt = false;       // Must be crafted before appearing
        this.interactRadius = 3.0;  // Player proximity to interact

        // Fire animation state
        this._fireTime = 0;
        this._fireFlicker = 1.0;

        // Build meshes
        this._buildMeshes(gl);

        this.updateModelMatrix();
    }

    /**
     * Build procedural meshes for the campfire
     */
    _buildMeshes(gl) {
        // Stone ring — create cube geometry for stones
        this._stoneMeshData = this._createCubeData(0.5, 0.5, 0.48);  // Gray stone

        // Fire embers center — warm orange cube
        this._fireMeshData = this._createCubeData(0.95, 0.45, 0.1);  // Orange fire

        // Wood logs — brown
        this._logMeshData = this._createCubeData(0.45, 0.28, 0.12);  // Dark wood

        // Create VAO/VBO for each mesh part
        this.stoneMesh = this._createMesh(gl, this._stoneMeshData);
        this.fireMesh = this._createMesh(gl, this._fireMeshData);
        this.logMesh = this._createMesh(gl, this._logMeshData);
    }

    /**
     * Update fire animation
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this.isBuilt) return;
        this._fireTime += deltaTime;
        this._fireFlicker = 0.7 + Math.sin(this._fireTime * 8) * 0.15 + Math.sin(this._fireTime * 13) * 0.1;
    }

    /**
     * Check if player is within interaction range
     * @param {number[]} playerPos
     * @returns {boolean}
     */
    isPlayerNear(playerPos) {
        if (!this.isBuilt) return false;
        const dx = playerPos[0] - this.position[0];
        const dz = playerPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz) < this.interactRadius;
    }

    /**
     * Draw campfire using BasicShader
     * @param {ShaderProgram} shader
     * @param {number} drawMode
     */
    draw(shader, drawMode) {
        if (!this.isBuilt) return;

        const tempMatrix = Mat4.create();

        // Draw stone ring — 6 stones arranged in circle
        const stoneCount = 6;
        for (let i = 0; i < stoneCount; i++) {
            const angle = (i / stoneCount) * Math.PI * 2;
            const radius = 0.6;
            const sx = this.position[0] + Math.cos(angle) * radius;
            const sz = this.position[2] + Math.sin(angle) * radius;

            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [sx, this.position[1] + 0.12, sz]);
            Mat4.rotateY(tempMatrix, tempMatrix, angle + 0.3);
            Mat4.scale(tempMatrix, tempMatrix, [0.25, 0.2, 0.2]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.stoneMesh.draw(drawMode);
        }

        // Draw crossed wood logs
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI;
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [this.position[0], this.position[1] + 0.08, this.position[2]]);
            Mat4.rotateY(tempMatrix, tempMatrix, angle);
            Mat4.scale(tempMatrix, tempMatrix, [0.8, 0.1, 0.1]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.logMesh.draw(drawMode);
        }

        // Draw fire center (animated scale)
        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + 0.2 + Math.sin(this._fireTime * 6) * 0.04,
            this.position[2]
        ]);
        const fireScale = 0.2 * this._fireFlicker;
        Mat4.scale(tempMatrix, tempMatrix, [fireScale, fireScale * 1.5, fireScale]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.fireMesh.draw(drawMode);

        // Draw secondary smaller fire
        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0] + 0.1,
            this.position[1] + 0.32 + Math.sin(this._fireTime * 9) * 0.03,
            this.position[2] + 0.05
        ]);
        const fire2Scale = 0.12 * this._fireFlicker;
        Mat4.scale(tempMatrix, tempMatrix, [fire2Scale, fire2Scale * 1.8, fire2Scale]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.fireMesh.draw(drawMode);
    }

    _createMesh(gl, data) {
        return new Mesh(gl, data);
    }

    /**
     * Standard 24-vertex cube data generator
     */
    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
            -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,  0.5,-0.5,-0.5,
            -0.5, 0.5,-0.5, -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
            -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
             0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,  0.5,-0.5, 0.5,
            -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
        ]);
        const normals = new Float32Array([
             0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
             0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1,
             0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
             0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0,
             1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
            -1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,
        ]);
        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i*4]=r; colors[i*4+1]=g; colors[i*4+2]=b; colors[i*4+3]=1.0;
        }
        const texCoords = new Float32Array([
            0,0,1,0,1,1,0,1, 1,0,1,1,0,1,0,0, 0,1,0,0,1,0,1,1,
            1,1,0,1,0,0,1,0, 1,0,1,1,0,1,0,0, 0,0,1,0,1,1,0,1,
        ]);
        const indices = new Uint16Array([
            0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
            12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23
        ]);
        return { positions, normals, colors, texCoords, indices };
    }

    delete() {
        if (this.stoneMesh) this.stoneMesh.delete();
        if (this.fireMesh) this.fireMesh.delete();
        if (this.logMesh) this.logMesh.delete();
    }
}
