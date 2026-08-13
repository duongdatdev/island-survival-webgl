import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

/**
 * Player Entity controlled by the keyboard relative to camera orientation
 */
export class Player extends Entity {
    constructor() {
        super();
        this.speed = PLAYER_BALANCE.walkSpeed; // units/sec
        this.currentSpeed = 0.0;

        const PLAYER_SCALE = 0.32;
        this.scaleFactor = PLAYER_SCALE;

        // Origin at center, scale represent dimensions [width, height, depth]
        Vec3.set(this.scale, 0.8 * PLAYER_SCALE, 1.8 * PLAYER_SCALE, 0.8 * PLAYER_SCALE);
        Vec3.set(this.position, 0.0, 0.9 * PLAYER_SCALE, 0.0); // Stand on ground (height = 1.8, half = 0.9)

        // Player capsule collider — data-driven
        this.collider = {
            type: 'capsule',
            trigger: false,
            layer: CollisionLayers.Player,
            radius: 0.45 * PLAYER_SCALE,
            height: 1.8 * PLAYER_SCALE,
        };
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
        // With the renderer looking along +Z, screen-right is forward x up.
        Vec3.cross(right, forward, up);
        Vec3.normalize(right, right);

        let moveX = 0;
        let moveZ = 0;

        // Process WASD keyboard commands and Arrow keys
        if (inputManager.isKeyDown('KeyW') || inputManager.isKeyDown('ArrowUp')) moveZ += 1;
        if (inputManager.isKeyDown('KeyS') || inputManager.isKeyDown('ArrowDown')) moveZ -= 1;
        if (inputManager.isKeyDown('KeyA') || inputManager.isKeyDown('ArrowLeft')) moveX -= 1;
        if (inputManager.isKeyDown('KeyD') || inputManager.isKeyDown('ArrowRight')) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            const targetMoveDir = Vec3.create();
            const tempF = Vec3.create();
            const tempR = Vec3.create();

            // Calculate movement vector on horizontal plane based on camera orientation
            Vec3.scale(tempF, forward, moveZ);
            Vec3.scale(tempR, right, moveX);
            Vec3.add(targetMoveDir, tempF, tempR);
            Vec3.normalize(targetMoveDir, targetMoveDir);

            Vec3.scale(moveDir, targetMoveDir, this.speed * deltaTime);

            // Apply translation displacement
            Vec3.add(this.position, this.position, moveDir);
            this.currentSpeed = this.speed;

        } else {
            this.currentSpeed = 0.0;
        }

        // Keep the player within the walkable world. The island is procedural,
        // so derive the limit from the generated island radius (+ the underwater
        // beach shelf, so the player can wade a little) instead of a hardcoded
        // constant that only matched one seed. Falls back to a safe default when
        // no terrain/generator is available.
        let boundaryLimit = 46.0;
        const island = terrain && terrain.generator ? terrain.generator.island : null;
        if (island) {
            const shelf = island.underwaterBeachExtent || 2.5;
            boundaryLimit = island.radius + shelf;
        }
        const px = this.position[0];
        const pz = this.position[2];
        const dist = Math.sqrt(px * px + pz * pz);
        if (dist > boundaryLimit) {
            const scale = boundaryLimit / dist;
            this.position[0] = px * scale;
            this.position[2] = pz * scale;
        }
        
        // Let player stand on the terrain (adjust height based on terrain height dynamically)
        const PLAYER_SCALE = 0.32;
        if (terrain) {
            const terrainHeight = terrain.getHeight(this.position[0], this.position[2]);
            this.position[1] = terrainHeight + 0.9 * PLAYER_SCALE; // Y-Offset is half of player height (1.8 / 2)
        } else {
            this.position[1] = 0.9 * PLAYER_SCALE;
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
