import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/entities/Player.js';
import { CampaignController } from '../src/systems/CampaignController.js';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { CollisionLayers } from '../src/systems/CollisionLayers.js';

const camera = { position: [0, 1, 0], target: [0, 1, 1] };
function fixture(getHeight, campaign = true) {
    const player = new Player();
    if (campaign) {
        player.scaleFactor = 1; player.collider.height = 1.8; player.collider.radius = 0.28;
    }
    player.position.set([0, getHeight(0, 0) + player.collider.height / 2, 0]);
    const terrain = { getHeight };
    const controller = Object.create(CampaignController.prototype);
    controller.scene = { player, terrain, inventory: { hasItem: () => false } };
    controller.collision = new TriangleCollision(); controller.refreshCollision = () => {};
    const keys = new Set(['moveForward']);
    let previousKeys = new Set();
    return { player, controller, terrain, keys, tick(dt = 1 / 60) {
        const previous = Array.from(player.position);
        player.update(dt, { isKeyDown: key => keys.has(key), isKeyPressed: key => keys.has(key) && !previousKeys.has(key) }, camera, terrain, campaign ? controller.collision : null);
        previousKeys = new Set(keys);
        if (campaign) controller.afterMovement(dt, previous);
    } };
}

test('tall terrain cliffs block walking and sprinting at both character scales and slow frame rates', () => {
    for (const campaign of [false, true]) for (const dt of [1 / 144, 1 / 60, 0.25]) {
        const f = fixture((x, z) => z >= 1 ? 5 : 1, campaign);
        f.player.speed = 4.8;
        for (let i = 0; i < Math.ceil(2 / dt); i++) f.tick(dt);
        assert.ok(f.player.position[2] < 1, `${campaign}/${dt}: crossed cliff`);
        assert.ok(f.player.position[1] < 2, 'teleported onto cliff');
        assert.ok(f.player.currentSpeed < 0.001, 'blocked speed should stop');
    }
});

test('jump rises, lands, and requires a fresh press at both character scales', () => {
    for (const campaign of [false, true]) for (const dt of [1 / 144, 1 / 60, 0.25]) {
        const f = fixture(() => 1, campaign);
        f.keys.clear(); f.keys.add('jump');
        const startY = f.player.position[1];
        f.tick(dt);
        assert.ok(f.player.position[1] > startY, `${campaign}/${dt}: did not jump`);
        assert.equal(f.player.grounded, false);
        for (let i = 0; i < Math.ceil(2 / dt); i++) f.tick(dt);
        assert.ok(Math.abs(f.player.position[1] - startY) < 0.001);
        assert.equal(f.player.grounded, true);
        assert.equal(f.player.velocity[1], 0);
        f.keys.delete('jump'); f.tick(dt); f.keys.add('jump'); f.tick(dt);
        assert.ok(f.player.position[1] > startY, 'fresh press should jump again');
    }
});

test('pressing jump while airborne cannot restart the ascent', () => {
    const f = fixture(() => 1); f.keys.clear(); f.keys.add('jump'); f.tick();
    f.keys.delete('jump'); f.tick();
    const upwardSpeed = f.player.velocity[1];
    f.keys.add('jump'); f.tick();
    assert.ok(f.player.velocity[1] < upwardSpeed);
    assert.equal(f.player.grounded, false);
});

test('jumping from a model floor returns to the same support', () => {
    const f = fixture(() => 1); f.keys.clear();
    const plane = new Float32Array([-3, 0, -3, -3, 0, 3, 3, 0, -3, 3, 0, -3, -3, 0, 3, 3, 0, 3]);
    f.controller.collision.add('floor', plane, [0, 1.4, 0]);
    f.tick(); const startY = f.player.position[1];
    f.keys.add('jump'); f.tick();
    assert.ok(f.player.position[1] > startY);
    for (let i = 0; i < 120; i++) f.tick();
    assert.ok(Math.abs(f.player.position[1] - startY) < 0.001);
    assert.equal(f.player.grounded, true);
});

