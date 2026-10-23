import { PRNG } from '../gameplay/world/PRNG.js';
import { Crab } from '../entities/Crab.js';
import { Boar } from '../entities/Boar.js';
import { Seagull } from '../entities/Seagull.js';
import { Shark } from '../entities/Shark.js';
import { Deer, Goat, Monitor } from '../entities/BiomeWildlife.js';
import { CreatureState } from '../entities/Creature.js';
import { WILDLIFE_COUNTS, MAX_WILDLIFE_POPULATION as MAX_POPULATION, assertWildlifeSnapshot } from './WildlifeSnapshot.js';
export { WILDLIFE_COUNTS, assertWildlifeSnapshot } from './WildlifeSnapshot.js';

const SPECIES = { crab: Crab, seagull: Seagull, boar: Boar, shark: Shark, deer: Deer, goat: Goat, monitor: Monitor };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function campaignAnimalSpawns(world) {
    const random = new PRNG('campaign-wildlife:' + world.seed), generator = world.terrainGenerator;
    const result = [], radius = generator.island.radius;
    for (const [species, count] of Object.entries(WILDLIFE_COUNTS)) {
        if (world.generatorVersion < 3 && ['deer', 'goat', 'monitor'].includes(species)) continue;
        for (let index = 0; index < count; index++) {
            for (let attempt = 0; attempt < 2000; attempt++) {
                let angle = random.nextRange(-Math.PI, Math.PI);
                if (!index && !attempt && species === 'crab') angle = Math.atan2(world.spawnPosition[2], world.spawnPosition[0]) + 0.035;
                if (!index && !attempt && species === 'shark') {
                    const wreck = world.pois.find(p => p.id === 'offshore_wreck').position;
                    angle = Math.atan2(wreck[2], wreck[0]) + 0.03;
                }
                const r = species === 'crab' ? radius - random.nextRange(4, 18)
                    : species === 'shark' ? radius + random.nextRange(10, 20) : random.nextRange(30, radius - 35);
                const x = Math.cos(angle) * r, z = Math.sin(angle) * r, height = generator.getHeight(x, z);
                if (species === 'crab' && (height < 0.15 || height > 0.35)) continue;
                if (species === 'shark' && height > -0.5) continue;
                const position = [x, species === 'shark' ? 0.1 : species === 'seagull' ? height + 10 : height, z];
                if (species === 'boar' && (generator.getBiome(x, z, height) !== 'Forest' || height < 0.3
                    || distance(position, world.spawnPosition) < 25
                    || world.pois.some(p => distance(p.position, position) < p.radius + 12))) continue;
                if (['deer', 'goat', 'monitor'].includes(species)) {
                    const habitats = { deer: ['Grassland', 'Savanna'], goat: ['Highland', 'RockArea'], monitor: ['Jungle', 'Mangrove'] };
                    if (!habitats[species].includes(generator.getBiome(x, z, height)) || height < .4
                        || generator.getNormal(x, z)[1] < .8 || generator._reserved(x, z)
                        || distance(position, world.spawnPosition) < 35
                        || world.pois.some(p => distance(p.position, position) < p.radius + 12)) continue;
                }
                if (result.some(p => p.species === species && distance(p.position, position) < 14)) continue;
                result.push({ id: `${species}-${index}`, species, position }); break;
            }
        }
    }
    return result;
}

/** Campaign owns population persistence and terrain/model navigation; Classic AI stays unchanged. */
export class CampaignWildlife {
    constructor(scene) {
        this.scene = scene; this.killed = new Set(); this.species = new Map();
        const random = new PRNG('campaign-wildlife-orbits:' + scene.world.seed);
        for (const spawn of campaignAnimalSpawns(scene.world)) {
            const animal = new SPECIES[spawn.species](scene.gl, spawn.position, scene.engine.assets.getModel('creature:' + spawn.species));
            animal.campaignId = spawn.id; this.species.set(spawn.id, spawn.species);
            if (animal.navigationSurface === 'land') { animal.collider.height = animal.meshScale[1]; animal.position[1] += animal.collider.height / 2; }
            if (spawn.species === 'seagull') {
                animal._circleCenterX = spawn.position[0]; animal._circleCenterZ = spawn.position[2];
                animal._circleRadius = random.nextRange(5, 15); animal._circleAngle = random.nextRange(-Math.PI, Math.PI);
                const recenter = animal._recenterOrbit.bind(animal);
                animal._recenterOrbit = () => recenter(scene.world.terrainGenerator.island.radius - 30);
            }
            animal.onDeath = (loot, position) => {
                this.killed.add(spawn.id); scene._creatureDropLoot(loot, position); scene.campaign?.saveMilestone();
            };
            animal.updateModelMatrix(); scene.creatures.push(animal);
        }
    }

    active(animal) { return animal.state === CreatureState.DEAD || distance(animal.position, this.scene.player.position) < 100; }

