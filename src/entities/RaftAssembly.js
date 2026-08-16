import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

const RAFT_SCALE = 0.45;

export class RaftAssembly extends Entity {
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.copy(this.position, position);

        this.framePlaced = false;
        this.floatsPlaced = false;
        this.paddlePlaced = false;
        this.sailPlaced = false;
        this.motorPlaced = false;

        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        this.woodMesh = new Mesh(gl, this._createCubeData(0.55, 0.35, 0.18, 1.0));
        this.barrelMesh = new Mesh(gl, this._createCubeData(0.45, 0.28, 0.15, 1.0));
        this.paddleMesh = new Mesh(gl, this._createCubeData(0.75, 0.60, 0.40, 1.0));
        this.sailMesh = new Mesh(gl, this._createCubeData(0.95, 0.95, 0.95, 1.0));
        this.mastMesh = new Mesh(gl, this._createCubeData(0.55, 0.35, 0.18, 1.0));
        this.motorMesh = new Mesh(gl, this._createCubeData(0.35, 0.35, 0.35, 1.0));

        this.ghostMesh = new Mesh(gl, this._createCubeData(0.20, 0.60, 1.00, 0.25));

        this.updateModelMatrix();
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.updateModelMatrix();
    }

    isComplete() {
        return this.framePlaced && this.floatsPlaced && this.paddlePlaced;
    }

    distanceTo(playerPosition) {
        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz);
    }

    draw(shaderProgram, drawMode, isGhostPass) {
        const pulse = 1.0 + 0.02 * Math.sin(this.time * 3.5);

        if (this.framePlaced) {
            if (!isGhostPass) {
                this._drawFrame(shaderProgram, drawMode, this.woodMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawFrame(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }

        if (this.floatsPlaced) {
            if (!isGhostPass) {
                this._drawFloats(shaderProgram, drawMode, this.barrelMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawFloats(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }

        if (this.paddlePlaced) {
            if (!isGhostPass) {
                this._drawPaddle(shaderProgram, drawMode, this.paddleMesh, 1.0);
            }
        } else {
            if (isGhostPass) {
                this._drawPaddle(shaderProgram, drawMode, this.ghostMesh, pulse);
            }
        }

        if (this.sailPlaced) {
            if (!isGhostPass) {
                this._drawSail(shaderProgram, drawMode, this.mastMesh, this.sailMesh, 1.0);
            }
        } else {
            if (this.framePlaced && this.floatsPlaced && this.paddlePlaced) {
                if (isGhostPass) {
                    this._drawSail(shaderProgram, drawMode, this.ghostMesh, this.ghostMesh, pulse);
                }
            }
        }

        if (this.framePlaced && this.floatsPlaced && this.paddlePlaced && this.sailPlaced) {
            if (this.motorPlaced) {
                if (!isGhostPass) {
                    this._drawMotor(shaderProgram, drawMode, this.motorMesh, 1.0);
                }
            } else {
                if (isGhostPass) {
                    this._drawMotor(shaderProgram, drawMode, this.ghostMesh, pulse);
                }
            }
        }
    }

    _drawFrame(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        const logOffsets = [
            [-0.60 * RAFT_SCALE, 0.10 * RAFT_SCALE, 0.0],
            [-0.20 * RAFT_SCALE, 0.10 * RAFT_SCALE, 0.0],
            [ 0.20 * RAFT_SCALE, 0.10 * RAFT_SCALE, 0.0],
            [ 0.60 * RAFT_SCALE, 0.10 * RAFT_SCALE, 0.0]
        ];

        for (const offset of logOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [0.20 * scaleMult * RAFT_SCALE, 0.20 * scaleMult * RAFT_SCALE, 2.60 * scaleMult * RAFT_SCALE]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }

        const crossOffsets = [
            [0.0, 0.20 * RAFT_SCALE, -1.00 * RAFT_SCALE],
            [0.0, 0.20 * RAFT_SCALE,  0.00 * RAFT_SCALE],
            [0.0, 0.20 * RAFT_SCALE,  1.00 * RAFT_SCALE]
        ];

        for (const offset of crossOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [1.50 * scaleMult * RAFT_SCALE, 0.14 * scaleMult * RAFT_SCALE, 0.20 * scaleMult * RAFT_SCALE]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }
    }

    _drawFloats(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        const barrelOffsets = [
            [-0.45 * RAFT_SCALE, -0.22 * RAFT_SCALE, -0.70 * RAFT_SCALE],
            [-0.45 * RAFT_SCALE, -0.22 * RAFT_SCALE,  0.70 * RAFT_SCALE],
            [ 0.45 * RAFT_SCALE, -0.22 * RAFT_SCALE, -0.70 * RAFT_SCALE],
            [ 0.45 * RAFT_SCALE, -0.22 * RAFT_SCALE,  0.70 * RAFT_SCALE]
        ];

        for (const offset of barrelOffsets) {
            Mat4.copy(this.tempMatrix, baseMatrix);
            Mat4.translate(this.tempMatrix, this.tempMatrix, offset);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [0.42 * scaleMult * RAFT_SCALE, 0.50 * scaleMult * RAFT_SCALE, 0.42 * scaleMult * RAFT_SCALE]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            mesh.draw(drawMode);
        }
    }

    _drawPaddle(shaderProgram, drawMode, mesh, scaleMult) {
        const baseMatrix = this.modelMatrix;
        const rotY = 0.15;

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.15 * RAFT_SCALE, 0.28 * RAFT_SCALE, -0.10 * RAFT_SCALE]);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, rotY);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.06 * scaleMult * RAFT_SCALE, 0.06 * scaleMult * RAFT_SCALE, 1.50 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mesh.draw(drawMode);

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.32 * RAFT_SCALE, 0.28 * RAFT_SCALE, 0.70 * RAFT_SCALE]);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, rotY);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.20 * scaleMult * RAFT_SCALE, 0.03 * scaleMult * RAFT_SCALE, 0.40 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mesh.draw(drawMode);
    }

    _drawSail(shaderProgram, drawMode, mastMesh, sailMesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.25 * RAFT_SCALE, 0.0]);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.12 * scaleMult * RAFT_SCALE, 2.3 * scaleMult * RAFT_SCALE, 0.12 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mastMesh.draw(drawMode);

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.5 * RAFT_SCALE, 0.35 * RAFT_SCALE]);
        const billowAngle = 0.06 * Math.sin(this.time * 2.5);
        Mat4.rotateY(this.tempMatrix, this.tempMatrix, billowAngle);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [1.4 * scaleMult * RAFT_SCALE, 1.5 * scaleMult * RAFT_SCALE, 0.04 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        sailMesh.draw(drawMode);
    }

    _drawMotor(shaderProgram, drawMode, motorMesh, scaleMult) {
        const baseMatrix = this.modelMatrix;

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.45 * RAFT_SCALE, -1.3 * RAFT_SCALE]);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.35 * scaleMult * RAFT_SCALE, 0.5 * scaleMult * RAFT_SCALE, 0.35 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        motorMesh.draw(drawMode);

        Mat4.copy(this.tempMatrix, baseMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, -0.15 * RAFT_SCALE, -1.55 * RAFT_SCALE]);
        Mat4.rotateX(this.tempMatrix, this.tempMatrix, 0.25);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.08 * scaleMult * RAFT_SCALE, 0.8 * scaleMult * RAFT_SCALE, 0.08 * scaleMult * RAFT_SCALE]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        motorMesh.draw(drawMode);
    }

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
        if (this.sailMesh) {
            this.sailMesh.delete();
            this.sailMesh = null;
        }
        if (this.mastMesh) {
            this.mastMesh.delete();
            this.mastMesh = null;
        }
        if (this.motorMesh) {
            this.motorMesh.delete();
            this.motorMesh = null;
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
