import test from 'node:test';
import assert from 'node:assert/strict';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { ProjectileSystem } from '../src/systems/ProjectileSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { CollisionLayers } from '../src/systems/CollisionLayers.js';

test('high-speed arrows stop at the nearest Campaign model, reach creatures through open doors, and stop at roofs', () => {
    const geometry = new Float32Array([-2, 0, 0, 2, 0, 0, -2, 3, 0, 2, 0, 0, 2, 3, 0, -2, 3, 0]);
    const models = new TriangleCollision(); models.add('wall', geometry, [0, 0, 2]); models.add('far-wall', geometry, [0, 0, 8]);
    assert.equal(models.segmentHit([0, 1, 0], [0, 1, 10]).distance, 2);
    const creature = { position: [0, 1, 5], state: 'idle', collider: { radius: 0.5, layer: CollisionLayers.Creature, type: 'sphere' }, health: 50,
        takeDamage(damage) { this.health -= damage; } };
    const objects = new CollisionSystem(); objects.register(creature);
    const projectiles = new ProjectileSystem(null, objects); projectiles.modelCollision = models;
    const shot = { origin: [0, 1, 0], direction: [0, 0, 1], speed: 30, radius: 0.08, damage: 20, gravity: 0, lifetime: 5 };
    let impact; projectiles.onImpact = hit => { impact = hit; };
    projectiles.spawnArrow(shot); projectiles.update(1); assert.equal(creature.health, 50); assert.equal(impact.point[2], 2);
    models.remove('wall'); projectiles.spawnArrow(shot); projectiles.update(1); assert.equal(creature.health, 30); assert.equal(impact.creature, creature);
    models.add('roof', new Float32Array([-2, 2, -2, -2, 2, 2, 2, 2, -2, 2, 2, -2, -2, 2, 2, 2, 2, 2]), [0, 0, 0]);
    projectiles.spawnArrow({ ...shot, direction: [0, 1, 0] }); projectiles.update(1);
    assert.equal(impact.point[1], 2); assert.equal(projectiles.projectiles.length, 0);
});
