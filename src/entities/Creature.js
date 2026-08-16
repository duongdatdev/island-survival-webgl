import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { Mesh } from '../renderer/Mesh.js';
import { CollisionLayers } from '../systems/CollisionLayers.js';

export const CreatureState = {
    IDLE:   'idle',
    PATROL: 'patrol',
    CHASE:  'chase',
    ATTACK: 'attack',
    FLEE:   'flee',
    DEAD:   'dead'
};

export class Creature extends Entity {
    constructor(opts = {}) {
        super();

        this.maxHealth = opts.maxHealth ?? 30;
        this.health = this.maxHealth;
        this.baseSpeed = opts.baseSpeed ?? 2.0;
        this.speed = this.baseSpeed;
        this.detectionRadius = opts.detectionRadius ?? 8.0;
        this.attackRange = opts.attackRange ?? 2.0;
        this.attackDamage = opts.attackDamage ?? 5;
        this.attackCooldown = opts.attackCooldown ?? 1.0;
        this._attackTimer = 0;

        this.state = CreatureState.IDLE;
        this._stateTimer = 0;
        this._idleDuration = opts.idleDuration ?? (2 + Math.random() * 3);
        this._patrolRadius = opts.patrolRadius ?? 8.0;
        this._spawnPosition = Vec3.create(this.position[0], this.position[1], this.position[2]);
        this._targetDir = Vec3.create(1, 0, 0);
        this._fleeTimer = 0;
        this._fleeDuration = opts.fleeDuration ?? 4.0;
        this.fleeSpeedMultiplier = opts.fleeSpeedMultiplier ?? 1.3;

        this.fleeThreshold = opts.fleeThreshold !== undefined ? opts.fleeThreshold : null;

        this.color = opts.color ?? [0.5, 0.5, 0.5];
        this.meshScale = opts.meshScale ?? [0.3, 0.3, 0.3];
        this.modelAsset = opts.modelAsset ?? null;
        if (this.modelAsset) {
            Vec3.set(this.scale, 1, 1, 1);
        } else {
            Vec3.set(this.scale, this.meshScale[0], this.meshScale[1], this.meshScale[2]);
        }

        this.deadTimer = 0;
        this.deadDuration = opts.deadDuration ?? 8.0;
        this.lootTable = opts.lootTable ?? [];
        this.onDeath = null;

        this.collider = {
            type: 'sphere',
            trigger: false,
            layer: CollisionLayers.Creature,
            radius: Math.max(this.meshScale[0], this.meshScale[2]) * 0.6,
            height: Math.max(this.meshScale[1], 0.2),
            snapToTerrain: true,
        };

        this.animTime = Math.random() * Math.PI * 2;
        this.bobAmplitude = opts.bobAmplitude ?? 0.03;
        this.bobSpeed = opts.bobSpeed ?? 3.0;

        this.updateModelMatrix();
    }

    _buildMesh() {
        if (!this.gl || this.modelAsset) return;
        const [r, g, b] = this.color;
        this.mesh = new Mesh(this.gl, this._createCubeData(r, g, b));
    }

    update(deltaTime, playerPosition, terrain, playerTerrainHeight) {
        if (this.state === CreatureState.DEAD) {
            this.deadTimer += deltaTime;
            return;
        }

        this.animTime += deltaTime;
        this._stateTimer += deltaTime;
        if (this._attackTimer > 0) this._attackTimer -= deltaTime;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        switch (this.state) {
            case CreatureState.IDLE:
                this._updateIdle(deltaTime, distToPlayer);
                break;
            case CreatureState.PATROL:
                this._updatePatrol(deltaTime, distToPlayer);
                break;
            case CreatureState.CHASE:
                this._updateChase(deltaTime, distToPlayer, playerPosition);
                break;
            case CreatureState.ATTACK:
                this._updateAttack(deltaTime, distToPlayer, playerPosition);
                break;
            case CreatureState.FLEE:
                this._updateFlee(deltaTime, distToPlayer, playerPosition);
                break;
        }

        if (terrain && this.state !== CreatureState.DEAD) {
            const h = terrain.getHeight(this.position[0], this.position[2]);
            if (h > -0.5) {
                this.position[1] = h + this.meshScale[1] * 0.5;
            }
        }

        this.updateModelMatrix();
    }

    _updateIdle(deltaTime, distToPlayer) {
        if (distToPlayer < this.detectionRadius) {
            this.state = this._shouldFleeOnDetection() ? CreatureState.FLEE : CreatureState.CHASE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            return;
        }

        if (this._stateTimer >= this._idleDuration) {
            this.state = CreatureState.PATROL;
            this._stateTimer = 0;
            const angle = Math.random() * Math.PI * 2;
            this._targetDir[0] = Math.cos(angle);
            this._targetDir[2] = Math.sin(angle);
        }
    }

