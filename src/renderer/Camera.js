import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';
import { CameraConfig } from './CameraConfig.js';
import { ExploreState } from './CameraState.js';
import { CameraCollision } from './CameraCollision.js';
import { CameraTerrain } from './CameraTerrain.js';
import { CameraDebug } from './CameraDebug.js';

const UP = Vec3.create(0, 1, 0);

export class Camera {
    constructor(fov = 70 * Math.PI / 180, aspect = 1.0, near = 0.05, far = 1000.0) {
        this.viewMatrix = Mat4.create();
        this.projectionMatrix = Mat4.create();
        this.position = Vec3.create(0, 0, 0);
        this.target = Vec3.create(0, 0, 1);

        this._cfg = new CameraConfig();
        this.config = {};
        this._flattenConfig();
        this.config.fov = fov;
        this.config.aspect = aspect;
        this.config.near = near;
        this.config.far = far;

        this._yaw = this.config.defaultYaw;
        this._pitch = this.config.defaultPitch;
        this._smoothYaw = this._yaw;
        this._smoothPitch = this._pitch;

        this._distance = 0;
        this._smoothDistance = 0;
        this._smoothPos = Vec3.create(0, 0, 0);
        this._lookTarget = Vec3.create(0, 0, 1);
        this._pivot = Vec3.create();
        this._desiredPos = Vec3.create();
        this._collision = new CameraCollision();
        this._terrain = new CameraTerrain();
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

    setFov(fovRadians) {
        if (Math.abs(this.config.fov - fovRadians) > 0.0001) {
            this.config.fov = fovRadians;
            this._updateProjection();
        }
    }

    setLookSettings(multiplier, invertY = false) {
        this.config.mouseSensitivity = this._cfg.Orbit.mouseSensitivity * multiplier;
        this.config.invertY = invertY;
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

    update(input, playerPos, eyeOffset = 0.24, deltaTime = 1 / 60, forwardOffset = 0) {
        const config = this._resolveConfig();
        this._handleInput(input, config);

        this._smoothYaw = this._yaw;
        this._smoothPitch = this._pitch;

        Vec3.set(
            this.position,
            playerPos[0] + Math.sin(this._smoothYaw) * forwardOffset,
            playerPos[1] + eyeOffset,
            playerPos[2] + Math.cos(this._smoothYaw) * forwardOffset
        );

        const cosPitch = Math.cos(this._smoothPitch);
        const dirX = Math.sin(this._smoothYaw) * cosPitch;
        const dirY = Math.sin(this._smoothPitch);
        const dirZ = Math.cos(this._smoothYaw) * cosPitch;

        Vec3.set(
            this.target,
            this.position[0] + dirX,
            this.position[1] + dirY,
            this.position[2] + dirZ
        );

        Vec3.copy(this._smoothPos, this.position);
        Vec3.copy(this._desiredPos, this.position);
        Vec3.copy(this._pivot, this.position);
        Vec3.copy(this._lookTarget, this.target);

        Mat4.lookAt(this.viewMatrix, this.position, this.target, UP);
        this._firstUpdate = false;
        this._debug.update(this);
    }

    _flattenConfig() {
        const t = this._cfg;
        this.config.fov = t.Projection.fov;
        this.config.near = t.Projection.near;
        this.config.far = t.Projection.far;
        this.config.aspect = t.Projection.aspect;
        this.config.defaultPitch = t.Orbit.defaultPitch;
        this.config.defaultYaw = t.Orbit.defaultYaw;
        this.config.pitchMin = t.Orbit.pitchMin;
        this.config.pitchMax = t.Orbit.pitchMax;
        this.config.mouseSensitivity = t.Orbit.mouseSensitivity;
        this.config.invertY = false;
        this.config.shoulderOffsetX = 0;
        this.config.shoulderOffsetY = 0;
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

    _handleInput(input, config) {
        if (!input || !input.mouse) return;
        if (input.mouse.isLocked || input.mouse.buttons[0]) {
            const pitchDirection = config.invertY ? 1 : -1;
            this._yaw -= input.mouse.deltaX * config.mouseSensitivity;
            this._pitch += input.mouse.deltaY * config.mouseSensitivity * pitchDirection;
            this._pitch = Math.max(config.pitchMin, Math.min(this._pitch, config.pitchMax));

            if (this._yaw > Math.PI) this._yaw -= Math.PI * 2;
            else if (this._yaw < -Math.PI) this._yaw += Math.PI * 2;
        }
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
        if (handler) handler(...args);
    }
}
