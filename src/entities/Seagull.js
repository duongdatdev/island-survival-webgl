import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * Seagull — Passive sky creature.
 * Circles above the island, flees when approached, drops raw seagull meat.
 */
export class Seagull extends Creature {
    constructor(gl, position) {
        super({
            maxHealth: 15,
            baseSpeed: 4.0,
            detectionRadius: 6.0,
            attackRange: 0,
            attackDamage: 0,
            attackCooldown: 0,
            color: [0.9, 0.9, 0.85],
            meshScale: [0.2, 0.06, 0.15],
            bobAmplitude: 0.1,
            bobSpeed: 2.0,
            fleeThreshold: null,
            fleeDuration: 5.0,
            patrolRadius: 15.0,
            idleDuration: 1.0 + Math.random() * 2.0,
            lootTable: [
                { resourceId: 'raw_seagull_meat', count: 1, chance: 1.0 }
            ]
        });

        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this._spawnPosition, position[0], position[1], position[2]);

        // Circle parameters. The orbit centre is kept as two scalars rather than
        // an array: it is an (x, z) pair, and storing it array-style invited
        // indexing it like a Vec3 — reading [2] for Z yielded undefined and
        // pushed the whole bird to NaN.
        this._circleAngle = Math.random() * Math.PI * 2;
        this._circleRadius = 5.0 + Math.random() * 10.0;
        this._circleHeight = position[1];
        this._circleCenterX = position[0] + (Math.random() - 0.5) * 10;
        this._circleCenterZ = position[2] + (Math.random() - 0.5) * 10;

        this._buildMesh();
        this.collider.radius = 0.25;
        // Seagulls fly — the collision pass must not drag them to ground level
        this.collider.snapToTerrain = false;
        this.updateModelMatrix();
    }

    /**
     * Override update to handle 3D movement (flying)
     */
    update(deltaTime, playerPosition, terrain) {
        if (this.state === CreatureState.DEAD) {
            this.deadTimer += deltaTime;
            // Dead gull falls to ground
            this.position[1] -= deltaTime * 2.0;
            if (this.position[1] < 0.5) this.position[1] = 0.5;
            this.updateModelMatrix();
            return;
        }

        this.animTime += deltaTime;
        this._stateTimer += deltaTime;

        // Check distance to player
        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        switch (this.state) {
            case CreatureState.IDLE:
                // Circling IS idle for seagulls — just orbit
                this._circle(deltaTime);
                if (distToPlayer < this.detectionRadius) {
                    this.state = CreatureState.FLEE;
                    this._stateTimer = 0;
                    this._fleeTimer = 0;
                }
                break;

            case CreatureState.PATROL:
                this._circle(deltaTime);
                if (distToPlayer < this.detectionRadius) {
                    this.state = CreatureState.FLEE;
                    this._stateTimer = 0;
                    this._fleeTimer = 0;
                }
                if (this._stateTimer > 10.0) {
                    this.state = CreatureState.IDLE;
                    this._stateTimer = 0;
                }
                break;

            case CreatureState.FLEE:
                this._fleeTimer += deltaTime;
                // Fly away and up
                const awayX = this.position[0] - playerPosition[0];
                const awayZ = this.position[2] - playerPosition[2];
                const awayLen = Math.sqrt(awayX*awayX + awayZ*awayZ);
                if (awayLen > 0.01) {
                    this.position[0] += (awayX/awayLen) * this.baseSpeed * deltaTime;
                    this.position[2] += (awayZ/awayLen) * this.baseSpeed * deltaTime;
                }
                this.position[1] += deltaTime * 2.0; // Fly higher
                if (this._fleeTimer >= this._fleeDuration || distToPlayer > this.detectionRadius * 3) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                    // Reset to a sensible height
                    this.position[1] = Math.min(this.position[1], this._circleHeight + 5.0);
                    // Re-anchor the orbit where the bird actually ended up, so
                    // it doesn't teleport back to its old circle on the next
                    // frame. Kept inside the island so gulls stay on-screen.
                    this._recenterOrbit();
                }
                break;
        }

        // Face movement direction
        this.updateModelMatrix();
    }

    /**
     * Re-anchor the orbit at the bird's current spot, clamped near the island
     * so it doesn't end up circling far out over open ocean.
     */
    _recenterOrbit(maxRadius = 30.0) {
        let cx = this.position[0];
        let cz = this.position[2];
        const dist = Math.sqrt(cx * cx + cz * cz);
        if (dist > maxRadius && dist > 0.0001) {
            const scale = maxRadius / dist;
            cx *= scale;
            cz *= scale;
        }
        this._circleCenterX = cx;
        this._circleCenterZ = cz;
        // Continue the orbit from the current bearing to avoid a visible jump
        this._circleAngle = Math.atan2(this.position[2] - cz, this.position[0] - cx);
        this._circleRadius = Math.max(3.0, Math.min(15.0,
            Math.hypot(this.position[0] - cx, this.position[2] - cz)));
    }

    /**
     * Circular orbiting movement
     */
    _circle(deltaTime) {
        this._circleAngle += deltaTime * 0.5;
        this.position[0] = this._circleCenterX + Math.cos(this._circleAngle) * this._circleRadius;
        this.position[2] = this._circleCenterZ + Math.sin(this._circleAngle) * this._circleRadius;

        // Gentle bobbing
        this.position[1] = this._circleHeight + Math.sin(this.animTime * 0.8) * 0.5;

        // Face direction of movement
        this.rotation[1] = this._circleAngle + Math.PI / 2;
    }

}
