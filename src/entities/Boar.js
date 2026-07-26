import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * Boar — Hostile forest creature.
 * Charges at the player when detected, deals melee damage, drops raw boar meat.
 */
export class Boar extends Creature {
    constructor(gl, position) {
        super({
            // v0.5 balance: 60 HP / 15 dmg with a 12u leash outran and
            // out-traded the player (3.2 m/s, 100 HP, no regen).
            maxHealth: 45,
            baseSpeed: 2.8,
            detectionRadius: 7.0,
            attackRange: 1.8,
            attackDamage: 12,
            attackCooldown: 2.0,
            color: [0.35, 0.2, 0.1],
            meshScale: [0.35, 0.25, 0.4],
            bobAmplitude: 0.04,
            bobSpeed: 4.0,
            fleeThreshold: 15, // Flee when HP <= 15
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

        // Charge mechanic (6.0 leaves the player room to sidestep)
        this._chargeSpeed = 6.0;
        this._chargeDuration = 0.6;
        this._chargeCooldown = 0;
        this._chargeTimer = 0;
        this._isCharging = false;

        this._buildMesh();
        this.collider.radius = 0.35;
        this.updateModelMatrix();
    }

    /**
     * Override chase with charge burst
     */
    _updateChase(deltaTime, distToPlayer, playerPosition) {
        // Flee check
        if (this.health <= this.fleeThreshold) {
            this.state = CreatureState.FLEE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            this._isCharging = false;
            return;
        }

        // Initiate charge when moderately close (rate-limited so the boar
        // can't chain-charge — Math.random() alone re-rolled every frame)
        if (this._chargeCooldown > 0) this._chargeCooldown -= deltaTime;
        if (distToPlayer < 5.5 && distToPlayer > this.attackRange &&
            !this._isCharging && this._chargeCooldown <= 0 && Math.random() < 0.02) {
            this._isCharging = true;
            this._chargeTimer = this._chargeDuration;
            this._chargeCooldown = 3.0;
        }

        // Charge movement
        if (this._isCharging) {
            this._chargeTimer -= deltaTime;
            const dirX = playerPosition[0] - this.position[0];
            const dirZ = playerPosition[2] - this.position[2];
            const dirLen = Math.sqrt(dirX*dirX + dirZ*dirZ);
            if (dirLen > 0.01) {
                this.position[0] += (dirX/dirLen) * this._chargeSpeed * deltaTime;
                this.position[2] += (dirZ/dirLen) * this._chargeSpeed * deltaTime;
                this.rotation[1] = Math.atan2(dirX, dirZ);
            }

            // Stop charging after timer or hitting player
            if (this._chargeTimer <= 0) {
                this._isCharging = false;
            }

            // Attack on contact — GameScene arms the cooldown when it applies
            // the damage; doing it here swallowed the hit.
            if (distToPlayer <= this.attackRange) {
                this._isCharging = false;
            }
        } else {
            // Normal chase movement
            super._updateChase(deltaTime, distToPlayer, playerPosition);
        }
    }

    /**
     * Override attack — reset charge state
     */
    _updateAttack(deltaTime, distToPlayer, playerPosition) {
        this._isCharging = false;
        this.state = CreatureState.CHASE;
        this._stateTimer = 0;
    }
}
