import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';

const CAMPFIRE_SCALE = 0.4;

export class Campfire extends Entity {
    constructor(gl, position, modelMesh = null) {
        super();
        this.gl = gl;
        this.modelMesh = modelMesh;
        Vec3.set(this.position, position[0], position[1], position[2]);

        this.isBuilt = false;
        this.interactRadius = 3.0;

        this._fireTime = 0;
        this._fireFlicker = 1.0;

        this.lightPosition = Vec3.create(position[0], position[1] + 0.45, position[2]);
        this.lightColor = Vec3.create(1.0, 0.45, 0.12);
        this.lightRange = 4.5;
        this.lightIntensity = 2.8;

        if (!this.modelMesh) this._buildMeshes(gl);

        this.updateModelMatrix();
    }

    _buildMeshes(gl) {
        this._stoneMeshData = this._createCubeData(0.5, 0.5, 0.48);

        this._fireMeshData = this._createCubeData(0.95, 0.45, 0.1);

        this._logMeshData = this._createCubeData(0.45, 0.28, 0.12);

        this.stoneMesh = this._createMesh(gl, this._stoneMeshData);
        this.fireMesh = this._createMesh(gl, this._fireMeshData);
        this.logMesh = this._createMesh(gl, this._logMeshData);
    }

    update(deltaTime) {
        if (!this.isBuilt) return;
        this._fireTime += deltaTime;
        this._fireFlicker = 0.7 + Math.sin(this._fireTime * 8) * 0.15 + Math.sin(this._fireTime * 13) * 0.1;
        this.lightIntensity = 2.75
            + Math.sin(this._fireTime * 7.0) * 0.12
            + Math.sin(this._fireTime * 13.0) * 0.06;
    }

    getLightPosition() {
        Vec3.set(
            this.lightPosition,
            this.position[0],
            this.position[1] + 0.45,
            this.position[2]
        );
        return this.lightPosition;
    }

    isPlayerNear(playerPos) {
        if (!this.isBuilt) return false;
        const dx = playerPos[0] - this.position[0];
        const dz = playerPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz) < this.interactRadius;
    }

    draw(shader, drawMode) {
        if (!this.isBuilt) return;

        if (this.modelMesh) {
            shader.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
            this.modelMesh.draw(drawMode);
            return;
        }

        const tempMatrix = Mat4.create();

        const stoneCount = 6;
        for (let i = 0; i < stoneCount; i++) {
            const angle = (i / stoneCount) * Math.PI * 2;
            const radius = 0.6 * CAMPFIRE_SCALE;
            const sx = this.position[0] + Math.cos(angle) * radius;
            const sz = this.position[2] + Math.sin(angle) * radius;

            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [sx, this.position[1] + 0.12 * CAMPFIRE_SCALE, sz]);
            Mat4.rotateY(tempMatrix, tempMatrix, angle + 0.3);
            Mat4.scale(tempMatrix, tempMatrix, [0.25 * CAMPFIRE_SCALE, 0.2 * CAMPFIRE_SCALE, 0.2 * CAMPFIRE_SCALE]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.stoneMesh.draw(drawMode);
        }

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI;
            Mat4.identity(tempMatrix);
            Mat4.translate(tempMatrix, tempMatrix, [this.position[0], this.position[1] + 0.08 * CAMPFIRE_SCALE, this.position[2]]);
            Mat4.rotateY(tempMatrix, tempMatrix, angle);
            Mat4.scale(tempMatrix, tempMatrix, [0.8 * CAMPFIRE_SCALE, 0.1 * CAMPFIRE_SCALE, 0.1 * CAMPFIRE_SCALE]);
            shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
            this.logMesh.draw(drawMode);
        }

        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0],
            this.position[1] + (0.2 + Math.sin(this._fireTime * 6) * 0.04) * CAMPFIRE_SCALE,
            this.position[2]
        ]);
        const fireScale = 0.2 * this._fireFlicker * CAMPFIRE_SCALE;
        Mat4.scale(tempMatrix, tempMatrix, [fireScale, fireScale * 1.5, fireScale]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.fireMesh.draw(drawMode);

        Mat4.identity(tempMatrix);
        Mat4.translate(tempMatrix, tempMatrix, [
            this.position[0] + 0.1 * CAMPFIRE_SCALE,
            this.position[1] + (0.32 + Math.sin(this._fireTime * 9) * 0.03) * CAMPFIRE_SCALE,
            this.position[2] + 0.05 * CAMPFIRE_SCALE
        ]);
        const fire2Scale = 0.12 * this._fireFlicker * CAMPFIRE_SCALE;
        Mat4.scale(tempMatrix, tempMatrix, [fire2Scale, fire2Scale * 1.8, fire2Scale]);
        shader.setUniformMatrix4fv('uModelMatrix', tempMatrix);
        this.fireMesh.draw(drawMode);
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
        if (this.stoneMesh) this.stoneMesh.delete();
        if (this.fireMesh) this.fireMesh.delete();
        if (this.logMesh) this.logMesh.delete();
        this.modelMesh = null;
    }
}
