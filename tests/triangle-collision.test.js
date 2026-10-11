import test from 'node:test';
import assert from 'node:assert/strict';
import { TriangleCollision, closestTrianglePoint, closestSegmentPair, closestSegmentTriangle } from '../src/systems/TriangleCollision.js';
import { createCubeData } from '../src/renderer/CubeGeometry.js';

const wall = new Float32Array([-2, 0, 0, 2, 0, 0, -2, 3, 0, 2, 0, 0, 2, 3, 0, -2, 3, 0]);

test('standing capsule cannot enter beneath a low tabletop, but can walk under a sufficiently high ceiling', () => {
    const plane = new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    const terrain = { getHeight: () => 0 }, options = { grounded: true, floorHeight: () => 0.9 };
    const low = new TriangleCollision(); low.add('tabletop', plane, [0, 1.05, 0]);
    const point = [0, 0.9, 0]; low.resolve(point, [3, 0.9, 0], 0.28, 1.8, options);
    assert.ok(point[0] > 1.27); assert.equal(point[1], 0.9); assert.equal(low.capsuleClear([0, 0.9, 0]), false);
    assert.equal(low.capsuleClear(point), true);
    const high = new TriangleCollision(); high.add('roof', plane, [0, 2.6, 0]);
    const clear = [0, 0.9, 0]; high.resolve(clear, [3, 0.9, 0], 0.28, 1.8, options);
    assert.ok(clear[0] < 0.01); assert.equal(high.capsuleClear(clear), true);
    low.clear(); low.add('low-step', plane, [0, 0.4, 0]); low.add('low-ceiling', plane, [0, 1.95, 0]);
    const candidate = [0.8, 0.9, 0], before = [1.6, 0.9, 0];
    const start = low.stepUp(candidate, before, terrain);
    assert.equal(candidate[1], 0.9, 'step-up must not raise the head into a ceiling');
    low.resolve(candidate, start, 0.28, 1.8, options); assert.ok(candidate[0] > 1.1);
});

test('grounded volume retains low floor steps and bridges narrow plank seams', () => {
    const collision = new TriangleCollision(), cube = createCubeData(1, 1, 1), terrain = { getHeight: () => 0 };
    const triangles = new Float32Array([...cube.indices].flatMap(i => [...cube.positions.slice(i * 3, i * 3 + 3)]));
    for (let i = 0; i < 8; i++) collision.add(`plank-${i}`, triangles, [-0.875 + i * 0.25, 0.1, 1], 0, [0.24, 0.2, 2]);
    let previous = [0, 0.9, -0.6];
    for (let i = 0; i < 75; i++) {
        const point = [0, 0.9, previous[2] + 0.04];
        collision.resolve(point, collision.stepUp(point, previous, terrain), 0.28, 1.8, { grounded: true, floorHeight: () => 0.9 });
        point[1] = collision.groundHeight(point, 0, 0.55, 0.9, 0.28) + 0.9;
        assert.equal(collision.capsuleClear(point), true); previous = point;
    }
    assert.ok(previous[2] > 2.2);
});

test('interaction rays can ignore the target prop while retaining hull and wall occlusion', () => {
    const collision = new TriangleCollision(); collision.add('target', wall, [0, 0, 1]);
    const options = { ignoreInstances: new Set(['target']) };
    assert.equal(collision.segmentBlocked([0, 1, -2], [0, 1, 2]), true);
    assert.equal(collision.segmentBlocked([0, 1, -2], [0, 1, 2], options), false);
    collision.add('hull', wall, [0, 0, 0]);
    assert.equal(collision.segmentBlocked([0, 1, -2], [0, 1, 2], options), true);
});
test('small raised floor edges step up from actual terrain height, while walls and excessive steps remain blocking', () => {
    const collision = new TriangleCollision(), cube = createCubeData(1, 1, 1);
    const triangles = new Float32Array([...cube.indices].flatMap(i => [...cube.positions.slice(i * 3, i * 3 + 3)]));
    collision.add('floor', triangles, [0, 0.1, 1], 0, [2, 0.2, 2]);
    let previous = [0, 0.9, -1];
    for (let i = 0; i < 50; i++) {
        const point = [previous[0], 0.9, previous[2] + 0.08], from = collision.stepUp(point, previous, { getHeight: () => 0 });
        collision.resolve(point, from); point[1] = collision.groundHeight(point, 0) + 0.9; previous = point;
    }
    assert.ok(previous[2] > 2.8);
    collision.add('wall', triangles, [0, 1, 1], 0, [2, 2, 0.15]);
    const point = [0, 0.9, 1.2], start = [0, 0.9, -1]; collision.resolve(point, collision.stepUp(point, start, { getHeight: () => 0 }));
    assert.ok(point[2] < 1);
    const tall = new TriangleCollision(); tall.add('high-step', triangles, [0, 0.5, 1], 0, [2, 1, 2]);
    const blocked = [0, 0.9, 0.4], outside = [0, 0.9, -1];
    tall.resolve(blocked, tall.stepUp(blocked, outside, { getHeight: () => 0 }));
    assert.ok(blocked[2] < 0);
});
test('triangle narrow phase blocks swept high-speed movement and permits movement parallel to wall', () => {
    const collision = new TriangleCollision(); collision.add('wall', wall, [0, 0, 0]);
    const start = [0, 0.9, -2], point = [0, 0.9, 2];
    collision.resolve(point, start);
    assert.ok(point[2] < -0.27);
    const sideways = [1, 0.9, point[2]]; collision.resolve(sideways, point);
    assert.ok(sideways[0] > 0.9);
    assert.equal(collision.segmentBlocked([0, 1, -2], [0, 1, 2]), true);
    assert.equal(collision.segmentBlocked([3, 1, -2], [3, 1, 2]), false);
    assert.equal(collision.segmentBlocked([0, 4, -2], [0, 4, 2]), false);
    collision.remove('wall'); const free = [1, 0.9, 2]; collision.resolve(free, sideways); assert.ok(Math.abs(free[2] - 2) < 0.00001);
});
test('triangle ground respects footprint and step height, without snapping to an overhead roof', () => {
    const collision = new TriangleCollision();
    const floor = new Float32Array([-1, 0.2, -1, -1, 0.2, 1, 1, 0.2, -1, 1, 0.2, -1, -1, 0.2, 1, 1, 0.2, 1]);
    collision.add('floor', floor, [0, 0, 0]); collision.add('roof', floor, [0, 2.4, 0]);
    assert.ok(Math.abs(collision.groundHeight([0, 0.9, 0], 0) - 0.2) < 0.00001);
    assert.equal(collision.groundHeight([3, 0.9, 0], 0), 0);
    assert.deepEqual(closestTrianglePoint([0, 1, 0], [-1, 0, -1], [-1, 0, 1], [1, 0, 0]), [0, 0, 0]);
});

