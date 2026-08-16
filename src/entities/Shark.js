import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';
import { WaveField } from '../shaders/WaterWaves.js';
import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

const OCEAN_PATROL_MARGIN = 14.0;

const FALLBACK_OUTER_RADIUS = 46.0;

export class Shark extends Creature {
    constructor(gl, position, modelAsset = null) {
        const balance = CREATURE_BALANCE.shark;
        super({
            maxHealth: balance.maxHealth,
            baseSpeed: balance.baseSpeed,
            detectionRadius: balance.detectionRadius,
            attackRange: balance.attackRange,
            attackDamage: balance.attackDamage,
            attackCooldown: balance.attackCooldown,
            color: [0.35, 0.38, 0.4],
            meshScale: [0.184, 0.164, 0.5],
            modelAsset,
            bobAmplitude: 0.05,
            bobSpeed: 2.0,
            fleeThreshold: balance.fleeThreshold,
            fleeDuration: 6.0,
            patrolRadius: 20.0,
            idleDuration: 2.0 + Math.random() * 3.0,
            lootTable: [
                { resourceId: 'raw_fish', count: 2, chance: 1.0 }
            ]
        });

        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this._spawnPosition, position[0], position[1], position[2]);

        this._waterLevel = position[1];
        this._rushTriggerRange = balance.rushTriggerRange;
        this._rushSpeed = balance.rushSpeed;

        this._finAngle = 0;

        this._buildMesh();
        this.collider.radius = 0.45;
        this.collider.snapToTerrain = false;
        this.updateModelMatrix();
    }

    update(deltaTime, playerPosition, terrain, playerTerrainHeight) {
        if (this.state === CreatureState.DEAD) {
            this.deadTimer += deltaTime;
            this.position[1] -= deltaTime * 0.5;
            this.updateModelMatrix();
            return;
        }

        this.animTime += deltaTime;
        this._stateTimer += deltaTime;
        this._finAngle += deltaTime * 3.0;
        if (this._attackTimer > 0) this._attackTimer -= deltaTime;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

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
                if (distToPlayer <= this.attackRange) {
                    break;
                }
                if (!playerInWater) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                    break;
                }
                if (distToPlayer < this._rushTriggerRange && this._attackTimer <= 0
                    && distToPlayer > 0.0001) {
                    const rushX = dx / distToPlayer;
                    const rushZ = dz / distToPlayer;
                    this.position[0] += rushX * this._rushSpeed * deltaTime;
                    this.position[2] += rushZ * this._rushSpeed * deltaTime;
                    this.rotation[1] = Math.atan2(rushX, rushZ);
                } else {
                    const angleToPlayer = Math.atan2(dx, dz);
                    const circleOffset = 0.5;
                    const targetX = playerPosition[0] + Math.cos(angleToPlayer + circleOffset) * 4.0;
                    const targetZ = playerPosition[2] + Math.sin(angleToPlayer + circleOffset) * 4.0;
                    const toTargetX = targetX - this.position[0];
                    const toTargetZ = targetZ - this.position[2];
                    const toTargetLen = Math.hypot(toTargetX, toTargetZ);
                    if (toTargetLen > 0.1) {
                        this.position[0] += (toTargetX / toTargetLen) * this.speed * deltaTime;
                        this.position[2] += (toTargetZ / toTargetLen) * this.speed * deltaTime;
                        this.rotation[1] = Math.atan2(toTargetX, toTargetZ);
                    }
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

        this.position[1] = this._waterLevel
            + WaveField.heightAt(this.position[0], this.position[2]);

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

    _patrolWater(deltaTime) {
        const angle = Math.sin(this.animTime * 0.3) * 1.5;
        this.position[0] += Math.cos(angle) * this.baseSpeed * 0.4 * deltaTime;
        this.position[2] += Math.sin(angle) * this.baseSpeed * 0.4 * deltaTime;
        this.rotation[1] = angle;

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