test('a low ceiling stops ascent without trapping the player in the air', () => {
    const f = fixture(() => 1); f.keys.clear();
    const roof = new Float32Array([-3, 0, -3, -3, 0, 3, 3, 0, -3, 3, 0, -3, -3, 0, 3, 3, 0, 3]);
    f.controller.collision.add('roof', roof, [0, 3.1, 0]);
    f.keys.add('jump');
    let maximumY = f.player.position[1];
    for (let i = 0; i < 120; i++) {
        f.tick(); maximumY = Math.max(maximumY, f.player.position[1]);
        assert.ok(f.player.position[1] + f.player.collider.height / 2 <= 3.1);
        assert.ok(f.controller.collision.capsuleClear(f.player.position));
    }
    assert.ok(maximumY > 1.9);
    assert.ok(Math.abs(f.player.position[1] - 1.9) < 0.001);
    assert.equal(f.player.grounded, true);
});

test('walkable slopes and short steps remain accessible, steep slopes reject uphill movement', () => {
    for (const getHeight of [(x, z) => 1 + z * 0.6, (x, z) => z >= 1 ? 1.35 : 1]) {
        const f = fixture(getHeight);
        for (let i = 0; i < 120; i++) f.tick();
        assert.ok(f.player.position[2] > 5);
        assert.ok(Math.abs(f.player.position[1] - getHeight(f.player.position[0], f.player.position[2]) - 0.9) < 0.01);
    }
    const steep = fixture((x, z) => 1 + Math.max(0, z - 1) * 2);
    for (let i = 0; i < 120; i++) steep.tick();
    assert.ok(steep.player.position[2] <= 1.01);
});

test('diagonal input slides along a cliff without climbing it', () => {
    const f = fixture((x, z) => z >= 1 ? 5 : 1); f.keys.add('moveLeft');
    for (let i = 0; i < 180; i++) f.tick();
    assert.ok(f.player.position[2] < 1);
    assert.ok(Math.abs(f.player.position[0]) > 4);
    assert.ok(f.player.position[1] < 2);
});

test('leaving a ledge falls over time and lands on terrain instead of snapping down', () => {
    for (const campaign of [false, true]) {
        const f = fixture((x, z) => z < 1 ? 5 : 1, campaign);
        while (f.player.position[2] < 1) f.tick();
        assert.ok(f.player.position[1] > 5, 'first falling frame snapped down');
        assert.ok(f.player.velocity[1] < 0); assert.equal(f.player.grounded, false);
        for (let i = 0; i < 90; i++) f.tick();
        assert.ok(Math.abs(f.player.position[1] - 1 - f.player.collider.height / 2) < 0.001);
        assert.equal(f.player.velocity[1], 0); assert.equal(f.player.grounded, true);
    }
});

test('object collision cannot push the actor onto a tall terrain cliff', () => {
    const f = fixture((x, z) => z >= 1 ? 5 : 1);
    f.player.position[2] = 0.65;
    const collision = new CollisionSystem(); collision.register(f.player);
    collision.register({ position: [0, 1.9, 0], collider: {
        type: 'capsule', radius: 1, height: 1.8, layer: CollisionLayers.Environment,
    } });
    collision.resolvePlayerCollisions(f.player, f.terrain);
    assert.ok(f.player.position[2] < 1); assert.ok(f.player.position[1] < 2);
});

test('raised model floors still support walking and falling onto their surface', () => {
    const f = fixture(() => 1);
    const plane = new Float32Array([-3, 0, -3, -3, 0, 3, 3, 0, -3, 3, 0, -3, -3, 0, 3, 3, 0, 3]);
    f.controller.collision.add('floor', plane, [0, 1.4, 0]);
    f.keys.clear();
    for (let i = 0; i < 30; i++) f.tick();
    assert.ok(Math.abs(f.player.position[1] - 2.3) < 0.001);
    f.player.position[1] = 6; f.player.velocity.fill(0);
    for (let i = 0; i < 90; i++) f.tick();
    assert.ok(Math.abs(f.player.position[1] - 2.3) < 0.001);
    assert.ok(f.controller.collision.capsuleClear(f.player.position));
});
