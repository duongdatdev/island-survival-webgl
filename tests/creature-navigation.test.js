import test from 'node:test';
import assert from 'node:assert/strict';

import { Boar } from '../src/entities/Boar.js';
import { Creature, CreatureState } from '../src/entities/Creature.js';
import { Seagull } from '../src/entities/Seagull.js';
import { Shark } from '../src/entities/Shark.js';

function createIslandTerrain(radius = 10) {
    const island = {
        radius,
        center: [0, 0],
        isLand(x, z) {
            return Math.hypot(x, z) <= radius;
        },
    };
    return {
        generator: { island },
        getHeight(x, z) {
            return island.isLand(x, z) ? 0.2 : -1;
        },
    };
}

test('land creatures turn back instead of patrolling into the ocean', () => {
    const terrain = createIslandTerrain();
    const creature = new Creature({ baseSpeed: 2, idleDuration: 1 });
    creature.position[0] = 8.5;
    creature._spawnPosition[0] = 8.5;
    creature.state = CreatureState.PATROL;
    creature._targetDir[0] = 1;
    creature._targetDir[2] = 0;

    creature.update(2, [0, 0, 0], terrain, 0.2);

    assert.equal(creature.position[0], 8.5);
    assert.equal(creature.state, CreatureState.IDLE);
    assert.ok(creature._targetDir[0] < 0);
});

test('boar charge stops at the shore and clears the charge', () => {
    const terrain = createIslandTerrain();
    const boar = new Boar(null, [8.8, 0.2, 0]);
    boar.state = CreatureState.CHASE;
    boar._chargePhase = 'charging';
    boar._chargeTimer = 1;
    boar._chargeDir[0] = 1;
    boar._chargeDir[2] = 0;

    boar.update(0.25, [9.4, 0.2, 0], terrain, 0.2);

    assert.ok(boar.position[0] <= terrain.generator.island.radius - boar.collider.radius);
    assert.equal(boar.state, CreatureState.IDLE);
    assert.equal(boar._chargePhase, 'ready');
});

test('shore constraint repairs collision pushes using the last safe position', () => {
    const terrain = createIslandTerrain();
    const creature = new Creature();
    creature.position[0] = 9;
    creature.constrainToNavigationSurface(terrain);

    creature.position[0] = 10.5;
    assert.equal(creature.constrainToNavigationSurface(terrain), true);
    assert.equal(creature.position[0], 9);
});

test('shore constraint does not affect flying or swimming creatures', () => {
    const terrain = createIslandTerrain();
    const seagull = new Seagull(null, [12, 10, 0]);
    const shark = new Shark(null, [12, 0.1, 0]);

    assert.equal(seagull.constrainToNavigationSurface(terrain), false);
    assert.equal(shark.constrainToNavigationSurface(terrain), false);
    assert.equal(seagull.position[0], 12);
    assert.equal(shark.position[0], 12);
});
