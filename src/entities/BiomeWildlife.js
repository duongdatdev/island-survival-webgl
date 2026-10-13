import { Creature, CreatureState } from './Creature.js';
import { CREATURE_BALANCE } from '../gameplay/BalanceConfig.js';

const SHAPES = { deer: [.6153, 1.906, 1.575], goat: [.5634, 1.4145, 1.575], monitor: [.7133, .3494, 2.1791] };

class BiomeAnimal extends Creature {
    constructor(gl, position, modelAsset, species) {
        const balance = CREATURE_BALANCE[species];
        super({ ...balance, modelAsset, meshScale: SHAPES[species],
            color: species === 'monitor' ? [.3, .4, .2] : [.6, .45, .3],
            fleeThreshold: species === 'monitor' ? 10 : null,
            patrolRadius: species === 'deer' ? 18 : 10,
            lootTable: [{ resourceId: 'raw_game_meat', count: species === 'deer' ? 3 : 2, chance: 1 }] });
        this.gl = gl; this.species = species;
        this.position.set(position); this._spawnPosition.set(position);
        this.collider.radius = species === 'monitor' ? .4 : .35;
        this._buildMesh(); this.updateModelMatrix();
    }

    update(deltaTime, playerPosition, terrain, ...rest) {
        super.update(deltaTime, playerPosition, terrain, ...rest);
        if (this.state === CreatureState.DEAD) return;
        // Small whole-body gait reads at a distance without requiring a skinned renderer.
        const moving = this.state !== CreatureState.IDLE && this.state !== CreatureState.ATTACK;
        this.rotation[2] = moving ? Math.sin(this.animTime * (this.species === 'monitor' ? 7 : 9)) * .025 : 0;
        this.updateModelMatrix();
    }
}

export class Deer extends BiomeAnimal { constructor(gl, position, model) { super(gl, position, model, 'deer'); } }
export class Goat extends BiomeAnimal { constructor(gl, position, model) { super(gl, position, model, 'goat'); } }
export class Monitor extends BiomeAnimal { constructor(gl, position, model) { super(gl, position, model, 'monitor'); } }
