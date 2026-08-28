import test from 'node:test';
import assert from 'node:assert/strict';

import { CollisionLayers } from '../src/systems/CollisionLayers.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { ProjectileSystem } from '../src/systems/ProjectileSystem.js';

function arrowSpec(overrides = {}) {
    return {
        origin: [0, 0, 0],
        direction: [0, 0, 1],
        speed: 20,
        damage: 12,
        gravity: 0,
        lifetime: 2.5,
        radius: 0.08,
        ...overrides,
    };
}

test('sphere cast detects a collider across a large movement step', () => {
    const collisions = new CollisionSystem();
    const entity = {
        position: [0, 0, 5],
        collider: { type: 'sphere', trigger: false, layer: CollisionLayers.Creature, radius: 0.3 },
    };
    collisions.register(entity);

    const hit = collisions.sphereCast(
        [0, 0, 0], [0, 0, 1], 0.08, 10, CollisionLayers.Creature
    );
    assert.equal(hit.entity, entity);
    assert.ok(hit.distance > 4.5 && hit.distance < 5);
    assert.equal(collisions.sphereCast(
        [0, 0, 10], [0, 0, 1], 0.08, 10, CollisionLayers.Creature
    ), null);
});

test('arrow projectile damages once without tunneling at large delta time', () => {
    const collisions = new CollisionSystem();
    const creature = {
        position: [0, 0, 5],
        state: 'idle',
        health: 30,
        collider: { type: 'sphere', trigger: false, layer: CollisionLayers.Creature, radius: 0.3 },
        takeDamage(amount) { this.health -= amount; },
    };
    collisions.register(creature);
    const projectiles = new ProjectileSystem(null, collisions, { getHeight: () => -100 });
    let impacts = 0;
    projectiles.onImpact = () => impacts++;
    projectiles.spawnArrow(arrowSpec());

    projectiles.update(0.5);
    projectiles.update(0.5);
    assert.equal(creature.health, 18);
    assert.equal(impacts, 1);
    assert.equal(projectiles.projectiles.length, 0);
});

test('arrow disappears when it crosses terrain', () => {
    const projectiles = new ProjectileSystem(null, new CollisionSystem(), { getHeight: () => 0 });
    let impact = null;
    projectiles.onImpact = value => { impact = value; };
    projectiles.spawnArrow(arrowSpec({ origin: [0, 1, 0], direction: [0, -1, 0], speed: 10 }));
    projectiles.update(0.2);

    assert.ok(impact);
    assert.equal(impact.entity, null);
    assert.equal(projectiles.projectiles.length, 0);
});
