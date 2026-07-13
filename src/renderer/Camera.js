import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { CameraConfig } from './CameraConfig.js';
import { ExploreState } from './CameraState.js';
import { CameraCollision } from './CameraCollision.js';
import { CameraTerrain } from './CameraTerrain.js';
import { CameraZoomController } from './CameraZoomController.js';
import { CameraOcclusion } from './CameraOcclusion.js';
import { CameraDebug } from './CameraDebug.js';

const UP = Vec3.create(0, 1, 0);
const POS_SNAP_THRESHOLD_SQ = 0.01;

function lerpAngle(current, target, t) {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * t;
}

export class Camera {
    constructor(fov = 45 * Math.PI / 180, aspect = 1.0, near = 0.1, far = 1000.0) {
        this.viewMatrix = Mat4.create();
        this.projectionMatrix = Mat4.create();
        this.position = Vec3.create(0, 0, 0);
        this.target = Vec3.create(0, 1.0, 0);

        this._cfg = new CameraConfig();
        this.config = {};
        this._flattenConfig();
        this.config.fov = fov;
        this.config.aspect = aspect;
        this.config.near = near;
        this.config.far = far;

        this._yaw = this.config.defaultYaw;
        this._pitch = this.config.defaultPitch;
        this._distance = this.config.defaultDistance;

        this._smoothPos = Vec3.create(0, 0, 0);
        this._smoothYaw = this._yaw;
        this._smoothPitch = this._pitch;
        this._smoothDistance = this._distance;

        this._lookTarget = Vec3.create();
        this._pivot = Vec3.create();
        this._desiredPos = Vec3.create();
        this._cosYaw = 0;
        this._sinYaw = 0;

        this._collision = new CameraCollision();
        this._terrain = new CameraTerrain();
        this._zoom = new CameraZoomController(this.config.defaultDistance);
        this._occlusion = new CameraOcclusion();
        this._debug = new CameraDebug(this.config.debugEnabled);

        this._states = new Map();
        this._states.set('Explore', new ExploreState());
        this._currentState = this._states.get('Explore');

        this._events = {
            onCollisionBegin: null,
            onCollisionEnd: null,
            onTerrainCorrection: null,
            onZoomChanged: null,
            onStateChanged: null,
        };

        this._firstUpdate = true;
        this._lastCollisionHit = false;
        this._terrainYDelta = 0;

        this._updateProjection();
    }

    setAspect(aspect) {
        if (Math.abs(this.config.aspect - aspect) > 0.0001) {
            this.config.aspect = aspect;
            this._updateProjection();
        }
    }

    setMode(name) {
        const next = this._states.get(name);
        if (!next || next === this._currentState) return;
        this._currentState.onExit(this);
        const prev = this._currentState;
        this._currentState = next;
        this._currentState.onEnter(this);
        this._emit('onStateChanged', prev.name, next.name);
    }

    setShoulderOffset(x, y) {
        this.config.shoulderOffsetX = x;
        this.config.shoulderOffsetY = y;
    }

    setCollisionProvider(provider) {
        this._collision.setProvider(provider);
    }

    setTerrainProvider(provider) {
        this._terrain.setProvider(provider);
    }

    setCutsceneView(position, target) {
        Vec3.copy(this.position, position);
        Vec3.copy(this.target, target);
        Mat4.lookAt(this.viewMatrix, this.position, this.target, UP);
        this._firstUpdate = true;
    }

    update(input, playerPos, heightOffset = 0.4, deltaTime = 1 / 60) {
        deltaTime = Math.max(deltaTime, 0.0001);
        const config = this._resolveConfig();

        this._computeLookTarget(playerPos, heightOffset);
        this._computePivot(playerPos, heightOffset);
        this._handleInput(input, config);
        this._smoothRotation(deltaTime, config);
        this._computeDesiredPosition();
        this._applyShoulderOffset(config);
        this._resolveCollision(config);
        this._resolveTerrain(config);
        this._smoothPosition(deltaTime, config);
        this._generateMatrices();
        this._debug.update(this);
    }

    _flattenConfig() {
        const t = this._cfg;
        this.config.fov = t.Projection.fov;
        this.config.near = t.Projection.near;
        this.config.far = t.Projection.far;
        this.config.aspect = t.Projection.aspect;
        this.config.headHeight = t.Orbit.headHeight;
        this.config.pivotHeight = t.Orbit.pivotHeight;
        this.config.defaultDistance = t.Orbit.defaultDistance;
        this.config.minDistance = t.Orbit.minDistance;
        this.config.maxDistance = t.Orbit.maxDistance;
        this.config.defaultPitch = t.Orbit.defaultPitch;
        this.config.defaultYaw = t.Orbit.defaultYaw;
        this.config.pitchMin = t.Orbit.pitchMin;
        this.config.pitchMax = t.Orbit.pitchMax;
        this.config.mouseSensitivity = t.Orbit.mouseSensitivity;
        this.config.collisionRadius = t.Collision.radius;
        this.config.collisionEnabled = t.Collision.enabled;
        this.config.terrainOffset = t.Terrain.offset;
        this.config.terrainEnabled = t.Terrain.enabled;
        this.config.zoomSpeed = t.Zoom.speed;
        this.config.shoulderOffsetX = t.Shoulder.offsetX;
        this.config.shoulderOffsetY = t.Shoulder.offsetY;
        this.config.rotationSmoothSpeed = t.Smoothing.rotationSmoothSpeed;
        this.config.positionSmoothSpeed = t.Smoothing.positionSmoothSpeed;
        this.config.distanceSmoothSpeed = t.Smoothing.distanceSmoothSpeed;
        this.config.debugEnabled = t.Debug.enabled;
    }

