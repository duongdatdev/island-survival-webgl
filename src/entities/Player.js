import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

export class Player extends Entity {
    constructor() {
        super();
        this.speed = PLAYER_BALANCE.walkSpeed;
        this.currentSpeed = 0.0;

        const PLAYER_SCALE = 0.32;
        this.scaleFactor = PLAYER_SCALE;

        Vec3.set(this.scale, 0.8 * PLAYER_SCALE, 1.8 * PLAYER_SCALE, 0.8 * PLAYER_SCALE);
        Vec3.set(this.position, 0.0, 0.9 * PLAYER_SCALE, 0.0);

        this.collider = {
            type: 'capsule',
            trigger: false,
            layer: CollisionLayers.Player,
            radius: 0.45 * PLAYER_SCALE,
            height: 1.8 * PLAYER_SCALE,
        };
    }

    update(deltaTime, inputManager, camera, terrain) {
        const forward = Vec3.create();
        const right = Vec3.create();
        const moveDir = Vec3.create();

        Vec3.subtract(forward, camera.target, camera.position);
        forward[1] = 0.0;
        Vec3.normalize(forward, forward);

        const up = Vec3.create(0.0, 1.0, 0.0);
        Vec3.cross(right, forward, up);
        Vec3.normalize(right, right);

        let moveX = 0;
        let moveZ = 0;

        if (inputManager.isKeyDown('moveForward')) moveZ += 1;
        if (inputManager.isKeyDown('moveBackward')) moveZ -= 1;
        if (inputManager.isKeyDown('moveLeft')) moveX -= 1;
        if (inputManager.isKeyDown('moveRight')) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            const targetMoveDir = Vec3.create();
            const tempF = Vec3.create();
            const tempR = Vec3.create();

            Vec3.scale(tempF, forward, moveZ);
            Vec3.scale(tempR, right, moveX);
            Vec3.add(targetMoveDir, tempF, tempR);
            Vec3.normalize(targetMoveDir, targetMoveDir);

            Vec3.scale(moveDir, targetMoveDir, this.speed * deltaTime);

            Vec3.add(this.position, this.position, moveDir);
            this.currentSpeed = this.speed;

        } else {
            this.currentSpeed = 0.0;
        }

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
        
        const PLAYER_SCALE = 0.32;
        if (terrain) {
            const terrainHeight = terrain.getHeight(this.position[0], this.position[2]);
            this.position[1] = terrainHeight + 0.9 * PLAYER_SCALE;
        } else {
            this.position[1] = 0.9 * PLAYER_SCALE;
        }

        this.updateModelMatrix();

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
