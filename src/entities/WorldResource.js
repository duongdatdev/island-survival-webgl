import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

export class WorldResource extends Entity {
    constructor(gl, resourceDef, worldPos, modelMesh = null) {
        super();
        this.gl = gl;
        this.resourceDef = resourceDef;
        this.resourceId = resourceDef.id;

        Vec3.set(this.position, worldPos[0], worldPos[1], worldPos[2]);
        this.baseY = worldPos[1];

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

        this.animTime = Math.random() * Math.PI * 2;
        this.bobAmplitude = 0.15;
        this.bobSpeed = 2.0;
        this.rotSpeed = 1.2;

        if (this.useModel) {
            this.mesh = modelMesh;
        } else {
            const [r, g, b] = resourceDef.color;
            this.mesh = new Mesh(gl, this._createCubeData(r, g, b));
        }

        this.isCollected = false;

        this.updateModelMatrix();
    }

    update(deltaTime) {
        if (this.isCollected) return;

        this.animTime += deltaTime;

        this.position[1] = this.baseY + Math.sin(this.animTime * this.bobSpeed) * this.bobAmplitude;

        this.rotation[1] = this.animTime * this.rotSpeed;

        this.updateModelMatrix();
    }

    canPickup(playerPosition) {
        if (this.isCollected) return false;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        const radiusSq = this.resourceDef.pickupRadius * this.resourceDef.pickupRadius;

        return distSq <= radiusSq;
    }

    distanceTo(targetPos) {
        const dx = targetPos[0] - this.position[0];
        const dz = targetPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz);
    }

    collect() {
        this.isCollected = true;
    }

    draw(shaderProgram, drawMode) {
        if (this.isCollected) return;

        if (this.mesh && this.mesh.drawables) {
            this.mesh.draw(shaderProgram, this.modelMatrix, drawMode);
        } else if (this.mesh) {
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
            this.mesh.draw(drawMode);
        }
    }

    delete() {
        if (this.mesh && !this.useModel) {
            this.mesh.delete();
        }
        this.mesh = null;
    }

    _createCubeData(r, g, b) {
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
            colors[i * 4 + 3] = 1.0;
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
