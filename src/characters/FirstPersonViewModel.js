import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';
import { createViewHandData } from './ViewHandGeometry.js';
import { strikePose, workPose, WORK_DURATIONS } from './ActionAnimation.js';
import {
    AXE_IMPACT_TIME,
    AXE_SWING_DURATION,
    getWeaponProfile,
} from '../systems/CombatConfig.js';

const DEG_TO_RAD = Math.PI / 180;
const SKIN_COLOR = [0.68, 0.46, 0.32, 1.0];
const SLEEVE_COLOR = [0.18, 0.24, 0.18, 1.0];
const WOOD_COLOR = [0.42, 0.24, 0.10, 1.0];
const STONE_COLOR = [0.36, 0.40, 0.43, 1.0];
const STRING_COLOR = [0.82, 0.78, 0.62, 1.0];
const SHOULDER_PIVOT = [0.60, -0.82, -0.62];

function smoothStep(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

export class FirstPersonViewModel {
    constructor(gl) {
        this.gl = gl;
        this.reducedMotion = false;
        this.axe = null;

        this.sleeve = new Mesh(gl, this._createTaperedCylinderData(SLEEVE_COLOR, 8, 1.08, 0.88));
        this.forearm = new Mesh(gl, this._createTaperedCylinderData(SKIN_COLOR, 8, 1.0, 0.76));
        this.hand = new Mesh(gl, createViewHandData(1));
        this.leftHand = new Mesh(gl, createViewHandData(-1));
        this.spearShaft = new Mesh(gl, this._createTaperedCylinderData(WOOD_COLOR, 6, 1, 0.92));
        this.spearTip = new Mesh(gl, this._createTaperedCylinderData(STONE_COLOR, 6, 0.9, 0.05));
        this.bowLimb = new Mesh(gl, this._createTaperedCylinderData(WOOD_COLOR, 6, 0.8, 0.65));
        this.bowString = new Mesh(gl, this._createTaperedCylinderData(STRING_COLOR, 5, 0.35, 0.35));
        this.arrow = new Mesh(gl, this._createTaperedCylinderData(WOOD_COLOR, 5, 0.55, 0.45));

        this._sleeveMatrix = Mat4.create();
        this._forearmMatrix = Mat4.create();
        this._handMatrix = Mat4.create();
        this._axeMatrix = Mat4.create();
        this._weaponMatrix = Mat4.create();
        this._weaponMatrix2 = Mat4.create();
        this._weaponMatrix3 = Mat4.create();
        this._identityView = Mat4.create();

        this._work = null;
        this._workElapsed = 0;
        this._workBlend = 0;
        this._armMatrix = Mat4.create();
        this._time = 0;
        this._moveAmount = 0;
        this._swingElapsed = Infinity;
        this._swingDuration = AXE_SWING_DURATION;
        this._impactEmitted = false;
        this._activeSwingDirection = 1;
        this._nextSwingDirection = 1;
        this.weaponId = 'fist';
        this._bowCharging = false;
        this._bowChargeElapsed = 0;
        this._bowReleaseElapsed = Infinity;
    }

    load(assetManager) {
        this.axe = assetManager.models['survival:axe'] || null;
        this.tools = {
            hammer: assetManager.models['campaign:survival_tool-hammer'],
            iron_axe: assetManager.models['campaign:survival_tool-axe-upgraded'],
            stone_pickaxe: assetManager.models['campaign:survival_tool-pickaxe'],
            iron_pickaxe: assetManager.models['campaign:survival_tool-pickaxe-upgraded'],
        };
    }

    update(deltaTime, isMoving) {
        this._time += deltaTime;
        this._workElapsed = (this._workElapsed || 0) + deltaTime;
        if (this._work?.once && this._workElapsed >= WORK_DURATIONS[this._work.kind]) {
            this._lastWorkPose = this._getWorkPose();
            this._work = null;
        }
        this._workBlend = Math.max(0, Math.min(1, (this._workBlend || 0) + (this._work ? 1 : -1) * deltaTime * 8));
        const targetMove = isMoving ? 1 : 0;
        this._moveAmount += (targetMove - this._moveAmount) * Math.min(1, deltaTime * 9);
        const previousSwingElapsed = this._swingElapsed;
        this._swingElapsed += deltaTime;
        if (this._bowCharging) this._bowChargeElapsed += deltaTime;
        this._bowReleaseElapsed += deltaTime;
        const profile = getWeaponProfile(this.weaponId) || getWeaponProfile('fist');
        const impactTime = profile.impactTime ?? AXE_IMPACT_TIME;
        if (!this._impactEmitted && previousSwingElapsed < impactTime
            && this._swingElapsed >= impactTime) {
            this._impactEmitted = true;
            return { type: 'impact', weaponId: this.weaponId };
        }
        return null;
    }

    setActivity(activity) {
        if (activity) {
            if (this._work?.kind !== activity.kind) this._workElapsed = 0;
            this._work = { ...activity, once: false };
        } else if (this._work && !this._work.once) {
            // Keep the final pose while blending back to the equipped weapon.
            this._lastWorkPose = this._getWorkPose();
            this._work = null;
        }
    }

    playAction(kind) {
        if (!WORK_DURATIONS[kind] || this._work && !this._work.once) return;
        if (this._bowCharging || this._swingElapsed < this._swingDuration) return;
        this._work = { kind, once: true };
        this._workElapsed = 0;
    }

    cancelActivity() {
        this._work = null;
        this._lastWorkPose = null;
        this._workElapsed = 0;
        this._workBlend = 0;
    }

    get visualWeaponId() {
        if (this._work?.weapon) return this._work.weapon;
        if (this._work?.kind === 'build') return 'hammer';
        if (this._work?.kind === 'fish') return 'fishing_rod';
        if (this._work) return 'fist';
        return this.weaponId;
    }

    _getWorkPose() {
        if (this._work?.kind === 'mine') {
            const profile = getWeaponProfile(this._work.weapon);
            return { ...strikePose(this._workElapsed % profile.duration, profile), work: 'mine' };
        }
        return this._work ? workPose(this._work.kind, this._workElapsed, this._work.phase) : this._lastWorkPose;
    }

    triggerSwing() {
        this.beginAttack('stone_axe');
    }

    setWeapon(weaponId) {
        const nextWeapon = getWeaponProfile(weaponId) ? weaponId : 'fist';
        if (this.weaponId === nextWeapon) return;
        this.cancel();
        this.weaponId = nextWeapon;
    }

    beginAttack(weaponId = this.weaponId) {
        this.setWeapon(weaponId);
        const profile = getWeaponProfile(this.weaponId) || getWeaponProfile('fist');
        if (profile.type !== 'melee') return false;
        this._work = null;
        this._workBlend = 0;
        this._activeSwingDirection = this._nextSwingDirection;
        this._nextSwingDirection *= -1;
        this._swingElapsed = 0;
        this._swingDuration = profile.duration ?? AXE_SWING_DURATION;
        this._impactEmitted = false;
        return true;
    }

    beginBowCharge() {
        this.setWeapon('bow');
        this._work = null;
        this._workBlend = 0;
        this._bowCharging = true;
        this._bowChargeElapsed = 0;
    }

    getBowCharge() {
        const profile = getWeaponProfile('bow');
        return Math.max(0, Math.min(1, this._bowChargeElapsed / profile.fullChargeSeconds));
    }

    releaseBow() {
        const charge = this.getBowCharge();
        this._bowCharging = false;
        this._bowReleaseElapsed = 0;
        return charge;
    }

    cancel() {
        this._swingElapsed = Infinity;
        this._impactEmitted = true;
        this._bowCharging = false;
        this._bowChargeElapsed = 0;
        this._bowReleaseElapsed = Infinity;
    }

    draw(shader, projectionMatrix, drawMode) {
        const gl = this.gl;
        const walkPhase = this._time * 8;
        const idlePhase = this._time * 1.7;
        const bobX = this.reducedMotion ? 0 : Math.sin(walkPhase) * 0.010 * this._moveAmount
            + Math.sin(idlePhase) * 0.002;
        const bobY = this.reducedMotion ? 0 : Math.abs(Math.cos(walkPhase)) * -0.013 * this._moveAmount
            + Math.cos(idlePhase * 0.8) * 0.002;
        const pose = this._getWeaponPose();

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

        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);

        this._drawArm(shader, drawMode, bobX, bobY, pose);
        // A second hand braces tools, grips the bow, reels and alternates punches.
        const support = { ...pose, shoulderSide: -(pose.shoulderSide || 1) };
        if (this.visualWeaponId === 'fist' && !pose.work) {
            support.z = 0;
            support.pitch = 0;
            support.roll = 0;
        } else if (pose.work === 'swim') {
            support.z *= -1;
            support.roll *= -1;
            support.pitch *= -1;
        }
        this._drawArm(shader, drawMode, bobX, bobY, support, true);

        this._drawEquippedWeapon(shader, drawMode, bobX, bobY, pose);
    }

    _getWeaponPose() {
        const work = this._getWorkPose();
        if (work && this._workBlend > 0) {
            const weight = smoothStep(this._workBlend);
            return { ...work, roll: work.roll * weight, pitch: work.pitch * weight,
                x: (work.x || 0) * weight, y: (work.y || 0) * weight, z: work.z * weight };
        }
        if (this.weaponId === 'bow') {
            const charge = this._bowCharging ? this.getBowCharge() : 0;
            const releaseKick = this._bowReleaseElapsed < 0.22
                ? Math.sin(this._bowReleaseElapsed / 0.22 * Math.PI) : 0;
            return { roll: -charge * 5 * DEG_TO_RAD, pitch: -charge * 4 * DEG_TO_RAD,
                z: charge * 0.08 - releaseKick * 0.045, charge };
        }
        return strikePose(this._swingElapsed, getWeaponProfile(this.weaponId) || getWeaponProfile('fist'), this._activeSwingDirection);
    }

    _getSwingPose() {
        return strikePose(this._swingElapsed, getWeaponProfile(this.weaponId) || getWeaponProfile('stone_axe'), this._activeSwingDirection);
    }

    _drawArm(shader, mode, bobX, bobY, pose, support = false) {
        const side = pose.shoulderSide || 1;
        // Connected shoulder/elbow/wrist segments keep the grip attached throughout a stroke.
        const weapon = this.visualWeaponId;
        const unarmed = weapon === 'fist' && !pose.work;
        // Low relaxed guard: hands rise into the strike, rather than filling the view at rest.
        const extension = unarmed ? Math.min(1, Math.abs(pose.z || 0) / 0.30) : 1;
        let hand = [0.325 * side, -0.345 - (1 - extension) * 0.20, -0.84];
        if (weapon === 'bow') hand = support ? [-0.22, -0.25, -1.04] : [-0.12, -0.24, -0.82 + (pose.charge || 0) * 0.28];
        else if (support && weapon !== 'fist') hand = weapon === 'spear' ? [0.30, -0.39, -1.18] : [0.27, -0.16, -0.88];
        // Bend the elbow during anticipation and extend it on the strike.
        const elbow = [0.46 * side, -0.64 - Math.min(0.04, Math.abs(pose.pitch) * 0.1), -0.70 + (pose.z || 0) * 0.2];
        const shoulder = [0.60 * side, -0.9, -0.48];
        const wrist = [hand[0], hand[1] - 0.052, hand[2] + 0.012];
        const cuff = elbow.map((value, axis) => value + (wrist[axis] - value) * 0.70);
        for (const [mesh, start, end, radius] of [
            [this.sleeve, shoulder, elbow, 0.077], [this.sleeve, elbow, cuff, 0.062],
            [this.forearm, cuff, wrist, 0.044],
        ]) {
            this._applyRootTransform(this._armMatrix, bobX, bobY, { ...pose, shoulderSide: weapon === 'fist' && !pose.work ? side : 1 });
            this._segmentBetween(this._armMatrix, start, end, radius);
            shader.setUniformMatrix4fv('uModelMatrix', this._armMatrix);
            mesh.draw(mode);
        }
        this._applyRootTransform(this._handMatrix, bobX, bobY, { ...pose, shoulderSide: weapon === 'fist' && !pose.work ? side : 1 });
        Mat4.translate(this._handMatrix, this._handMatrix, hand);
        Mat4.rotateZ(this._handMatrix, this._handMatrix, -14 * DEG_TO_RAD * side);
        Mat4.rotateX(this._handMatrix, this._handMatrix, -0.12);
        shader.setUniformMatrix4fv('uModelMatrix', this._handMatrix);
        (side > 0 ? this.hand : this.leftHand).draw(mode);
    }

    _segmentBetween(out, start, end, radius) {
        const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
        const length = Math.hypot(dx, dy, dz);
        Mat4.translate(out, out, start);
        Mat4.rotateY(out, out, Math.atan2(dx, dz));
        Mat4.rotateX(out, out, Math.atan2(Math.hypot(dx, dz), dy));
        Mat4.scale(out, out, [radius, length, radius]);
    }

    _applyRootTransform(out, bobX, bobY, pose) {
        Mat4.identity(out);
        Mat4.translate(out, out, [bobX, bobY, 0]);
        Mat4.translate(out, out, [pose.x || 0, pose.y || 0, pose.z || 0]);
        const shoulderSide = pose.shoulderSide || 1;
        Mat4.translate(out, out, [SHOULDER_PIVOT[0] * shoulderSide, SHOULDER_PIVOT[1], SHOULDER_PIVOT[2]]);
        Mat4.rotateZ(out, out, pose.roll);
        Mat4.rotateX(out, out, pose.pitch);
        Mat4.translate(out, out, [
            -SHOULDER_PIVOT[0] * shoulderSide,
            -SHOULDER_PIVOT[1],
            -SHOULDER_PIVOT[2],
        ]);
    }

    _buildAxeMatrix(out, bobX, bobY, pose) {
        this._applyRootTransform(out, bobX, bobY, pose);
        Mat4.translate(out, out, [0.285, -0.475, -0.89]);
        Mat4.rotateZ(out, out, -14 * DEG_TO_RAD);
        Mat4.scale(out, out, [0.94, 0.94, 0.94]);
    }

    _drawEquippedWeapon(shader, drawMode, bobX, bobY, pose) {
        const weaponId = this.visualWeaponId;
        const tool = this.tools?.[weaponId];
        if (tool) {
            this._buildAxeMatrix(this._axeMatrix, bobX, bobY, pose);
            tool.draw(shader, this._axeMatrix, drawMode);
            return;
        }
        if (weaponId === 'stone_axe') {
            if (!this.axe) return;
            this._buildAxeMatrix(this._axeMatrix, bobX, bobY, pose);
            shader.setUniformMatrix4fv('uModelMatrix', this._axeMatrix);
            this.axe.draw(drawMode);
            return;
        }
        if (weaponId === 'spear') {
            this._buildSpearMatrices(bobX, bobY, pose);
            shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix);
            this.spearShaft.draw(drawMode);
            shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix2);
            this.spearTip.draw(drawMode);
            return;
        }
        if (weaponId === 'fishing_rod') {
            this._applyRootTransform(this._weaponMatrix, bobX, bobY, pose);
            Mat4.translate(this._weaponMatrix, this._weaponMatrix, [0.325, -0.40, -0.84]);
            Mat4.rotateX(this._weaponMatrix, this._weaponMatrix, -0.85);
            Mat4.scale(this._weaponMatrix, this._weaponMatrix, [0.018, 1.35, 0.018]);
            shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix);
            this.spearShaft.draw(drawMode);
            return;
        }
        if (weaponId === 'bow') {
            this._drawBow(shader, drawMode, bobX, bobY, pose);
        }
    }

    _buildSpearMatrices(bobX, bobY, pose) {
        this._applyRootTransform(this._weaponMatrix, bobX, bobY, pose);
        Mat4.translate(this._weaponMatrix, this._weaponMatrix, [0.30, -0.39, -0.84]);
        Mat4.rotateX(this._weaponMatrix, this._weaponMatrix, -Math.PI * 0.5);
        Mat4.scale(this._weaponMatrix, this._weaponMatrix, [0.035, 1.35, 0.035]);

        this._applyRootTransform(this._weaponMatrix2, bobX, bobY, pose);
        Mat4.translate(this._weaponMatrix2, this._weaponMatrix2, [0.30, -0.39, -2.19]);
        Mat4.rotateX(this._weaponMatrix2, this._weaponMatrix2, -Math.PI * 0.5);
        Mat4.scale(this._weaponMatrix2, this._weaponMatrix2, [0.075, 0.22, 0.075]);
    }

    _drawBow(shader, drawMode, bobX, bobY, pose) {
        const charge = pose.charge || 0;
        const bend = charge * 0.035;
        const curve = [
            [-0.22, -0.72, -0.82 + bend], [-0.22, -0.52, -0.98],
            [-0.22, -0.25, -1.04], [-0.22, 0.02, -0.98], [-0.22, 0.22, -0.82 + bend],
        ];
        for (let index = 0; index < curve.length - 1; index++) {
            this._applyRootTransform(this._weaponMatrix, bobX, bobY, pose);
            this._segmentBetween(this._weaponMatrix, curve[index], curve[index + 1], 0.025);
            shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix);
            this.bowLimb.draw(drawMode);
        }

        // Two string halves meet at the drawing hand; a straight translated string cannot draw a bow.
        const nock = [-0.12, -0.24, -0.82 + charge * 0.28];
        for (const end of [curve[0], curve[curve.length - 1]]) {
            this._applyRootTransform(this._weaponMatrix3, bobX, bobY, pose);
            this._segmentBetween(this._weaponMatrix3, end, nock, 0.009);
            shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix3);
            this.bowString.draw(drawMode);
        }
        if (this._bowReleaseElapsed < 0.30) return;
        this._applyRootTransform(this._weaponMatrix3, bobX, bobY, pose);
        Mat4.translate(this._weaponMatrix3, this._weaponMatrix3, nock);
        Mat4.rotateX(this._weaponMatrix3, this._weaponMatrix3, -Math.PI * 0.5);
        Mat4.scale(this._weaponMatrix3, this._weaponMatrix3, [0.016, 0.72, 0.016]);
        shader.setUniformMatrix4fv('uModelMatrix', this._weaponMatrix3);
        this.arrow.draw(drawMode);
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

    delete() {
        if (this.sleeve) this.sleeve.delete();
        if (this.forearm) this.forearm.delete();
        if (this.hand) this.hand.delete();
        if (this.leftHand) this.leftHand.delete();
        if (this.spearShaft) this.spearShaft.delete();
        if (this.spearTip) this.spearTip.delete();
        if (this.bowLimb) this.bowLimb.delete();
        if (this.bowString) this.bowString.delete();
        if (this.arrow) this.arrow.delete();
        this.sleeve = null;
        this.forearm = null;
        this.hand = null;
        this.leftHand = null;
        this.spearShaft = null;
        this.spearTip = null;
        this.bowLimb = null;
        this.bowString = null;
        this.arrow = null;
        this.axe = null;
        this.tools = null;
    }
}