test('capsule footprint bridges narrow plank gaps without treating them as pits', () => {
    const collision = new TriangleCollision(), cube = createCubeData(1, 1, 1);
    const triangles = new Float32Array([...cube.indices].flatMap(i => [...cube.positions.slice(i * 3, i * 3 + 3)]));
    for (let i = 0; i < 8; i++) collision.add(`plank-${i}`, triangles, [-0.875 + i * 0.25, 0.1, 1], 0, [0.24, 0.2, 2]);
    let previous = [0, 0.9, -0.5];
    for (let i = 0; i < 70; i++) {
        const point = [0, 0.9, previous[2] + 0.04];
        collision.resolve(point, collision.stepUp(point, previous, { getHeight: () => 0 }));
        point[1] = collision.groundHeight(point, 0, 0.55, 0.9, 0.28) + 0.9; previous = point;
        if (point[2] > 0.1 && point[2] < 1.9) assert.ok(Math.abs(point[1] - 1.1) < 0.00001);
    }
    assert.ok(previous[2] > 2.2);
    assert.equal(collision.groundHeight([0, 0.9, 1], 0), 0);
});

test('capsule axis contacts catch narrow faces between the old three sample spheres', () => {
    const triangle = { a: [-0.02, 0.30, 0], b: [0.02, 0.30, 0], c: [0, 0.32, 0], normal: [0, 0, 1] };
    const contact = closestSegmentTriangle([0, -0.62, -0.1], [0, 0.62, -0.1], triangle);
    assert.ok(Math.abs(contact.distance - 0.1) < 1e-8);
    const crossing = closestSegmentTriangle([0, 0.31, -1], [0, 0.31, 1], triangle); assert.equal(crossing.distance, 0);
    const collision = new TriangleCollision(); collision.add('thin-face', new Float32Array([...triangle.a, ...triangle.b, ...triangle.c]), [0, 0, 0]);
    const point = [0, 0, 1]; collision.resolve(point, [0, 0, -1], 0.28, 1.8, { vertical: true });
    assert.ok(point[2] < -0.27);
    const degenerate = closestSegmentPair([1, 2, 3], [1, 2, 3], [0, 2, 3], [2, 2, 3]);
    assert.deepEqual(degenerate.segment, degenerate.triangle);
    const parallel = closestSegmentPair([0, 0, 0], [0, 4, 0], [1, 2, 0], [1, 6, 0]);
    assert.ok(Math.abs(Math.hypot(...parallel.segment.map((v, i) => v - parallel.triangle[i])) - 1) < 1e-8);
});

test('swimming volume blocks swept ascent/descent at horizontal surfaces and allows escape around their edges', () => {
    const collision = new TriangleCollision();
    const plane = new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    collision.add('floor', plane, [0, -2, 0]); collision.add('ceiling', plane, [0, 0.3, 0]);
    const rise = [0, 4, 0]; collision.resolve(rise, [0, -1, 0], 0.28, 1.8, { vertical: true });
    assert.ok(rise[1] < -0.599 && rise[1] > -0.61);
    const dive = [0, -6, 0]; collision.resolve(dive, rise, 0.28, 1.8, { vertical: true });
    assert.ok(dive[1] > -1.101 && dive[1] < -1.09);
    const lateral = [3, dive[1], 0]; collision.resolve(lateral, dive, 0.28, 1.8, { vertical: true });
    assert.ok(lateral[0] > 2.99);
    const clear = [3, 3, 0]; collision.resolve(clear, lateral, 0.28, 1.8, { vertical: true }); assert.ok(clear[1] > 2.99);
});

test('low deck clearance blocks entry while the seabed keeps the capsule above terrain', () => {
    const collision = new TriangleCollision();
    const plane = new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    collision.add('low-deck', plane, [0, -1, 0]);
    const point = [0, -1.1, 0]; collision.resolve(point, [3, -1.1, 0], 0.28, 1.8, { vertical: true, floorHeight: () => -1.1 });
    assert.ok(point[0] > 1.27); assert.ok(point[1] >= -1.1);
    const descend = [4, -9, 0]; collision.resolve(descend, [4, -1.1, 0], 0.28, 1.8, { vertical: true, floorHeight: () => -1.1 });
    assert.ok(descend[1] >= -1.1);
});
