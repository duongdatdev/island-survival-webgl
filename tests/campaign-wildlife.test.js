import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignWildlife, campaignAnimalSpawns } from '../src/systems/CampaignWildlife.js';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { CollisionLayers } from '../src/systems/CollisionLayers.js';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { CreatureState } from '../src/entities/Creature.js';

const world = seed => new CampaignWorldGenerator().generate(seed, {}, false, { mesh: false, props: false });
function scene(seed) {
    const w = world(seed);
    const scene = { world: w, engine: { assets: { getModel: () => ({}) } }, creatures: [],
        terrain: { generator: w.terrainGenerator, getHeight: (x, z) => w.terrainGenerator.getHeight(x, z) },
        collisionSystem: new CollisionSystem({ indexed: true }), player: { position: [0, 0.9, 0] },
        campaign: { collision: new TriangleCollision(), saveMilestone() {} }, drops: 0,
        _creatureDropLoot() { this.drops++; } };
    scene.wildlife = new CampaignWildlife(scene);
    for (const animal of scene.creatures) scene.collisionSystem.register(animal, true);
    return scene;
}

test('100 seeds retain all four species on valid surfaces with safe boar spawn spacing', () => {
    for (let seed = 0; seed < 100; seed++) {
        const w = world('wildlife-' + seed), animals = campaignAnimalSpawns(w);
        assert.equal(animals.length, 36, `seed ${seed}`);
        assert.equal(new Set(animals.map(a => a.id)).size, 36);
        for (const a of animals) {
            const h = w.terrainGenerator.getHeight(a.position[0], a.position[2]);
            if (a.species === 'crab') assert.ok(h >= 0.15 && h <= 0.35);
            if (a.species === 'shark') assert.ok(h < -0.5);
            if (a.species === 'seagull') assert.ok(a.position[1] >= h + 10);
            if (a.species === 'boar') {
                assert.equal(w.biomeGenerator.getBiome(a.position[0], a.position[2], h), 'Forest');
                assert.ok(w.pois.every(p => Math.hypot(p.position[0] - a.position[0], p.position[2] - a.position[2]) >= p.radius + 12));
            }
        }
    }
    assert.deepEqual(campaignAnimalSpawns(world('stable')), campaignAnimalSpawns(world('stable')));
});

test('model walls stop boar charge and contact attacks; sharks follow submerged players without beaching', () => {
    const s = scene('navigation'), boar = s.creatures.find(a => a.campaignId === 'boar-0');
    s.terrain.getHeight = () => 0;
    s.campaign.collision.add('wall', new Float32Array([-2, 0, 0, 2, 0, 0, -2, 3, 0, 2, 0, 0, 2, 3, 0, -2, 3, 0]), [0, 0, 0]);
    boar.position.set([0, 0.35, 2]); boar._chargePhase = 'charging';
    s.wildlife.resolve(boar, [0, 0.35, -2], 1);
    assert.ok(boar.position[2] < -0.34); assert.equal(boar._chargePhase, 'ready');
    s.player.position = [0, 0.9, 1]; assert.equal(s.wildlife.canReachPlayer(boar), false);
    s.campaign.collision.remove('wall'); assert.equal(s.wildlife.canReachPlayer(boar), true);
    const shark = s.creatures.find(a => a.campaignId === 'shark-0');
    shark.state = CreatureState.CHASE; shark.position.set([0, 0.1, 5]);
    s.terrain.getHeight = (x, z) => z < 4 ? 0.2 : -8; s.player.position = [0, -4, 6];
    s.wildlife.resolve(shark, [0, 0.1, 5], 1); assert.ok(shark.position[1] < -1);
    const previous = Array.from(shark.position); shark.position.set([0, 0.1, 3]);
    s.wildlife.resolve(shark, previous, 0.1); assert.equal(shark.position[2], 5);
    assert.equal(shark.state, CreatureState.PATROL);
});

test('health, positions, orbits and killed animals persist without duplicating drops or respawning cleaned corpses', () => {
    const s = scene('persistence'), animal = s.creatures.find(a => a.campaignId === 'boar-0'), crab = s.creatures[0];
    animal.takeDamage(1); animal.position[0] += 1; crab.takeDamage(1000); assert.equal(s.drops, 1);
    s.collisionSystem.unregister(crab); crab.delete(); s.creatures.splice(0, 1);
    const saved = s.wildlife.snapshot(), restored = scene('persistence'); restored.wildlife.restore(saved);
    assert.equal(restored.creatures.length, 35); assert.equal(restored.drops, 0);
    assert.equal(restored.creatures.some(a => a.campaignId === crab.campaignId), false);
    const loadedAnimal = restored.creatures.find(a => a.campaignId === animal.campaignId);
    assert.equal(loadedAnimal.health, animal.health); assert.deepEqual(Array.from(loadedAnimal.position), Array.from(animal.position));
    assert.deepEqual(restored.wildlife.snapshot(), saved);
    assert.equal(restored.wildlife.active({ state: CreatureState.IDLE, position: [200, 0, 0] }), false);
    assert.equal(restored.wildlife.active({ state: CreatureState.DEAD, position: [200, 0, 0] }), true);
    saved.animals[0].health = 100000; assert.throws(() => restored.wildlife.restore(saved));
});

test('a submerged shark cannot charge vertically through a wreck deck', () => {
    const s = scene('shark-deck'), shark = s.creatures.find(a => a.campaignId === 'shark-0');
    s.terrain.getHeight = () => -8; s.player.position = [0, -0.2, 0];
    const plane = new Float32Array([-2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2]);
    s.campaign.collision.add('deck', plane, [0, -1, 0]);
    shark.state = CreatureState.CHASE; shark.position.set([0, -2, 0]);
    s.wildlife.resolve(shark, [0, -2, 0], 1);
    assert.ok(shark.position[1] <= -1 - shark.collider.radius);
    assert.equal(s.wildlife.canReachPlayer(shark), false);
});

test('indexed collision queries include large colliders across cells and track moving/removed entities', () => {
    const collision = new CollisionSystem({ indexed: true });
    const entity = (position, radius, layer) => ({ position, collider: { radius, height: 2, layer, type: 'sphere' }, updateModelMatrix() {} });
    const tree = entity([12, 0, 0], 10, CollisionLayers.Environment), animal = entity([100, 0, 0], 0.5, CollisionLayers.Creature);
    collision.register(tree); collision.register(animal, true);
    assert.deepEqual(collision.queryRadius([0, 100, 0], 3, CollisionLayers.Environment), [tree]);
    animal.position = [0, 0, 1]; collision.refreshDynamic(); assert.ok(collision.queryRadius([0, 0, 0], 2).includes(animal));
    const player = entity([2.5, 0, 0], 0.5, CollisionLayers.Player); collision.resolvePlayerCollisions(player, null);
    assert.ok(player.position[0] < 2);
    collision.unregister(tree); assert.equal(collision.queryRadius([0, 0, 0], 20).includes(tree), false);
    collision.clear(); assert.equal(collision.index.entries.size, 0);
});
