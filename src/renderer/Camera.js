import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

/**
 * Third-Person Orbit Camera
 */
export class Camera {
    constructor(fov = 45 * Math.PI / 180, aspect = 1.0, near = 0.1, far = 1000.0) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;

        // Spherical coordinates around target
        this.target = Vec3.create(0, 1.0, 0); // Focus slightly above origin (e.g. player height)
        this.distance = 8.0;
        this.yaw = Math.PI; // Look straight down +z axis at player initially
        this.pitch = 20 * Math.PI / 180; // Tilt down slightly

        // Constraint caps
        this.pitchMin = -50 * Math.PI / 180; // Limit looking up from ground
        this.pitchMax = 80 * Math.PI / 180;  // Limit looking straight down

        this.position = Vec3.create(0, 0, 0);
        this.viewMatrix = Mat4.create();
        this.projectionMatrix = Mat4.create();

        this.updateProjection();
    }

    updateProjection() {
        Mat4.perspective(this.projectionMatrix, this.fov, this.aspect, this.near, this.far);
    }

    setAspect(aspect) {
        if (Math.abs(this.aspect - aspect) > 0.0001) {
            this.aspect = aspect;
            this.updateProjection();
        }
    }

    /**
     * Updates the camera position and orientation matrix based on target and inputs
     */
    update(inputManager, targetPos) {
        // Track the target coordinate (e.g., character center)
        // Add 1.5 units to focus around the head height of the player
        Vec3.copy(this.target, targetPos);
        this.target[1] += 1.2;

        // Handle Scroll Wheel Zoom (Only when holding Shift)
        const isShiftDown = inputManager.isKeyDown('ShiftLeft') || inputManager.isKeyDown('ShiftRight');
        if (inputManager.mouse.wheelDelta !== 0 && isShiftDown) {
            this.distance += inputManager.mouse.wheelDelta * 0.75;
            this.distance = Math.max(2.5, Math.min(this.distance, 25.0)); // Zoom constraints
        }

        // Handle Mouse Orbit drag or locked mouse rotations
        if (inputManager.mouse.isLocked || inputManager.mouse.buttons[0]) {
            const sensitivity = 0.003;
            this.yaw -= inputManager.mouse.deltaX * sensitivity;
            this.pitch += inputManager.mouse.deltaY * sensitivity;

            // Clamping vertical orbit pitch
            this.pitch = Math.max(this.pitchMin, Math.min(this.pitch, this.pitchMax));
        }

        // Calculate Position relative to player target
        const cosPitch = Math.cos(this.pitch);
        const sinPitch = Math.sin(this.pitch);
        const cosYaw = Math.cos(this.yaw);
        const sinYaw = Math.sin(this.yaw);

        // Spherical position offset
        this.position[0] = this.target[0] + this.distance * cosPitch * sinYaw;
        this.position[1] = this.target[1] + this.distance * sinPitch;
        this.position[2] = this.target[2] + this.distance * cosPitch * cosYaw;

        // Recalculate view matrix
        const up = Vec3.create(0, 1.0, 0);
        Mat4.lookAt(this.viewMatrix, this.position, this.target, up);

        // Update Debug UI
        const yawDeg = Math.round((this.yaw * 180 / Math.PI)) % 360;
        const pitchDeg = Math.round(this.pitch * 180 / Math.PI);
        const rotEl = document.getElementById('debug-cam-rot');
        if (rotEl) {
            rotEl.textContent = `Y: ${yawDeg}°, P: ${pitchDeg}°`;
        }
        const distEl = document.getElementById('debug-cam-dist');
        if (distEl) {
            distEl.textContent = `${this.distance.toFixed(2)}m`;
        }
    }
}