    _updatePatrol(deltaTime, distToPlayer) {
        if (distToPlayer < this.detectionRadius) {
            this.state = this._shouldFleeOnDetection() ? CreatureState.FLEE : CreatureState.CHASE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            return;
        }

        this.position[0] += this._targetDir[0] * this.baseSpeed * 0.5 * deltaTime;
        this.position[2] += this._targetDir[2] * this.baseSpeed * 0.5 * deltaTime;

        this.rotation[1] = Math.atan2(this._targetDir[0], this._targetDir[2]);

        const distFromSpawn = Vec3.distance(this.position, this._spawnPosition);
        if (distFromSpawn > this._patrolRadius) {
            const toSpawn = [
                this._spawnPosition[0] - this.position[0],
                0,
                this._spawnPosition[2] - this.position[2]
            ];
            const len = Math.sqrt(toSpawn[0] * toSpawn[0] + toSpawn[2] * toSpawn[2]);
            if (len > 0.01) {
                this._targetDir[0] = toSpawn[0] / len;
                this._targetDir[2] = toSpawn[2] / len;
            }
        }

        if (Math.random() < 0.02) {
            const angle = Math.random() * Math.PI * 2;
            this._targetDir[0] = Math.cos(angle);
            this._targetDir[2] = Math.sin(angle);
        }

        if (this._stateTimer > 8.0) {
            this.state = CreatureState.IDLE;
            this._stateTimer = 0;
        }
    }

    _updateChase(deltaTime, distToPlayer, playerPosition) {
        if (this.fleeThreshold !== null && this.health <= this.fleeThreshold) {
            this.state = CreatureState.FLEE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
            return;
        }

        if (distToPlayer <= this.attackRange && this._attackTimer <= 0) {
            this.state = CreatureState.ATTACK;
            this._stateTimer = 0;
            return;
        }

        if (distToPlayer > this.attackRange * 0.8) {
            const dirX = playerPosition[0] - this.position[0];
            const dirZ = playerPosition[2] - this.position[2];
            const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
            if (dirLen > 0.01) {
                this.position[0] += (dirX / dirLen) * this.speed * deltaTime;
                this.position[2] += (dirZ / dirLen) * this.speed * deltaTime;
                this.rotation[1] = Math.atan2(dirX, dirZ);
            }
        }

        if (distToPlayer > this.detectionRadius * 2.0) {
            this.state = CreatureState.PATROL;
            this._stateTimer = 0;
        }
    }

    _updateAttack(deltaTime, distToPlayer, playerPosition) {
        this.state = CreatureState.CHASE;
        this._stateTimer = 0;
    }

    _updateFlee(deltaTime, distToPlayer, playerPosition) {
        this._fleeTimer += deltaTime;

        const awayX = this.position[0] - playerPosition[0];
        const awayZ = this.position[2] - playerPosition[2];
        const awayLen = Math.sqrt(awayX * awayX + awayZ * awayZ);
        if (awayLen > 0.01) {
            this.position[0] += (awayX / awayLen) * this.baseSpeed * this.fleeSpeedMultiplier * deltaTime;
            this.position[2] += (awayZ / awayLen) * this.baseSpeed * this.fleeSpeedMultiplier * deltaTime;
            this.rotation[1] = Math.atan2(awayX, awayZ);
        }

        if (this._fleeTimer >= this._fleeDuration || distToPlayer > this.detectionRadius * 3.0) {
            this.state = CreatureState.PATROL;
            this._stateTimer = 0;
        }
    }

    _shouldFleeOnDetection() {
        return this.fleeThreshold === null;
    }

    takeDamage(amount) {
        if (this.state === CreatureState.DEAD) return;
        this.health -= amount;

        if (this.health <= 0) {
            this.health = 0;
            this.die();
        } else if (this._shouldFleeOnDetection() || this.health <= this.fleeThreshold) {
            this.state = CreatureState.FLEE;
            this._stateTimer = 0;
            this._fleeTimer = 0;
        } else {
            if (this.state === CreatureState.IDLE || this.state === CreatureState.PATROL) {
                this.state = CreatureState.CHASE;
                this._stateTimer = 0;
            }
        }
    }

    die() {
        this.state = CreatureState.DEAD;
        this.deadTimer = 0;

        this.collider.type = 'none';

        if (this.onDeath) {
            this.onDeath(this.lootTable, [this.position[0], this.position[1], this.position[2]]);
        }
    }

    isReadyForCleanup() {
        return this.state === CreatureState.DEAD && this.deadTimer >= this.deadDuration;
    }

    getOpacity() {
        if (this.state !== CreatureState.DEAD) return 1.0;
        const t = this.deadTimer / this.deadDuration;
        return Math.max(0, 1.0 - t);
    }

    canDamagePlayer() {
        if (this.state === CreatureState.DEAD) return false;
        if (this._attackTimer > 0) return false;
        this._attackTimer = this.attackCooldown;
        return true;
    }

    draw(shaderProgram, drawMode) {
        if (this.state === CreatureState.DEAD && this.deadTimer > this.deadDuration * 0.5) return;
        if (this.modelAsset) {
            this.modelAsset.draw(shaderProgram, this.modelMatrix, drawMode);
            return;
        }
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
    }

    delete() {
        if (this.mesh) {
            this.mesh.delete();
            this.mesh = null;
        }
        this.modelAsset = null;
    }

    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
            -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,  0.5,-0.5,-0.5,
            -0.5, 0.5,-0.5, -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
            -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
             0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,  0.5,-0.5, 0.5,
            -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
        ]);
        const normals = new Float32Array([
             0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
             0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1,
             0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
             0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0,
             1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
            -1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,
        ]);
        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i*4]=r; colors[i*4+1]=g; colors[i*4+2]=b; colors[i*4+3]=1.0;
        }
        const texCoords = new Float32Array([
            0,0,1,0,1,1,0,1, 1,0,1,1,0,1,0,0, 0,1,0,0,1,0,1,1,
            1,1,0,1,0,0,1,0, 1,0,1,1,0,1,0,0, 0,0,1,0,1,1,0,1,
        ]);
        const indices = new Uint16Array([
            0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
            12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23
        ]);
        return { positions, normals, colors, texCoords, indices };
    }
}
