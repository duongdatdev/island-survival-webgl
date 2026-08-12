import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';
import { AXE_SWING_DURATION } from '../systems/CombatConfig.js';

const DEG_TO_RAD = Math.PI / 180;
const SKIN_COLOR = [0.82, 0.62, 0.48, 1.0];
const SLEEVE_COLOR = [0.07, 0.12, 0.22, 1.0];
// Bottom of the sleeve in camera space. Every attack rotation happens around
// this point so the shoulder never slides across the screen.
const SHOULDER_PIVOT = [0.60, -0.82, -0.62];

function smoothStep(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Clean one-handed first-person axe viewmodel.
 *
 * The character OBJ is a single static mesh whose sleeves overlap the arms.
 * Pulling its Skin material out by itself leaves open seams and long triangles,
 * so the FPS arm uses matching low-poly primitives instead. The world model is
 * untouched and still uses the original character asset.
 */
export class FirstPersonViewModel {
    constructor(gl) {
        this.gl = gl;
        this.axe = null;

        this.sleeve = new Mesh(gl, this._createTaperedCylinderData(SLEEVE_COLOR, 8, 1.08, 0.88));
        this.forearm = new Mesh(gl, this._createTaperedCylinderData(SKIN_COLOR, 8, 1.0, 0.76));
        this.hand = new Mesh(gl, this._createLowPolySphereData(SKIN_COLOR, 8, 5));

        this._sleeveMatrix = Mat4.create();
        this._forearmMatrix = Mat4.create();
        this._handMatrix = Mat4.create();
        this._thumbMatrix = Mat4.create();
        this._axeMatrix = Mat4.create();
        this._identityView = Mat4.create();

        this._time = 0;
        this._moveAmount = 0;
        this._swingElapsed = Infinity;
        this._swingDuration = AXE_SWING_DURATION;
        this._activeSwingDirection = 1;
        this._nextSwingDirection = 1;
    }

    load(assetManager) {
        this.axe = assetManager.models['survival:axe'] || null;
    }

    update(deltaTime, isMoving) {
        this._time += deltaTime;
        const targetMove = isMoving ? 1 : 0;
        this._moveAmount += (targetMove - this._moveAmount) * Math.min(1, deltaTime * 9);
        this._swingElapsed += deltaTime;
    }

    /** Alternate outside -> inside, then inside -> outside on each attack. */
    triggerSwing() {
        this._activeSwingDirection = this._nextSwingDirection;
        this._nextSwingDirection *= -1;
        this._swingElapsed = 0;
    }

    draw(shader, projectionMatrix, drawMode) {
        if (!this.axe) return;

        const gl = this.gl;
        const walkPhase = this._time * 8;
        const idlePhase = this._time * 1.7;
        const bobX = Math.sin(walkPhase) * 0.010 * this._moveAmount
            + Math.sin(idlePhase) * 0.002;
        const bobY = Math.abs(Math.cos(walkPhase)) * -0.013 * this._moveAmount
            + Math.cos(idlePhase * 0.8) * 0.002;
        const pose = this._getSwingPose();

        shader.use();
        shader.setUniformMatrix4fv('uViewMatrix', this._identityView);
        shader.setUniformMatrix4fv('uProjectionMatrix', projectionMatrix);
        shader.setUniform3fv('uViewPosition', [0, 0, 0]);
        shader.setUniform3fv('uLightDirection', [-0.35, 0.78, 0.52]);
        shader.setUniform3fv('uLightColor', [1.0, 0.92, 0.82]);
        shader.setUniform1f('uLightIntensity', 0.72);
        shader.setUniform3fv('uAmbientColor', [0.58, 0.64, 0.72]);
        shader.setUniform1f('uAmbientIntensity', 0.78);
        shader.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);

        // The viewmodel owns a fresh depth layer so nearby world geometry can
        // never cut through the arm or axe.
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);

        this._buildSegmentMatrix(
            this._sleeveMatrix,
            [0.60, -0.82, -0.62],
            24,
            -12,
            [0.105, 0.38, 0.105],
            bobX,
            bobY,
            pose
        );
        shader.setUniformMatrix4fv('uModelMatrix', this._sleeveMatrix);
        this.sleeve.draw(drawMode);

        this._buildSegmentMatrix(
            this._forearmMatrix,
            [0.46, -0.64, -0.70],
            24,
            -22,
            [0.082, 0.34, 0.082],
            bobX,
            bobY,
            pose
        );
        shader.setUniformMatrix4fv('uModelMatrix', this._forearmMatrix);
        this.forearm.draw(drawMode);

        this._buildHandMatrix(this._handMatrix, bobX, bobY, pose);
        shader.setUniformMatrix4fv('uModelMatrix', this._handMatrix);
        this.hand.draw(drawMode);

        this._buildThumbMatrix(this._thumbMatrix, bobX, bobY, pose);
        shader.setUniformMatrix4fv('uModelMatrix', this._thumbMatrix);
        this.hand.draw(drawMode);

        this._buildAxeMatrix(this._axeMatrix, bobX, bobY, pose);
        shader.setUniformMatrix4fv('uModelMatrix', this._axeMatrix);
        this.axe.draw(drawMode);
    }

    _getSwingPose() {
        const progress = Math.min(1, this._swingElapsed / this._swingDuration);
        if (progress >= 1) {
            return { roll: 0, pitch: 0 };
        }

        const direction = this._activeSwingDirection;
        const outsideAngle = direction * 31 * DEG_TO_RAD;
        const followThroughAngle = -direction * 40 * DEG_TO_RAD;

        if (progress < 0.18) {
            const t = smoothStep(progress / 0.18);
            return {
                roll: lerp(0, outsideAngle, t),
                pitch: 0,
            };
        }

        if (progress < 0.70) {
            const t = smoothStep((progress - 0.18) / 0.52);
            const strike = Math.sin(t * Math.PI);
            return {
                roll: lerp(outsideAngle, followThroughAngle, t),
                // A small upward pitch keeps the axe visible while it crosses
                // the screen; negative pitch would bury it below the hotbar.
                pitch: 9 * DEG_TO_RAD * strike,
            };
        }

        const t = smoothStep((progress - 0.70) / 0.30);
        return {
            roll: lerp(followThroughAngle, 0, t),
            pitch: 0,
        };
    }

    _applyRootTransform(out, bobX, bobY, pose) {
        Mat4.identity(out);
        Mat4.translate(out, out, [bobX, bobY, 0]);
        // Rotate the whole arm around its shoulder instead of around the
        // camera origin. The sleeve base is therefore stationary while the
        // arm, gripping hand and axe sweep in and out as one articulated unit.
        Mat4.translate(out, out, SHOULDER_PIVOT);
        Mat4.rotateZ(out, out, pose.roll);
        Mat4.rotateX(out, out, pose.pitch);
        Mat4.translate(out, out, [
            -SHOULDER_PIVOT[0],
            -SHOULDER_PIVOT[1],
            -SHOULDER_PIVOT[2],
        ]);
    }

    _buildSegmentMatrix(out, position, rotationZ, rotationX, scale, bobX, bobY, pose) {
        this._applyRootTransform(out, bobX, bobY, pose);
        Mat4.translate(out, out, position);
        Mat4.rotateZ(out, out, rotationZ * DEG_TO_RAD);
        Mat4.rotateX(out, out, rotationX * DEG_TO_RAD);
        Mat4.scale(out, out, scale);
    }

    _buildHandMatrix(out, bobX, bobY, pose) {
        this._applyRootTransform(out, bobX, bobY, pose);
        Mat4.translate(out, out, [0.325, -0.345, -0.84]);
        Mat4.rotateZ(out, out, -14 * DEG_TO_RAD);
        Mat4.rotateX(out, out, -10 * DEG_TO_RAD);
        Mat4.scale(out, out, [0.064, 0.088, 0.058]);
    }

    _buildThumbMatrix(out, bobX, bobY, pose) {
        this._applyRootTransform(out, bobX, bobY, pose);
        Mat4.translate(out, out, [0.292, -0.345, -0.805]);
        Mat4.rotateZ(out, out, 48 * DEG_TO_RAD);
        Mat4.rotateX(out, out, -8 * DEG_TO_RAD);
        Mat4.scale(out, out, [0.034, 0.058, 0.032]);
    }

    _buildAxeMatrix(out, bobX, bobY, pose) {
        this._applyRootTransform(out, bobX, bobY, pose);
        Mat4.translate(out, out, [0.285, -0.475, -0.89]);
        Mat4.rotateZ(out, out, -14 * DEG_TO_RAD);
        Mat4.scale(out, out, [0.94, 0.94, 0.94]);
    }

    _createTaperedCylinderData(color, segments, bottomRadius, topRadius) {
        const positions = [];
        const normals = [];
        const colors = [];
        const texCoords = [];
        const indices = [];

        const addVertex = (position, normal, uv) => {
            positions.push(...position);
            normals.push(...normal);
            colors.push(...color);
            texCoords.push(...uv);
            return positions.length / 3 - 1;
        };

        for (let i = 0; i < segments; i++) {
            const a0 = i / segments * Math.PI * 2;
            const a1 = (i + 1) / segments * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);
            const b0 = addVertex([c0 * bottomRadius, 0, s0 * bottomRadius], [c0, 0, s0], [i / segments, 0]);
            const b1 = addVertex([c1 * bottomRadius, 0, s1 * bottomRadius], [c1, 0, s1], [(i + 1) / segments, 0]);
            const t0 = addVertex([c0 * topRadius, 1, s0 * topRadius], [c0, 0, s0], [i / segments, 1]);
            const t1 = addVertex([c1 * topRadius, 1, s1 * topRadius], [c1, 0, s1], [(i + 1) / segments, 1]);
            indices.push(b0, t0, b1, b1, t0, t1);

            const bottomCenter = addVertex([0, 0, 0], [0, -1, 0], [0.5, 0.5]);
            const bottom0 = addVertex([c0 * bottomRadius, 0, s0 * bottomRadius], [0, -1, 0], [0, 0]);
            const bottom1 = addVertex([c1 * bottomRadius, 0, s1 * bottomRadius], [0, -1, 0], [1, 0]);
            indices.push(bottomCenter, bottom0, bottom1);

            const topCenter = addVertex([0, 1, 0], [0, 1, 0], [0.5, 0.5]);
            const top0 = addVertex([c0 * topRadius, 1, s0 * topRadius], [0, 1, 0], [0, 1]);
            const top1 = addVertex([c1 * topRadius, 1, s1 * topRadius], [0, 1, 0], [1, 1]);
            indices.push(topCenter, top1, top0);
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            texCoords: new Float32Array(texCoords),
            indices: new Uint32Array(indices),
        };
    }

    _createLowPolySphereData(color, segments, rings) {
        const positions = [];
        const normals = [];
        const colors = [];
        const texCoords = [];
        const indices = [];

        for (let ring = 0; ring <= rings; ring++) {
            const v = ring / rings;
            const latitude = -Math.PI * 0.5 + v * Math.PI;
            const y = Math.sin(latitude);
            const radius = Math.cos(latitude);

            for (let segment = 0; segment <= segments; segment++) {
                const u = segment / segments;
                const angle = u * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                positions.push(x, y, z);
                normals.push(x, y, z);
                colors.push(...color);
                texCoords.push(u, v);
            }
        }

        for (let ring = 0; ring < rings; ring++) {
            for (let segment = 0; segment < segments; segment++) {
                const row = segments + 1;
                const i0 = ring * row + segment;
                const i1 = i0 + 1;
                const i2 = i0 + row;
                const i3 = i2 + 1;
                indices.push(i0, i2, i1, i1, i2, i3);
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            texCoords: new Float32Array(texCoords),
            indices: new Uint32Array(indices),
        };
    }

    delete() {
        if (this.sleeve) this.sleeve.delete();
        if (this.forearm) this.forearm.delete();
        if (this.hand) this.hand.delete();
        this.sleeve = null;
        this.forearm = null;
        this.hand = null;
        // Axe is owned by AssetManager and must not be deleted here.
        this.axe = null;
    }
}
