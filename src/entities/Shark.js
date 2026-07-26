import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * How far past the shelf edge a shark may roam. GameScene seeds sharks on a
 * ring out to `island.radius + 13`, so the cap has to sit beyond that or a
 * freshly spawned shark gets yanked inward on its very first frame.
 */
const OCEAN_PATROL_MARGIN = 14.0;

/** Used only when no terrain/generator is available (matches Player.js). */
const FALLBACK_OUTER_RADIUS = 46.0;

/**
 * Shark — Hostile water creature.
 * Patrols deep water, attacks if the player is swimming, drops raw fish.
 */
export class Shark extends Creature {
    constructor(gl, position) {
        super({
            // v0.5 balance: 20 dmg every 2s from a 15u detection radius was
            // an unavoidable death sentence for anyone wading offshore.
            maxHealth: 50,
            baseSpeed: 4.5,
            detectionRadius: 8.0,
            attackRange: 2.5,
            attackDamage: 15,
            attackCooldown: 2.5,
            color: [0.35, 0.38, 0.4],
            meshScale: [0.5, 0.12, 0.2],
            bobAmplitude: 0.05,
            bobSpeed: 2.0,
            fleeThreshold: 15,
            fleeDuration: 6.0,
            patrolRadius: 20.0,
            idleDuration: 2.0 + Math.random() * 3.0,
            lootTable: [
                // Sea creature → raw fish, which is already cookable at the
                // campfire. Reusing it keeps the v0.5 resource set to the three
                // meats the design doc actually lists.
                { resourceId: 'raw_fish', count: 2, chance: 1.0 }
            ]
        });

        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this._spawnPosition, position[0], position[1], position[2]);

        // Water Y level — sharks stay at this height
        this._waterLevel = position[1];

        // Fin animation
        this._finAngle = 0;

