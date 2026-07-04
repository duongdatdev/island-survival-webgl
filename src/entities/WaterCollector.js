import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';

/**
 * WaterCollector Entity — Collects rainwater for the player to drink.
 * Built from Wood + Barrel. Generates Fresh Water over time.
 * 
 * Visual: Wooden frame with barrel underneath catching drips.
 * Procedural mesh — no external assets required.
 */
export class WaterCollector extends Entity {
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

        // Water generation
        this.waterStored = 0;       // Current stored water units
        this.maxWater = 3;          // Max stored water
        this.generateInterval = 30; // Seconds per water unit
        this._generateTimer = 0;

        // Animation
        this._dripTime = 0;

        // Build meshes
        this._buildMeshes(gl);
        this.updateModelMatrix();
    }

    _buildMeshes(gl) {
        // Wood frame — brown
        this._woodData = this._createCubeData(0.5, 0.32, 0.15);
        // Barrel/container — dark wood
        this._barrelData = this._createCubeData(0.4, 0.25, 0.12);
        // Water surface — blue
        this._waterData = this._createCubeData(0.2, 0.5, 0.8);
        // Leaf/funnel — green
        this._leafData = this._createCubeData(0.25, 0.55, 0.2);

        this.woodMesh = this._createMesh(gl, this._woodData);
        this.barrelMesh = this._createMesh(gl, this._barrelData);
        this.waterMesh = this._createMesh(gl, this._waterData);
        this.leafMesh = this._createMesh(gl, this._leafData);
    }

    /**
     * Update water generation timer
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this.isBuilt) return;

        this._dripTime += deltaTime;

        // Generate water over time
        if (this.waterStored < this.maxWater) {
            this._generateTimer += deltaTime;
            if (this._generateTimer >= this.generateInterval) {
                this._generateTimer -= this.generateInterval;
                this.waterStored = Math.min(this.waterStored + 1, this.maxWater);
            }
        }
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
     * Collect water from the collector
     * @returns {boolean} True if water was available
     */
    collectWater() {
        if (this.waterStored > 0) {
            this.waterStored--;
            return true;
        }
        return false;
    }

    /**
     * Draw water collector using BasicShader
     * @param {ShaderProgram} shader
     * @param {number} drawMode
     */
    draw(shader, drawMode) {
        if (!this.isBuilt) return;

        const tempMatrix = Mat4.create();

        // Draw 4 wooden support poles
        const polePositions = [
            [-0.4, 0, -0.4], [0.4, 0, -0.4],
            [-0.4, 0, 0.4], [0.4, 0, 0.4]
        ];
        for (const pp of polePositions) {
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0] + pp[0],
                this.position[1] + 0.5,
                this.position[2] + pp[2]
            ]);
            Mat4.scale(tempMatrix, tempMatrix, [0.08, 1.0, 0.08]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.woodMesh.draw(drawMode);
        }

        // Draw leaf funnel on top (angled)
        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + 1.0,
            this.position[2]
        ]);
        Mat4.rotateZ(tempMatrix, tempMatrix, 0.15);
        Mat4.scale(tempMatrix, tempMatrix, [0.9, 0.05, 0.7]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.leafMesh.draw(drawMode);

        // Draw barrel/container underneath
        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + 0.2,
            this.position[2]
        ]);
        Mat4.scale(tempMatrix, tempMatrix, [0.5, 0.4, 0.5]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.barrelMesh.draw(drawMode);

        // Draw water level inside barrel (if water stored)
        if (this.waterStored > 0) {
            const waterHeight = (this.waterStored / this.maxWater) * 0.3;
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0],
                this.position[1] + 0.05 + waterHeight * 0.5,
                this.position[2]
            ]);
            Mat4.scale(tempMatrix, tempMatrix, [0.44, waterHeight, 0.44]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.waterMesh.draw(drawMode);
        }

        // Draw drip animation (falling water drop)
        const dripPhase = (this._dripTime * 0.8) % 1.0;
        if (this.waterStored < this.maxWater) {
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0],
                this.position[1] + 0.95 - dripPhase * 0.75,
                this.position[2]
            ]);
            const dropScale = 0.04;
            Mat4.scale(tempMatrix, tempMatrix, [dropScale, dropScale * 2, dropScale]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.waterMesh.draw(drawMode);
        }
    }

    _createMesh(gl, data) {
        return new Mesh(gl, data);
    }

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
        if (this.woodMesh) this.woodMesh.delete();
        if (this.barrelMesh) this.barrelMesh.delete();
        if (this.waterMesh) this.waterMesh.delete();
        if (this.leafMesh) this.leafMesh.delete();
    }
}