    _resolveConfig() {
        if (this._currentState) {
            const overrides = this._currentState.getConfigOverrides();
            if (Object.keys(overrides).length > 0) {
                return Object.assign({}, this.config, overrides);
            }
        }
        return this.config;
    }

    _computeLookTarget(playerPos, heightOffset) {
        Vec3.set(
            this._lookTarget,
            playerPos[0],
            playerPos[1] + this.config.headHeight * heightOffset,
            playerPos[2]
        );
    }

    _computePivot(playerPos, heightOffset) {
        Vec3.set(
            this._pivot,
            playerPos[0],
            playerPos[1] + this.config.pivotHeight * heightOffset,
            playerPos[2]
        );
    }

    _handleInput(input, config) {
        if (input.mouse.isLocked || input.mouse.buttons[0]) {
            this._yaw -= input.mouse.deltaX * config.mouseSensitivity;
            this._pitch += input.mouse.deltaY * config.mouseSensitivity;
            this._pitch = Math.max(config.pitchMin, Math.min(this._pitch, config.pitchMax));
        }

        const isShiftDown = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        if (input.mouse.wheelDelta !== 0 && isShiftDown) {
            const prev = this._distance;
            this._zoom.handleScroll(input.mouse.wheelDelta, this.config);
            this._distance = this._zoom.getTarget();
            if (this._distance !== prev) {
                this._emit('onZoomChanged', this._distance);
            }
        }
    }

    _smoothRotation(dt, config) {
        const dx = this.position[0] - this._smoothPos[0];
        const dy = this.position[1] - this._smoothPos[1];
        const dz = this.position[2] - this._smoothPos[2];
        const posChanged = dx * dx + dy * dy + dz * dz > POS_SNAP_THRESHOLD_SQ;
        this._firstUpdate = this._firstUpdate || posChanged;

        const rotT = 1 - Math.exp(-config.rotationSmoothSpeed * dt);
        const distT = 1 - Math.exp(-config.distanceSmoothSpeed * dt);

        if (this._firstUpdate) {
            this._smoothYaw = this._yaw;
            this._smoothPitch = this._pitch;
            this._smoothDistance = this._distance;
        } else {
            this._smoothYaw = lerpAngle(this._smoothYaw, this._yaw, rotT);
            this._smoothPitch = lerpAngle(this._smoothPitch, this._pitch, rotT);
            this._smoothDistance += (this._distance - this._smoothDistance) * distT;
        }
    }

    _computeDesiredPosition() {
        this._cosYaw = Math.cos(this._smoothYaw);
        this._sinYaw = Math.sin(this._smoothYaw);
        const cosPitch = Math.cos(this._smoothPitch);
        const sinPitch = Math.sin(this._smoothPitch);

        Vec3.set(
            this._desiredPos,
            this._pivot[0] + this._smoothDistance * cosPitch * this._sinYaw,
            this._pivot[1] + this._smoothDistance * sinPitch,
            this._pivot[2] + this._smoothDistance * cosPitch * this._cosYaw
        );
    }

    _applyShoulderOffset(config) {
        if (config.shoulderOffsetX !== 0 || config.shoulderOffsetY !== 0) {
            this._desiredPos[0] += this._cosYaw * config.shoulderOffsetX;
            this._desiredPos[2] -= this._sinYaw * config.shoulderOffsetX;
            this._desiredPos[1] += config.shoulderOffsetY;
        }
    }

    _resolveCollision(config) {
        if (!config.collisionEnabled) return;

        const result = this._collision.solve(
            this._pivot,
            this._desiredPos,
            config.collisionRadius
        );

        if (result.hit) {
            Vec3.copy(this._desiredPos, result.position);
            this._zoom.applyCollisionPush(result.distance);
            if (!this._lastCollisionHit) {
                this._emit('onCollisionBegin', result);
            }
        } else {
            if (this._lastCollisionHit) {
                this._emit('onCollisionEnd');
            }
        }
        this._lastCollisionHit = result.hit;
    }

    _resolveTerrain(config) {
        if (!config.terrainEnabled) return;

        const result = this._terrain.solve(this._desiredPos, config.terrainOffset);

        if (result.isBelow) {
            Vec3.copy(this._desiredPos, result.corrected);
            this._terrainYDelta = result.yDelta;
            this._emit('onTerrainCorrection', result.yDelta);
        } else {
            this._terrainYDelta = 0;
        }
    }

    _smoothPosition(dt, config) {
        const posT = 1 - Math.exp(-config.positionSmoothSpeed * dt);

        if (this._firstUpdate) {
            Vec3.copy(this._smoothPos, this._desiredPos);
            this._firstUpdate = false;
        } else {
            this._smoothPos[0] += (this._desiredPos[0] - this._smoothPos[0]) * posT;
            this._smoothPos[1] += (this._desiredPos[1] - this._smoothPos[1]) * posT;
            this._smoothPos[2] += (this._desiredPos[2] - this._smoothPos[2]) * posT;
        }

        Vec3.copy(this.position, this._smoothPos);
        Vec3.copy(this.target, this._lookTarget);
    }

    _generateMatrices() {
        Mat4.lookAt(this.viewMatrix, this.position, this.target, UP);
    }

    _updateProjection() {
        Mat4.perspective(
            this.projectionMatrix,
            this.config.fov,
            this.config.aspect,
            this.config.near,
            this.config.far
        );
    }

    _emit(eventName, ...args) {
        const handler = this._events[eventName];
        if (handler) {
            handler(...args);
        }
    }
}
