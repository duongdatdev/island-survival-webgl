import test from 'node:test';
import assert from 'node:assert/strict';
import { findCampaignRespawn } from '../src/systems/CampaignRespawn.js';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { SpatialGrid } from '../src/systems/SpatialGrid.js';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';

function fixture() {
    const controller = { scene: { terrain: { getHeight: () => 1 }, player: { collider: { radius: 0.28, height: 1.8 } },
        world: { spawnPosition: [20, 1, 0] }, removedEnvironmentObjectIds: new Set() },
        registry: new StructureRegistry({ terrain: { getHeight: () => 1 } }), collision: new TriangleCollision(), environmentIndex: new SpatialGrid() };
    controller.registry.structures.set('bed-a', { type: 'bed', position: [0, 1, 0], yaw: 0 }); controller.registry.respawnBedId = 'bed-a';
    return controller;
}
test('bed respawn accounts for elevated floors and actual wall geometry, without standing in props', () => {
    const c = fixture();
    const floor = new Float32Array([-5, 0, -5, -5, 0, 5, 5, 0, -5, 5, 0, -5, -5, 0, 5, 5, 0, 5]);
    c.collision.add('floor', floor, [0, 1.4, 0]);
    const tree = { worldObjectId: 'tree', position: [1.6, 1, 0], collider: { type: 'capsule', radius: 1, height: 5 } };
    c.environmentIndex.insert('tree', { min: [0.6, 1, -1], max: [2.6, 6, 1] }, { entity: tree });
    const point = findCampaignRespawn(c);
    assert.ok(Math.hypot(point[0] - 1.6, point[2]) >= 1.28); assert.ok(Math.abs(point[1] - 2.3) < 1e-6);
    c.scene.removedEnvironmentObjectIds.add('tree'); assert.ok(Math.abs(findCampaignRespawn(c)[0] - 1.6) < 1e-6);
    c.collision.add('wall', new Float32Array([-5, 0, 0, 5, 0, 0, -5, 4, 0, 5, 0, 0, 5, 4, 0, -5, 4, 0]), [0, 1, 0]);
    const clear = findCampaignRespawn(c); assert.ok(Math.abs(clear[2]) > 0.28);
});
test('missing/blocked/wet beds fall back to dry reserved start, or search beyond an obstructed start', () => {
    const c = fixture(); c.scene.terrain.getHeight = (x, z) => Math.hypot(x, z) < 8 ? -1 : 1;
    assert.deepEqual(findCampaignRespawn(c), [20, 1.9, 0]);
    c.registry.structures.clear(); assert.deepEqual(findCampaignRespawn(c), [20, 1.9, 0]);
    const rock = { worldObjectId: 'rock', position: [20, 1, 0], collider: { type: 'sphere', radius: 3, height: 5 } };
    c.environmentIndex.insert('rock', { min: [17, 1, -3], max: [23, 6, 3] }, { entity: rock });
    const clear = findCampaignRespawn(c); assert.ok(Math.hypot(clear[0] - 20, clear[2]) >= 3.28);
});

test('an older saved pose under a low tabletop recovers nearby with full head clearance', () => {
    const c = fixture();
    const top = new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    c.collision.add('tabletop', top, [10, 2.05, 0]);
    const saved = [10, 1.9, 0]; assert.equal(c.collision.capsuleClear(saved), false);
    const repaired = findCampaignRespawn(c, { near: saved });
    assert.equal(c.collision.capsuleClear(repaired), true);
    assert.ok(Math.hypot(repaired[0] - saved[0], repaired[2] - saved[2]) < 3);
    assert.deepEqual(findCampaignRespawn(c, { near: [12, 1.9, 0] }), [12, 1.9, 0]);
});
