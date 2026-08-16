import { Creature, CreatureState } from './Creature.js';
import { Vec3 } from '../math/Vec3.js';
import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

export class Seagull extends Creature {
    constructor(gl, position, modelAsset = null) {
        super({
            maxHealth: CREATURE_BALANCE.seagull.maxHealth,
            baseSpeed: CREATURE_BALANCE.seagull.baseSpeed,
            detectionRadius: CREATURE_BALANCE.seagull.detectionRadius,
            attackRange: 0,
            attackDamage: 0,
            attackCooldown: 0,
            color: [0.9, 0.9, 0.85],
            meshScale: [0.2, 0.154, 0.172],
            modelAsset,
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

        this._circleAngle = Math.random() * Math.PI * 2;
        this._circleRadius = 5.0 + Math.random() * 10.0;
        this._circleHeight = position[1];
        this._circleCenterX = position[0] + (Math.random() - 0.5) * 10;
        this._circleCenterZ = position[2] + (Math.random() - 0.5) * 10;

        this._buildMesh();
        this.collider.radius = 0.25;
        this.collider.snapToTerrain = false;
        this.updateModelMatrix();
    }

    update(deltaTime, playerPosition, terrain) {
        if (this.state === CreatureState.DEAD) {
            this.deadTimer += deltaTime;
            this.position[1] -= deltaTime * 2.0;
            if (this.position[1] < 0.5) this.position[1] = 0.5;
            this.updateModelMatrix();
            return;
        }

        this.animTime += deltaTime;
        this._stateTimer += deltaTime;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        switch (this.state) {
            case CreatureState.IDLE:
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
                const awayX = this.position[0] - playerPosition[0];
                const awayZ = this.position[2] - playerPosition[2];
                const awayLen = Math.sqrt(awayX*awayX + awayZ*awayZ);
                if (awayLen > 0.01) {
                    this.position[0] += (awayX/awayLen) * this.baseSpeed * deltaTime;
                    this.position[2] += (awayZ/awayLen) * this.baseSpeed * deltaTime;
                }
                this.position[1] += deltaTime * 2.0;
                if (this._fleeTimer >= this._fleeDuration || distToPlayer > this.detectionRadius * 3) {
                    this.state = CreatureState.PATROL;
                    this._stateTimer = 0;
                    this.position[1] = Math.min(this.position[1], this._circleHeight + 5.0);
                    this._recenterOrbit();
                }
                break;
        }

        this.updateModelMatrix();
    }

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
        this._circleAngle = Math.atan2(this.position[2] - cz, this.position[0] - cx);
        this._circleRadius = Math.max(3.0, Math.min(15.0,
            Math.hypot(this.position[0] - cx, this.position[2] - cz)));
    }

    _circle(deltaTime) {
        const angularSpeed = this.baseSpeed / Math.max(this._circleRadius, 1.0);
        this._circleAngle += deltaTime * angularSpeed;
        this.position[0] = this._circleCenterX + Math.cos(this._circleAngle) * this._circleRadius;
        this.position[2] = this._circleCenterZ + Math.sin(this._circleAngle) * this._circleRadius;

        this.position[1] = this._circleHeight + Math.sin(this.animTime * 0.8) * 0.5;

        this.rotation[1] = this._circleAngle + Math.PI / 2;
    }

}
