import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * Player Entity controlled by the keyboard relative to camera orientation
 */
export class Player extends Entity {
    constructor() {
        super();
        this.speed = 5.0; // units/sec
        this.currentSpeed = 0.0;

        // Origin at center, scale represent dimensions [width, height, depth]
        Vec3.set(this.scale, 0.8, 1.8, 0.8);
        Vec3.set(this.position, 0.0, 0.9, 0.0); // Stand on ground (height = 1.8, half = 0.9)
    }

    /**
     * Updates player positions using keyboard states and camera projections
     */
    update(deltaTime, inputManager, camera, terrain) {
        const forward = Vec3.create();
        const right = Vec3.create();
        const moveDir = Vec3.create();

        // 1. Calculate camera heading projected on horizontal XZ plane
        Vec3.subtract(forward, camera.target, camera.position);
        forward[1] = 0.0; // Flat horizontal plane
        Vec3.normalize(forward, forward);

        // 2. Calculate right vector (orthogonal to forward and UP [0, 1, 0])
        const up = Vec3.create(0.0, 1.0, 0.0);
        Vec3.cross(right, forward, up);
        Vec3.normalize(right, right);

        let isMoving = false;

        // Process WASD keyboard commands
        if (inputManager.isKeyDown('KeyW') || inputManager.isKeyDown('ArrowUp')) {
            Vec3.add(moveDir, moveDir, forward);
            isMoving = true;
        }
        if (inputManager.isKeyDown('KeyS') || inputManager.isKeyDown('ArrowDown')) {
            Vec3.subtract(moveDir, moveDir, forward);
            isMoving = true;
        }
        if (inputManager.isKeyDown('KeyA') || inputManager.isKeyDown('ArrowLeft')) {
            Vec3.subtract(moveDir, moveDir, right);
            isMoving = true;
        }
        if (inputManager.isKeyDown('KeyD') || inputManager.isKeyDown('ArrowRight')) {
            Vec3.add(moveDir, moveDir, right);
            isMoving = true;
        }

        if (isMoving) {
            Vec3.normalize(moveDir, moveDir);
            Vec3.scale(moveDir, moveDir, this.speed * deltaTime);
            
            // Apply translation displacement
            Vec3.add(this.position, this.position, moveDir);
            this.currentSpeed = this.speed;

            // Turn player model to face the movement vector on the Y-Axis (Yaw)
            // Mat4.rotateY expects the angle, computed with Math.atan2 on relative movement axes
            const targetAngle = Math.atan2(moveDir[0], moveDir[2]);
            this.rotation[1] = targetAngle;
        } else {
            this.currentSpeed = 0.0;
        }

        // Keep player bounded within a circular/square island region
        const boundaryLimit = 23.0;
        this.position[0] = Math.max(-boundaryLimit, Math.min(this.position[0], boundaryLimit));
        this.position[2] = Math.max(-boundaryLimit, Math.min(this.position[2], boundaryLimit));
        
        // Let player stand on the terrain (adjust height based on terrain height dynamically)
        if (terrain) {
            const terrainHeight = terrain.getHeight(this.position[0], this.position[2]);
            this.position[1] = terrainHeight + 0.9; // Y-Offset is half of player height (1.8 / 2)
        } else {
            this.position[1] = 0.9;
        }

        // Recompute the local model matrix transform
        this.updateModelMatrix();

        // Push metrics to debug HUD elements
        const posEl = document.getElementById('debug-pos');
        if (posEl) {
            posEl.textContent = `X: ${this.position[0].toFixed(2)}, Y: ${this.position[1].toFixed(2)}, Z: ${this.position[2].toFixed(2)}`;
        }
        
        const speedEl = document.getElementById('debug-speed');
        if (speedEl) {
            speedEl.textContent = `${this.currentSpeed.toFixed(1)} m/s`;
        }
    }
}
