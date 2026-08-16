import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { randomInRange } from '../systems/DebrisDatabase.js';
import { WaveField } from '../shaders/WaterWaves.js';

export class DriftingDebris extends Entity {
    constructor(gl, debrisDef, spawnPos, mesh = null, meshScale = 1) {
        super();
        this.gl = gl;
        this.debrisDef = debrisDef;
        this.debrisId = debrisDef.id;

        Vec3.set(this.position, spawnPos[0], spawnPos[1], spawnPos[2]);

        if (mesh) {
            this.useModel = true;
            this.mesh = mesh;
            Vec3.set(this.scale, meshScale, meshScale, meshScale);
        } else {
            this.useModel = false;
            Vec3.set(this.scale,
                debrisDef.meshScale[0],
                debrisDef.meshScale[1],
                debrisDef.meshScale[2]
            );

            const [r, g, b] = debrisDef.color;
            this.mesh = new Mesh(gl, this._createCubeData(r, g, b));
        }

        const toCenter = Vec3.create(-spawnPos[0], 0, -spawnPos[2]);
        Vec3.normalize(toCenter, toCenter);

        const deviationAngle = (Math.random() - 0.5) * 0.52;
        const cosA = Math.cos(deviationAngle);
        const sinA = Math.sin(deviationAngle);
        this.driftDirection = Vec3.create(
            toCenter[0] * cosA - toCenter[2] * sinA,
            0,
            toCenter[0] * sinA + toCenter[2] * cosA
        );

        this.driftSpeed = randomInRange(debrisDef.driftSpeed);

        this.lifetime = randomInRange(debrisDef.lifetime);
        this.age = 0;

        this.animTime = Math.random() * Math.PI * 2;
        this.rotSpeed = 0.6 + Math.random() * 0.4;

        this.tiltResponse = 1.6 + Math.random() * 0.8;

        this._slope = [0, 0];

        this.isCollected = false;
        this.isExpired = false;
        this.isOnShore = false;

        this.waterY = 0.15;

        this.updateModelMatrix();
    }

    update(deltaTime, terrain) {
        if (this.isCollected || this.isExpired) return;

        this.age += deltaTime;
        if (this.age >= this.lifetime) {
            this.isExpired = true;
            return;
        }

        this.animTime += deltaTime;

        if (!this.isOnShore) {
            const moveX = this.driftDirection[0] * this.driftSpeed * deltaTime;
            const moveZ = this.driftDirection[2] * this.driftSpeed * deltaTime;
            this.position[0] += moveX;
            this.position[2] += moveZ;

            if (terrain) {
                const terrainHeight = terrain.getHeight(this.position[0], this.position[2]);
                if (terrainHeight > 0.1) {
                    this.isOnShore = true;
                    this.position[1] = terrainHeight + (this.useModel ? 0.02 : this.debrisDef.meshScale[1] * 0.5 + 0.05);
                }
            }
        }

        if (this.isOnShore) {
            this.rotation[1] = this.animTime * this.rotSpeed * 0.1;
        } else {
            const x = this.position[0];
            const z = this.position[2];
            this.position[1] = this.waterY + WaveField.heightAt(x, z);

            const yaw = this.animTime * this.rotSpeed;
            this.rotation[1] = yaw;

            WaveField.slopeAt(x, z, this._slope);
            const cy = Math.cos(yaw);
            const sy = Math.sin(yaw);
            const slopeAlongX = this._slope[0] * cy - this._slope[1] * sy;
            const slopeAlongZ = this._slope[0] * sy + this._slope[1] * cy;
            this.rotation[0] = -slopeAlongZ * this.tiltResponse;
            this.rotation[2] = slopeAlongX * this.tiltResponse;
        }

        this.updateModelMatrix();
    }

    canPickup(playerPosition) {
        if (this.isCollected || this.isExpired) return false;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        const radiusSq = this.debrisDef.pickupRadius * this.debrisDef.pickupRadius;

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

    shouldRemove() {
        return this.isCollected || this.isExpired;
    }

    getLifetimeFraction() {
        return Math.max(0, 1 - this.age / this.lifetime);
    }

    draw(shaderProgram, drawMode) {
        if (!this.mesh || this.isCollected || this.isExpired) return;

        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
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
