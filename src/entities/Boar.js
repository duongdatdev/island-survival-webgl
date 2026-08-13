import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';
import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

/**
 * Boar — Hostile forest creature.
 * Approaches the player, then uses a telegraphed, dodgeable charge.
 */
export class Boar extends Creature {
    constructor(gl, position) {
        const balance = CREATURE_BALANCE.boar;
        super({
            maxHealth: balance.maxHealth,
            baseSpeed: balance.baseSpeed,
            detectionRadius: balance.detectionRadius,
            attackRange: balance.attackRange,
            attackDamage: balance.attackDamage,
            attackCooldown: balance.attackCooldown,
            color: [0.35, 0.2, 0.1],
            meshScale: [0.35, 0.25, 0.4],
            bobAmplitude: 0.04,
            bobSpeed: 4.0,
            fleeThreshold: balance.fleeThreshold,
            fleeDuration: 5.0,
            patrolRadius: 12.0,
            idleDuration: 2.0 + Math.random() * 3.0,
            lootTable: [
                { resourceId: 'raw_boar_meat', count: 2, chance: 1.0 }
            ]
        });

        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this._spawnPosition, position[0], position[1], position[2]);

        // Wind-up telegraphs the burst, then the bearing is locked so the
        // charge can be sidestepped rather than tracking like a homing missile.
        this._chargeSpeed = balance.chargeSpeed;
        this._chargeTriggerRange = balance.chargeTriggerRange;
        this._chargeWindup = balance.chargeWindup;
        this._chargeDuration = balance.chargeDuration;
        this._chargeRecovery = balance.chargeRecovery;
        this._chargeCooldownDuration = balance.chargeCooldown;
        this._chargeCooldown = 0;
        this._chargeTimer = 0;
        this._chargePhase = 'ready';
        this._chargeDir = Vec3.create(0, 0, 1);

        this._buildMesh();
        this.collider.radius = 0.35;
        this.updateModelMatrix();
    }

    /** Override chase with a wind-up → locked charge → recovery sequence. */
    _updateChase(deltaTime, distToPlayer, playerPosition) {
        if (this.health <= this.fleeThreshold) {
            this.state = CreatureState.FLEE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            this._chargePhase = 'ready';
            return;
        }

        if (this._chargeCooldown > 0) this._chargeCooldown -= deltaTime;

        if (this._chargePhase === 'windup') {
            this._chargeTimer -= deltaTime;
            const dirX = playerPosition[0] - this.position[0];
            const dirZ = playerPosition[2] - this.position[2];
            const dirLen = Math.hypot(dirX, dirZ);
            if (dirLen > 0.01) {
                this._chargeDir[0] = dirX / dirLen;
                this._chargeDir[2] = dirZ / dirLen;
                this.rotation[1] = Math.atan2(dirX, dirZ);
            }
            if (this._chargeTimer <= 0) {
                this._chargePhase = 'charging';
                this._chargeTimer = this._chargeDuration;
            }
            return;
        }

        if (this._chargePhase === 'charging') {
            this._chargeTimer -= deltaTime;
            this.position[0] += this._chargeDir[0] * this._chargeSpeed * deltaTime;
            this.position[2] += this._chargeDir[2] * this._chargeSpeed * deltaTime;

            if (this._chargeTimer <= 0 || distToPlayer <= this.attackRange) {
                this._chargePhase = 'recovery';
                this._chargeTimer = this._chargeRecovery;
            }
            return;
        }

        if (this._chargePhase === 'recovery') {
            this._chargeTimer -= deltaTime;
            if (this._chargeTimer <= 0) this._chargePhase = 'ready';
            return;
        }

        if (distToPlayer < this._chargeTriggerRange && distToPlayer > this.attackRange
            && this._chargeCooldown <= 0) {
            this._chargePhase = 'windup';
            this._chargeTimer = this._chargeWindup;
            this._chargeCooldown = this._chargeCooldownDuration;
            return;
        }

        super._updateChase(deltaTime, distToPlayer, playerPosition);
    }

    /** A landed contact always pays the recovery pause. */
    _updateAttack() {
        this._chargePhase = 'recovery';
        this._chargeTimer = this._chargeRecovery;
        this.state = CreatureState.CHASE;
        this._stateTimer = 0;
    }
}
