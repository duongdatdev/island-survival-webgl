import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';


const STREAM_TOP_Y = 5.3;
const STREAM_BOTTOM_Y = 0.45;
const STREAM_Z = -1.55;
const STREAK_COUNT = 6;
const POND_RADIUS = 2.4;

export class Waterfall extends Entity {
    constructor(gl, position) {
        super();
        this.gl = gl;
        Vec3.copy(this.position, position);

        this.rockMesh = new Mesh(gl, this._createCubeData(0.42, 0.43, 0.47, 1.0));
        this.streamMesh = new Mesh(gl, this._createCubeData(0.35, 0.68, 0.95, 0.7));
        this.foamMesh = new Mesh(gl, this._createCubeData(0.92, 0.97, 1.0, 0.85));
        this.pondMesh = new Mesh(gl, this._createDiscData(0.16, 0.52, 0.82, 0.62, 28));

        this._cliffBlocks = [
            { t: [0.0, -1.6, -3.4], s: [8.2, 9.0, 3.0], ry: 0.0, rz: 0.0 },
            { t: [-3.4, -1.0, -2.6], s: [2.8, 8.0, 2.6], ry: 0.4, rz: 0.06 },
            { t: [3.6, -1.2, -2.7], s: [3.0, 8.4, 2.4], ry: -0.32, rz: -0.05 },
            { t: [-0.8, 3.4, -2.9], s: [5.6, 3.4, 2.2], ry: 0.05, rz: 0.03 },
            { t: [2.2, 3.0, -2.8], s: [2.6, 3.0, 2.0], ry: -0.5, rz: 0.0 },
            { t: [0.2, 5.6, -3.0], s: [4.2, 2.2, 2.4], ry: 0.12, rz: -0.04 },
            { t: [-1.6, 6.4, -3.2], s: [2.0, 1.6, 1.9], ry: 0.6, rz: 0.05 },
            { t: [1.8, 6.2, -3.3], s: [1.8, 1.4, 1.8], ry: -0.4, rz: 0.0 },
            { t: [-2.4, 0.3, -1.4], s: [1.7, 1.5, 1.7], ry: 0.5, rz: 0.0 },
            { t: [2.6, 0.2, -1.3], s: [1.6, 1.3, 1.6], ry: -0.35, rz: 0.0 },
        ];

        this._rimRocks = [];
        const rimCount = 16;
        for (let i = 0; i < rimCount; i++) {
            const a = (i / rimCount) * Math.PI * 2.0;
            const r = POND_RADIUS + 0.35 + Math.sin(i * 2.7) * 0.12;
            const w = 0.95 + Math.sin(i * 3.1) * 0.25;
            this._rimRocks.push({
                t: [Math.cos(a) * r, -0.12 + Math.sin(i * 1.3) * 0.06, Math.sin(a) * r],
                s: [w, 0.7 + Math.cos(i * 2.2) * 0.15, w],
                ry: a + Math.sin(i) * 0.3,
                rz: Math.sin(i * 1.7) * 0.12,
            });
        }

        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        this.updateModelMatrix();
    }

    update(deltaTime, particleSystem) {
        this.time += deltaTime;

        if (particleSystem && Math.random() < 0.4) {
            const splashPos = [
                this.position[0] + (Math.random() - 0.5) * 1.8,
                this.position[1] + 0.4,
                this.position[2] + STREAM_Z + 0.6 + (Math.random() - 0.5) * 0.8,
            ];
            particleSystem.emit(splashPos, {
                count: 5,
                color: [0.7, 0.85, 1.0],
                colorVariance: 0.08,
                size: 5,
                sizeVariance: 2,
                speed: 2.0,
                speedVariance: 0.8,
                lifetime: 0.55,
                lifetimeVariance: 0.2,
                gravity: -5.0,
                spread: 0.9,
                yBias: 2.2,
            });
        }
    }