        this._buildMesh();
        this.collider.radius = 0.45;
        // Sharks live at the water surface — never snap them onto the seabed
        this.collider.snapToTerrain = false;
        this.updateModelMatrix();
    }

    /**
     * Override update to handle water-level movement
     */
    update(deltaTime, playerPosition, terrain, playerTerrainHeight) {
        if (this.state === CreatureState.DEAD) {
            this.deadTimer += deltaTime;
            this.position[1] -= deltaTime * 0.5; // Slowly sink
            this.updateModelMatrix();
            return;
        }

        this.animTime += deltaTime;
        this._stateTimer += deltaTime;
        this._finAngle += deltaTime * 3.0;
        // This override replaces Creature.update(), so tick the attack cooldown
        // here too — otherwise the shark bites once and never again.
        if (this._attackTimer > 0) this._attackTimer -= deltaTime;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        // Only aggro if player is in/near water (terrain height <= 0.3)
        const playerInWater = playerTerrainHeight !== undefined && playerTerrainHeight <= 0.3;

        switch (this.state) {
            case CreatureState.IDLE:
                this._patrolWater(deltaTime);
                if (distToPlayer < this.detectionRadius && playerInWater) {
                    this.state = CreatureState.CHASE;
                    this._stateTimer = 0;
                }
                if (this._stateTimer > this._idleDuration) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                }
                break;

            case CreatureState.PATROL:
                this._patrolWater(deltaTime);
                if (distToPlayer < this.detectionRadius && playerInWater) {
                    this.state = CreatureState.CHASE;
                    this._stateTimer = 0;
                }
                if (this._stateTimer > 8.0) {
                    this.state = CreatureState.IDLE;
                    this._stateTimer = 0;
                }
                break;

            case CreatureState.CHASE:
                if (this.health <= this.fleeThreshold) {
                    this.state = CreatureState.FLEE;
                    this._stateTimer = 0;
                    this._fleeTimer = 0;
                    break;
                }
                // In range: hold position and let GameScene land the bite
                // (it arms the cooldown via canDamagePlayer()).
                if (distToPlayer <= this.attackRange) {
                    break;
                }
                // Give up if the player made it back onto dry land
                if (!playerInWater) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                    break;
                }
                // Circle around player
                const angleToPlayer = Math.atan2(dx, dz);
                const circleOffset = 0.5;
                const targetX = playerPosition[0] + Math.cos(angleToPlayer + circleOffset) * 4.0;
                const targetZ = playerPosition[2] + Math.sin(angleToPlayer + circleOffset) * 4.0;
                const toTargetX = targetX - this.position[0];
                const toTargetZ = targetZ - this.position[2];
                const toTargetLen = Math.sqrt(toTargetX*toTargetX + toTargetZ*toTargetZ);
                if (toTargetLen > 0.1) {
                    this.position[0] += (toTargetX/toTargetLen) * this.speed * deltaTime;
                    this.position[2] += (toTargetZ/toTargetLen) * this.speed * deltaTime;
                    this.rotation[1] = Math.atan2(toTargetX, toTargetZ);
                }
                // Close in for attack
                if (distToPlayer < 6.0 && this._attackTimer <= 0) {
                    const rushX = dx / distToPlayer;
                    const rushZ = dz / distToPlayer;
                    this.position[0] += rushX * this.baseSpeed * 2.0 * deltaTime;
                    this.position[2] += rushZ * this.baseSpeed * 2.0 * deltaTime;
                }
                break;

            case CreatureState.FLEE:
                this._fleeTimer += deltaTime;
                const awayX = this.position[0] - playerPosition[0];
                const awayZ = this.position[2] - playerPosition[2];
                const awayLen = Math.sqrt(awayX*awayX + awayZ*awayZ);
                if (awayLen > 0.01) {
                    this.position[0] += (awayX/awayLen) * this.baseSpeed * 1.5 * deltaTime;
                    this.position[2] += (awayZ/awayLen) * this.baseSpeed * 1.5 * deltaTime;
                    this.rotation[1] = Math.atan2(awayX, awayZ);
                }
                if (this._fleeTimer >= this._fleeDuration || distToPlayer > this.detectionRadius * 2) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                }
                break;
        }

        // Stay at water level
        this.position[1] = this._waterLevel + Math.sin(this.animTime * 0.5) * 0.1;

        // Keep within world bounds. Derived from the generated island rather
        // than hardcoded: the radius is procedural (44–47), so a fixed 50/45
        // pair could sit either side of the player's own boundary depending on
        // the seed — on a large island it penned sharks inside the wade zone.
        const island = terrain && terrain.generator ? terrain.generator.island : null;
        const maxRadius = (island ? island.outerBeachRadius : FALLBACK_OUTER_RADIUS)
            + OCEAN_PATROL_MARGIN;
        const distFromCenter = Math.sqrt(
            this.position[0]*this.position[0] + this.position[2]*this.position[2]
        );
        if (distFromCenter > maxRadius) {
            const scale = maxRadius / distFromCenter;
            this.position[0] *= scale;
            this.position[2] *= scale;
        }

        this.updateModelMatrix();
    }

    /**
     * Patrol in a random gentle arc in water
     */
    _patrolWater(deltaTime) {
        const angle = Math.sin(this.animTime * 0.3) * 1.5;
        this.position[0] += Math.cos(angle) * this.baseSpeed * 0.4 * deltaTime;
        this.position[2] += Math.sin(angle) * this.baseSpeed * 0.4 * deltaTime;
        this.rotation[1] = angle;

        // Stay near spawn
        const distFromSpawn = Vec3.distance(this.position, this._spawnPosition);
        if (distFromSpawn > this._patrolRadius) {
            const toSpawn = [
                this._spawnPosition[0] - this.position[0],
                0,
                this._spawnPosition[2] - this.position[2]
            ];
            const len = Math.sqrt(toSpawn[0]*toSpawn[0] + toSpawn[2]*toSpawn[2]);
            if (len > 0.01) {
                this.position[0] += (toSpawn[0]/len) * this.baseSpeed * deltaTime;
                this.position[2] += (toSpawn[2]/len) * this.baseSpeed * deltaTime;
            }
        }
    }
}
