import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';

const COLLECTOR_SCALE = 0.45;

export class WaterCollector extends Entity {
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);

        this.isBuilt = false;
        this.interactRadius = 3.0;

        this.waterStored = 0;
        this.maxWater = 3;
        this.generateInterval = 30;
        this._generateTimer = 0;

        this._dripTime = 0;

        this._buildMeshes(gl);
        this.updateModelMatrix();
    }

    _buildMeshes(gl) {
        this._woodData = this._createCubeData(0.5, 0.32, 0.15);
        this._barrelData = this._createCubeData(0.4, 0.25, 0.12);
        this._waterData = this._createCubeData(0.2, 0.5, 0.8);
        this._leafData = this._createCubeData(0.25, 0.55, 0.2);

        this.woodMesh = this._createMesh(gl, this._woodData);
        this.barrelMesh = this._createMesh(gl, this._barrelData);
        this.waterMesh = this._createMesh(gl, this._waterData);
        this.leafMesh = this._createMesh(gl, this._leafData);
    }

    update(deltaTime) {
        if (!this.isBuilt) return;

        this._dripTime += deltaTime;

        if (this.waterStored < this.maxWater) {
            this._generateTimer += deltaTime;
            if (this._generateTimer >= this.generateInterval) {
                this._generateTimer -= this.generateInterval;
                this.waterStored = Math.min(this.waterStored + 1, this.maxWater);
            }
        }
    }

    isPlayerNear(playerPos) {
        if (!this.isBuilt) return false;
        const dx = playerPos[0] - this.position[0];
        const dz = playerPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz) < this.interactRadius;
    }

    collectWater() {
        if (this.waterStored > 0) {
            this.waterStored--;
            return true;
        }
        return false;
    }

    draw(shader, drawMode) {
        if (!this.isBuilt) return;

        const tempMatrix = Mat4.create();

        const polePositions = [
            [-0.4 * COLLECTOR_SCALE, 0, -0.4 * COLLECTOR_SCALE], [0.4 * COLLECTOR_SCALE, 0, -0.4 * COLLECTOR_SCALE],
            [-0.4 * COLLECTOR_SCALE, 0, 0.4 * COLLECTOR_SCALE], [0.4 * COLLECTOR_SCALE, 0, 0.4 * COLLECTOR_SCALE]
        ];
        for (const pp of polePositions) {
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0] + pp[0],
                this.position[1] + 0.5 * COLLECTOR_SCALE,
                this.position[2] + pp[2]
            ]);
            Mat4.scale(tempMatrix, tempMatrix, [0.08 * COLLECTOR_SCALE, 1.0 * COLLECTOR_SCALE, 0.08 * COLLECTOR_SCALE]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.woodMesh.draw(drawMode);
        }

        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + 1.0 * COLLECTOR_SCALE,
            this.position[2]
        ]);
        Mat4.rotateZ(tempMatrix, tempMatrix, 0.15);
        Mat4.scale(tempMatrix, tempMatrix, [0.9 * COLLECTOR_SCALE, 0.05 * COLLECTOR_SCALE, 0.7 * COLLECTOR_SCALE]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.leafMesh.draw(drawMode);

        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + 0.2 * COLLECTOR_SCALE,
            this.position[2]
        ]);
        Mat4.scale(tempMatrix, tempMatrix, [0.5 * COLLECTOR_SCALE, 0.4 * COLLECTOR_SCALE, 0.5 * COLLECTOR_SCALE]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.barrelMesh.draw(drawMode);

        if (this.waterStored > 0) {
            const waterHeight = (this.waterStored / this.maxWater) * 0.3 * COLLECTOR_SCALE;
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0],
                this.position[1] + 0.05 * COLLECTOR_SCALE + waterHeight * 0.5,
                this.position[2]
            ]);
            Mat4.scale(tempMatrix, tempMatrix, [0.44 * COLLECTOR_SCALE, waterHeight, 0.44 * COLLECTOR_SCALE]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.waterMesh.draw(drawMode);
        }

        const dripPhase = (this._dripTime * 0.8) % 1.0;
        if (this.waterStored < this.maxWater) {
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [
                this.position[0],
                this.position[1] + (0.95 - dripPhase * 0.75) * COLLECTOR_SCALE,
                this.position[2]
            ]);
            const dropScale = 0.04 * COLLECTOR_SCALE;
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