    isPlayerInPond(playerPos) {
        const dx = playerPos[0] - this.position[0];
        const dz = playerPos[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        return distSq <= 3.5 * 3.5;
    }

    drawSolid(shaderProgram, drawMode) {
        const base = this.modelMatrix;

        for (const b of this._cliffBlocks) this._drawBlock(shaderProgram, drawMode, this.rockMesh, base, b);

        for (const b of this._rimRocks) this._drawBlock(shaderProgram, drawMode, this.rockMesh, base, b);
    }

    draw(shaderProgram, drawMode) {
        const base = this.modelMatrix;

        Mat4.copy(this.tempMatrix, base);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.12, 0.0]);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [POND_RADIUS, 1.0, POND_RADIUS]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.pondMesh.draw(drawMode);

        const streamMidY = (STREAM_TOP_Y + STREAM_BOTTOM_Y) * 0.5;
        const streamLen = STREAM_TOP_Y - STREAM_BOTTOM_Y;
        Mat4.copy(this.tempMatrix, base);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, streamMidY, STREAM_Z]);
        Mat4.rotateX(this.tempMatrix, this.tempMatrix, 0.12);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [1.9, streamLen, 0.35]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.streamMesh.draw(drawMode);

        Mat4.copy(this.tempMatrix, base);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, STREAM_TOP_Y + 0.1, STREAM_Z - 0.15]);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [2.1, 0.5, 0.7]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.foamMesh.draw(drawMode);

        for (let i = 0; i < STREAK_COUNT; i++) {
            const phase = (this.time * 0.55 + i / STREAK_COUNT) % 1.0;
            const y = STREAM_TOP_Y - phase * streamLen;
            const xOff = Math.sin(i * 2.3) * 0.6;
            Mat4.copy(this.tempMatrix, base);
            Mat4.translate(this.tempMatrix, this.tempMatrix, [xOff, y, STREAM_Z + 0.22]);
            Mat4.scale(this.tempMatrix, this.tempMatrix, [0.35, 0.6, 0.12]);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
            this.foamMesh.draw(drawMode);
        }

        const pulse = 1.0 + 0.15 * Math.sin(this.time * 6.0);
        Mat4.copy(this.tempMatrix, base);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.4, STREAM_Z + 0.7]);
        Mat4.scale(this.tempMatrix, this.tempMatrix, [2.3 * pulse, 0.5, 1.3 * pulse]);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.foamMesh.draw(drawMode);
    }

    _drawBlock(shaderProgram, drawMode, mesh, base, b) {
        Mat4.copy(this.tempMatrix, base);
        Mat4.translate(this.tempMatrix, this.tempMatrix, b.t);
        if (b.ry) Mat4.rotateY(this.tempMatrix, this.tempMatrix, b.ry);
        if (b.rz) Mat4.rotateZ(this.tempMatrix, this.tempMatrix, b.rz);
        Mat4.scale(this.tempMatrix, this.tempMatrix, b.s);
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        mesh.draw(drawMode);
    }

    delete() {
        if (this.rockMesh) { this.rockMesh.delete(); this.rockMesh = null; }
        if (this.streamMesh) { this.streamMesh.delete(); this.streamMesh = null; }
        if (this.foamMesh) { this.foamMesh.delete(); this.foamMesh = null; }
        if (this.pondMesh) { this.pondMesh.delete(); this.pondMesh = null; }
    }

    _createDiscData(r, g, b, a, segments = 24) {
        const positions = [0, 0, 0];
        const normals = [0, 1, 0];
        const colors = [r, g, b, a];
        const texCoords = [0.5, 0.5];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const ang = (i / segments) * Math.PI * 2.0;
            const cx = Math.cos(ang);
            const cz = Math.sin(ang);
            positions.push(cx, 0, cz);
            normals.push(0, 1, 0);
            colors.push(r, g, b, a);
            texCoords.push(0.5 + cx * 0.5, 0.5 + cz * 0.5);
            if (i > 0) indices.push(0, i + 1, i);
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            texCoords: new Float32Array(texCoords),
            indices: new Uint16Array(indices),
        };
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