    resolve(animal, previous, seconds) {
        if (animal.state === CreatureState.DEAD) return;
        const { terrain, campaign, player, collisionSystem } = this.scene, p = animal.position;
        if (animal.navigationSurface === 'water') {
            if (terrain.getHeight(p[0], p[2]) > -0.5) { p[0] = previous[0]; p[2] = previous[2]; animal.state = CreatureState.PATROL; }
            const bottom = terrain.getHeight(p[0], p[2]) + 0.25;
            const target = [CreatureState.CHASE, CreatureState.ATTACK].includes(animal.state) && player.position[1] < -0.3 ? player.position[1] : p[1];
            p[1] = Math.max(bottom, Math.min(0.4, previous[1] + Math.max(-seconds * 1.5, Math.min(seconds * 1.5, target - previous[1]))));
        }
        if (animal.navigationSurface !== 'air') {
            const before = Array.from(p);
            const collisionStart = animal.navigationSurface === 'land'
                ? campaign.collision.stepUp(p, previous, terrain, animal.collider.radius, animal.collider.height, 0.35) : previous;
            const volumeHeight = Math.max(animal.collider.height, animal.collider.radius * 2);
            campaign.collision.resolve(p, collisionStart, animal.collider.radius, volumeHeight, { vertical: animal.navigationSurface === 'water',
                floorHeight: (x, z) => terrain.getHeight(x, z) + volumeHeight / 2 });
            const correction = animal.navigationSurface === 'water' ? Math.hypot(...before.map((value, i) => value - p[i])) : distance(before, p);
            if (correction > 0.02) animal._onNavigationBlocked();
            animal.constrainToNavigationSurface(terrain);
            if (animal.navigationSurface === 'land') {
                const half = animal.collider.height / 2;
                p[1] = campaign.collision.groundHeight(p, terrain.getHeight(p[0], p[2]), 0.35, half, animal.collider.radius) + half;
            }
        } else p[1] = Math.max(p[1], terrain.getHeight(p[0], p[2]) + 6);
        animal.updateModelMatrix(); collisionSystem.refresh(animal);
    }

    canReachPlayer(animal) {
        const target = Array.from(this.scene.player.position); target[1] -= 0.3;
        return !this.scene.campaign.collision.segmentBlocked(Array.from(animal.position), target);
    }

    snapshot() {
        return { killed: [...this.killed], animals: this.scene.creatures.filter(a => a.campaignId && !this.killed.has(a.campaignId)).map(a => ({
            id: a.campaignId, position: Array.from(a.position), health: a.health, yaw: a.rotation[1],
            orbit: a instanceof Seagull ? [a._circleCenterX, a._circleCenterZ, a._circleRadius, a._circleAngle, a._circleHeight] : null,
        })) };
    }

    restore(saved) {
        if (!saved) return;
        assertWildlifeSnapshot(saved);
        if (!Array.isArray(saved.killed) || saved.killed.length > MAX_POPULATION || !Array.isArray(saved.animals) || saved.animals.length > MAX_POPULATION
            || saved.killed.some(id => !this.species.has(id))) throw new Error('Bản lưu động vật không hợp lệ.');
        const ids = new Set(saved.killed), records = new Map();
        for (const record of saved.animals) {
            const animal = this.scene.creatures.find(a => a.campaignId === record.id);
            if (!animal || ids.has(record.id) || !Array.isArray(record.position) || record.position.length !== 3
                || !record.position.every(v => Number.isFinite(v) && Math.abs(v) < 400)
                || !Number.isFinite(record.health) || record.health <= 0 || record.health > animal.maxHealth || !Number.isFinite(record.yaw)
                || record.orbit != null && (!Array.isArray(record.orbit) || record.orbit.length !== 5 || !record.orbit.every(Number.isFinite)
                    || record.orbit[2] < 3 || record.orbit[2] > 15)) throw new Error('Bản lưu động vật không hợp lệ.');
            ids.add(record.id); records.set(record.id, record);
        }
        this.killed = new Set(saved.killed);
        for (let i = this.scene.creatures.length - 1; i >= 0; i--) {
            const animal = this.scene.creatures[i], record = records.get(animal.campaignId);
            if (this.killed.has(animal.campaignId)) {
                this.scene.collisionSystem.unregister(animal); animal.delete(); this.scene.creatures.splice(i, 1); continue;
            }
            if (!record) continue;
            animal.position.set(record.position); animal.health = record.health; animal.rotation[1] = record.yaw;
            animal.state = CreatureState.IDLE; animal._onNavigationBlocked(); animal._lastNavigablePosition = null;
            if (record.orbit && animal instanceof Seagull) [animal._circleCenterX, animal._circleCenterZ, animal._circleRadius, animal._circleAngle, animal._circleHeight] = record.orbit;
            animal.updateModelMatrix(); this.scene.collisionSystem.refresh(animal);
        }
    }
}
