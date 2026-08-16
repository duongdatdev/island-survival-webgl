import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';
import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

export class Crab extends Creature {
    constructor(gl, position, modelAsset = null) {
        super({
            maxHealth: CREATURE_BALANCE.crab.maxHealth,
            baseSpeed: CREATURE_BALANCE.crab.baseSpeed,
            detectionRadius: CREATURE_BALANCE.crab.detectionRadius,
            fleeSpeedMultiplier: CREATURE_BALANCE.crab.fleeSpeedMultiplier,
            attackRange: 0,
            attackDamage: 0,
            attackCooldown: 0,
            color: [0.85, 0.3, 0.15],
            meshScale: [0.531, 0.315, 0.288],
            modelAsset,
            bobAmplitude: 0.02,
            bobSpeed: 5.0,
            fleeThreshold: null,
            fleeDuration: 3.0,
            patrolRadius: 5.0,
            idleDuration: 1.5 + Math.random() * 2.0,
            lootTable: [
                { resourceId: 'raw_crab_meat', count: 1, chance: 1.0 }
            ]
        });

        this.gl = gl;
        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this._spawnPosition, position[0], position[1], position[2]);

        this._buildMesh();
        this.updateModelMatrix();
    }

    _updatePatrol(deltaTime, distToPlayer) {
        if (distToPlayer < this.detectionRadius) {
            this.state = CreatureState.FLEE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            return;
        }

        const scuttleAngle = Math.sin(this.animTime * 2.0) * 0.5;
        this._targetDir[0] = Math.cos(scuttleAngle);
        this._targetDir[2] = Math.sin(scuttleAngle);

        this.position[0] += this._targetDir[0] * this.baseSpeed * 0.3 * deltaTime;
        this.position[2] += this._targetDir[2] * this.baseSpeed * 0.3 * deltaTime;
        this.rotation[1] = scuttleAngle + Math.PI / 2;

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

        if (this._stateTimer > 6.0) {
            this.state = CreatureState.IDLE;
            this._stateTimer = 0;
        }
    }
}
