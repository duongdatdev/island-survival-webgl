import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';
import { PLAYER_BALANCE } from '../gameplay/BalanceConfig.js';

export class Player extends Entity {
    constructor() {
        super();
        this.speed = PLAYER_BALANCE.walkSpeed;
        this.currentSpeed = 0.0;
        this.velocity = Vec3.create();
        this.grounded = true;

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
            snapToTerrain: false,
        };
    }

    // Sweep in small increments so sprinting/slow frames cannot skip a cliff face.
    constrainTerrainMovement(previous, terrain) {
        if (!terrain) return;
        const radius = this.collider.radius, half = this.collider.height / 2;
        const stepHeight = PLAYER_BALANCE.maxStepHeight * this.scaleFactor;
        const slopeLimit = Math.tan(PLAYER_BALANCE.maxSlopeDegrees * Math.PI / 180);
        const distance = Math.hypot(this.position[0] - previous[0], this.position[2] - previous[2]);
        const steps = Math.max(1, Math.ceil(distance / (radius * 0.5)));
        const dx = (this.position[0] - previous[0]) / steps, dz = (this.position[2] - previous[2]) / steps;
        let x = previous[0], z = previous[2], feet = previous[1] - half;
        const probe = Math.max(0.005, 0.03 * this.scaleFactor);
        const contact = (nx, nz, sx, sz) => {
            const ground = terrain.getHeight(nx, nz), length = Math.hypot(sx, sz);
            if (length < 1e-9) return null;
            let gx = (terrain.getHeight(nx + probe, nz) - terrain.getHeight(nx - probe, nz)) / (2 * probe);
            let gz = (terrain.getHeight(nx, nz + probe) - terrain.getHeight(nx, nz - probe)) / (2 * probe);
            const localSlope = Math.hypot(gx, gz);
            if (localSlope < 1e-6) {
                gx = (terrain.getHeight(nx + radius, nz) - terrain.getHeight(nx - radius, nz)) / (2 * radius);
                gz = (terrain.getHeight(nx, nz + radius) - terrain.getHeight(nx, nz - radius)) / (2 * radius);
            }
            const ahead = terrain.getHeight(nx + sx / length * radius, nz + sz / length * radius);
            const beyond = terrain.getHeight(nx + sx / length * (radius + probe), nz + sz / length * (radius + probe));
            const canStep = ahead > feet && ahead <= feet + stepHeight + 1e-5 && Math.abs(beyond - ahead) / probe <= slopeLimit;
            const uphill = ground > terrain.getHeight(x, z) + 1e-6;
            if (Math.max(ground, ahead) > feet + stepHeight + 1e-5 ||
                (uphill && ground >= feet - PLAYER_BALANCE.groundSnapDistance * this.scaleFactor &&
                    !canStep && localSlope > slopeLimit && gx * sx + gz * sz > 1e-6)) {
                const gradient = Math.hypot(gx, gz);
                return gradient > 1e-6 && gx * sx + gz * sz > 0
                    ? [gx / gradient, gz / gradient] : [sx / length, sz / length];
            }
            return null;
        };
        for (let i = 0; i < steps; i++) {
            let sx = dx, sz = dz;
            const normal = contact(x + sx, z + sz, sx, sz);
            if (normal) {
                const into = sx * normal[0] + sz * normal[1];
                sx -= normal[0] * into; sz -= normal[1] * into;
                const speedInto = this.velocity[0] * normal[0] + this.velocity[2] * normal[1];
                if (speedInto > 0) {
                    this.velocity[0] -= normal[0] * speedInto;
                    this.velocity[2] -= normal[1] * speedInto;
                }
                if (contact(x + sx, z + sz, sx, sz)) { sx = 0; sz = 0; }
            }
            x += sx; z += sz;
            // Only reachable support may raise the sweep's feet; drops never teleport them down.
            feet = Math.max(feet, terrain.getHeight(x, z));
        }
        this.position[0] = x; this.position[2] = z;
    }

    update(deltaTime, inputManager, camera, terrain, modelCollision = null) {
        const previous = Array.from(this.position);
        if (this.grounded && this.speed > 0 && inputManager.isKeyPressed?.('jump')) {
            this.velocity[1] = Math.sqrt(2 * PLAYER_BALANCE.gravity * PLAYER_BALANCE.jumpHeight * this.scaleFactor);
            this.grounded = false;
        }
        const forward = Vec3.create();
        const right = Vec3.create();

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

        let targetVelocityX = 0;
        let targetVelocityZ = 0;
        const hasMovementInput = moveX !== 0 || moveZ !== 0;

        if (hasMovementInput && this.speed > 0) {
            const targetMoveDir = Vec3.create();
            const tempF = Vec3.create();
            const tempR = Vec3.create();

            Vec3.scale(tempF, forward, moveZ);
            Vec3.scale(tempR, right, moveX);
            Vec3.add(targetMoveDir, tempF, tempR);
            Vec3.normalize(targetMoveDir, targetMoveDir);

            targetVelocityX = targetMoveDir[0] * this.speed;
            targetVelocityZ = targetMoveDir[2] * this.speed;
        }

        const acceleration = hasMovementInput && this.speed > 0
            ? PLAYER_BALANCE.groundAcceleration
            : PLAYER_BALANCE.groundDeceleration;
        const velocityDeltaX = targetVelocityX - this.velocity[0];
        const velocityDeltaZ = targetVelocityZ - this.velocity[2];
        const velocityDeltaLength = Math.hypot(velocityDeltaX, velocityDeltaZ);
        const maxVelocityChange = acceleration * deltaTime;
        if (velocityDeltaLength <= maxVelocityChange || velocityDeltaLength < 0.0001) {
            this.velocity[0] = targetVelocityX;
            this.velocity[2] = targetVelocityZ;
        } else {
            const velocityScale = maxVelocityChange / velocityDeltaLength;
            this.velocity[0] += velocityDeltaX * velocityScale;
            this.velocity[2] += velocityDeltaZ * velocityScale;
        }

        this.position[0] += this.velocity[0] * deltaTime;
        this.position[2] += this.velocity[2] * deltaTime;
        this.constrainTerrainMovement(previous, terrain);
        this.currentSpeed = Math.hypot(this.velocity[0], this.velocity[2]);

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
            const normalX = px / dist;
            const normalZ = pz / dist;
            const outwardSpeed = this.velocity[0] * normalX + this.velocity[2] * normalZ;
            if (outwardSpeed > 0) {
                this.velocity[0] -= normalX * outwardSpeed;
                this.velocity[2] -= normalZ * outwardSpeed;
                this.currentSpeed = Math.hypot(this.velocity[0], this.velocity[2]);
            }
        }
        
        const terrainHeight = terrain?.getHeight(this.position[0], this.position[2]) ?? 0;
        const half = this.collider.height / 2;
        const snap = PLAYER_BALANCE.groundSnapDistance * this.scaleFactor;
        const support = modelCollision && terrainHeight >= -0.4
            ? modelCollision.groundHeight(this.position, terrainHeight, snap, half, this.collider.radius)
            : terrainHeight;
        const floor = support + half;
        const step = PLAYER_BALANCE.maxStepHeight * this.scaleFactor;
        if (this.velocity[1] <= 0 && floor >= this.position[1] - snap && floor <= this.position[1] + step + 1e-5) {
            this.position[1] = floor;
            this.velocity[1] = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
            // Integrate falling in bounded time steps for stable landings after a slow frame.
            let remaining = deltaTime;
            while (remaining > 1e-8) {
                const dt = Math.min(remaining, 1 / 60);
                this.velocity[1] = Math.max(-PLAYER_BALANCE.terminalFallSpeed, this.velocity[1] - PLAYER_BALANCE.gravity * dt);
                this.position[1] += this.velocity[1] * dt;
                remaining -= dt;
                if (this.velocity[1] <= 0 && this.position[1] <= floor) {
                    this.position[1] = floor; this.velocity[1] = 0; this.grounded = true; break;
                }
            }
        }

        this.updateModelMatrix();

        const posEl = globalThis.document?.getElementById('debug-pos');
        if (posEl) {
            posEl.textContent = `X: ${this.position[0].toFixed(2)}, Y: ${this.position[1].toFixed(2)}, Z: ${this.position[2].toFixed(2)}`;
        }
        
        const speedEl = globalThis.document?.getElementById('debug-speed');
        if (speedEl) {
            speedEl.textContent = `${this.currentSpeed.toFixed(1)} m/s`;
        }
    }
}
