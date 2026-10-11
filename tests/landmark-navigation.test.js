import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { Mat4 } from '../src/math/Mat4.js';
import { ModelAsset } from '../src/renderer/ModelAsset.js';
import { TriangleCollision } from '../src/systems/TriangleCollision.js';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { buildCampaignLandmarks } from '../src/gameplay/world/CampaignLandmarks.js';
import { findWreckApproach } from './fixtures/wreck-approach.js';

const manifest = JSON.parse(await readFile('assets/campaign/manifest.json', 'utf8'));
const io = new NodeIO(), cache = new Map();
async function geometry(id) {
    if (cache.has(id)) return cache.get(id);
    const def = manifest.models.find(m => 'campaign:' + m.id === id), doc = await io.read(def.path);
    const entries = doc.getRoot().listNodes().flatMap(node => (node.getMesh()?.listPrimitives() || []).map(primitive => ({ primitive, nodeMatrix: node.getWorldMatrix() })));
    const bounds = ModelAsset._computeWorldBounds(entries), matrix = def.nativeScale ? Mat4.create() : ModelAsset._createNormalizationMatrix(bounds, def.targetSize, 0, true);
    if (!def.nativeScale) matrix[13] += def.targetSize[1] / 2;
    const triangles = [];
    for (const entry of entries) {
        const data = ModelAsset._createMeshData(entry.primitive, entry.primitive.getMaterial()), transform = Mat4.create();
        Mat4.multiply(transform, matrix, entry.nodeMatrix);
        for (const i of data.indices || Array.from({ length: data.positions.length / 3 }, (_, i) => i)) {
            const x = data.positions[i * 3], y = data.positions[i * 3 + 1], z = data.positions[i * 3 + 2];
            triangles.push(transform[0] * x + transform[4] * y + transform[8] * z + transform[12],
                transform[1] * x + transform[5] * y + transform[9] * z + transform[13],
                transform[2] * x + transform[6] * y + transform[10] * z + transform[14]);
        }
    }
    const result = new Float32Array(triangles); cache.set(id, result); return result;
}

test('all salvage parts can be approached by a full swimming capsule without reaching through the actual wreck across 100 seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate('salvage-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world), collision = new TriangleCollision();
        for (const model of layout.models.filter(model => model.id.startsWith('wreck-') && !model.id.startsWith('note-'))) {
            collision.add(model.id, await geometry(model.model), model.position, model.yaw, model.scale);
        }
        for (const node of layout.salvageNodes) assert.ok(findWreckApproach(node, collision, world.terrainGenerator), `${node.id} inaccessible at seed ${seed}`);
    }
});

test('the submerged manifest rests in the open hold and permits a visible full-capsule approach across 100 seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate(seed === 0 ? 'early-campaign-path' : 'manifest-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world), collision = new TriangleCollision();
        for (const model of layout.models.filter(m => m.id.startsWith('wreck-') || m.id === 'note-wreck_manifest')) {
            collision.add(model.id, await geometry(model.model), model.position, model.yaw, model.scale);
        }
        const position = layout.journals.wreck_manifest.position;
        assert.ok(position[1] < -0.8, `manifest above diving depth at seed ${seed}`);
        const node = { position, base: position, modelId: 'note-wreck_manifest' };
        const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
        const approach = findWreckApproach(node, collision, world.terrainGenerator,
            point => layout.salvageNodes.every(other => distance(point, other.position) > distance(point, position) + .1));
        assert.ok(approach, `no visible manifest approach at seed ${seed}`);
        assert.ok(!collision.segmentBlocked(approach, position, { ignoreInstances: new Set(['note-wreck_manifest']) }));
    }
});

test('actual cave and station model entrances stay traversable across 100 generated seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate(String(seed), {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world);
        for (const [poiId, prefix] of [['mine', 'mine-'], ['weather_station', 'station-']]) {
            const collision = new TriangleCollision(), center = world.pois.find(p => p.id === poiId).position;
            for (const record of layout.models.filter(m => m.id.startsWith(prefix))) {
                collision.add(record.id, await geometry(record.model), record.position, record.yaw + (record.gate ? Math.PI / 2 : 0), record.scale);
            }
            let previous = [center[0], world.terrainGenerator.getHeight(center[0], center[2] + 10) + 0.9, center[2] + 10];
            for (let step = 0; step < 40; step++) {
                const z = previous[2] - 0.25, ground = world.terrainGenerator.getHeight(center[0], z), point = [center[0], ground + 0.9, z];
                collision.resolve(point, collision.stepUp(point, previous, world.terrainGenerator), 0.28, 1.8, {
                    grounded: true, floorHeight: (x, z) => world.terrainGenerator.getHeight(x, z) + 0.9 });
                point[1] = collision.groundHeight(point, ground, 0.55, 0.9, 0.28) + 0.9;
                assert.ok(point[2] < previous[2] - 0.2, `${poiId} blocked at seed ${seed}, local z=${(point[2] - center[2]).toFixed(2)}`);
                previous = point;
            }
            assert.ok(Math.abs(previous[2] - center[2]) < 0.1);
            collision.clear();
        }
        assert.equal(world.resourceNodes.filter(n => n.worldNodeId.startsWith('mine-vein-') && n.id === 'iron_ore').reduce((n, node) => n + node.amount, 0), 56);
    }
});

test('actual station gate blocks entry before opening and the wreck permits underwater approach', async () => {
    const world = new CampaignWorldGenerator().generate('physical-landmarks', {}, false, { mesh: false, props: false });
    const layout = buildCampaignLandmarks(world), collision = new TriangleCollision();
    const gate = layout.models.find(m => m.gate);
    collision.add(gate.id, await geometry(gate.model), gate.position, gate.yaw, gate.scale);
    const station = world.pois.find(p => p.id === 'weather_station').position;
    const previous = [station[0], station[1] + 1.2, station[2] + 4], point = [station[0], station[1] + 1.2, station[2] + 2];
    collision.resolve(point, previous); assert.ok(point[2] > station[2] + 3.2);
    const wreck = layout.models.find(m => m.id === 'wreck-hull');
    collision.add(wreck.id, await geometry(wreck.model), wreck.position, wreck.yaw, wreck.scale);
    let nearest = Infinity;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        let current = [wreck.position[0] + Math.sin(angle) * 8, wreck.position[1] + 0.95, wreck.position[2] + Math.cos(angle) * 8];
        for (let step = 0; step < 30; step++) {
            const candidate = [current[0] - Math.sin(angle) * 0.2, current[1], current[2] - Math.cos(angle) * 0.2];
            collision.resolve(candidate, current, 0.28, 1.8, { vertical: true,
                floorHeight: (x, z) => world.terrainGenerator.getHeight(x, z) + 0.9 }); current = candidate;
        }
        nearest = Math.min(nearest, Math.hypot(current[0] - wreck.position[0], current[2] - wreck.position[2]));
    }
    assert.ok(nearest < 2.8, 'wreck manifest must be reachable within interaction range underwater');
});

test('all three survey devices have dry, capsule-clear interaction approaches across 100 seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate('survey-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world);
        for (const station of Object.values(layout.surveyStations)) {
            const collision = new TriangleCollision(), center = station.position;
            for (const model of layout.models.filter(model => model.id.startsWith('survey-' + station.id))) {
                collision.add(model.id, await geometry(model.model), model.position, model.yaw, model.scale);
            }
            let current = [center[0], world.terrainGenerator.getHeight(center[0], center[2] + 5) + 0.9, center[2] + 5];
            for (let step = 0; step < 14; step++) {
                const z = current[2] - 0.2, ground = world.terrainGenerator.getHeight(current[0], z), candidate = [current[0], ground + 0.9, z];
                assert.ok(ground >= 0, `${station.id} submerged at seed ${seed}`);
                collision.resolve(candidate, collision.stepUp(candidate, current, world.terrainGenerator), 0.28, 1.8, {
                    grounded: true, floorHeight: (x, z) => world.terrainGenerator.getHeight(x, z) + 0.9 });
                candidate[1] = collision.groundHeight(candidate, ground, 0.55, 0.9, 0.28) + 0.9;
                assert.ok(candidate[2] < current[2] - 0.15, `${station.id} approach blocked at seed ${seed}`); current = candidate;
            }
            assert.ok(Math.hypot(...current.map((value, i) => value - center[i])) < 3, `${station.id} outside interaction range at seed ${seed}`);
        }
    }
});

test('outdoor record crates permit a full standing approach and visible note across 100 seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate('journal-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world);
        for (const site of Object.values(layout.journalSearchSites)) {
            const collision = new TriangleCollision();
            for (const model of layout.models.filter(m => m.id === 'search-crate-' + site.id || m.id === 'note-' + site.id)) {
                collision.add(model.id, await geometry(model.model), model.position, model.yaw, model.scale);
            }
            let current = [site.base[0], world.terrainGenerator.getHeight(site.base[0], site.base[2] - 3.5) + .9, site.base[2] - 3.5];
            for (let step = 0; step < 10; step++) {
                const z = current[2] + .2, ground = world.terrainGenerator.getHeight(current[0], z), next = [current[0], ground + .9, z];
                collision.resolve(next, collision.stepUp(next, current, world.terrainGenerator), .28, 1.8,
                    { grounded: true, floorHeight: (x, z) => world.terrainGenerator.getHeight(x, z) + .9 });
                assert.ok(next[2] - current[2] > .15, `${seed}/${site.id}: blocked approach`);
                assert.ok(collision.capsuleClear(next, .28, 1.8)); current = next;
            }
            assert.ok(Math.hypot(...current.map((v, i) => v - site.position[i])) < 3);
            assert.equal(collision.segmentBlocked(current, site.position, { ignoreInstances: new Set(['note-' + site.id]) }), false);
        }
    }
});

test('both deep ore faces are reachable from the cave interior and cannot be worked through its wall across 100 seeds', async () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate('deep-mine-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world), collision = new TriangleCollision(), center = world.pois.find(p => p.id === 'mine').position;
        for (const model of layout.models.filter(model => model.id.startsWith('mine-'))) {
            collision.add(model.id, await geometry(model.model), model.position, model.yaw, model.scale);
        }
        for (const face of layout.mineFaces) {
            let current = [center[0], center[1] + .9, center[2]];
            current[1] = collision.groundHeight(current, center[1], .55, .9, .28) + .9;
            for (const target of [[face.base[0], center[2]], [face.base[0], face.base[2] + 1.8]]) {
                let steps = 0;
                while (Math.hypot(current[0] - target[0], current[2] - target[1]) > .01) {
                    assert.ok(++steps < 100, `${seed}/${face.id}: route did not converge`);
                    const remaining = Math.hypot(current[0] - target[0], current[2] - target[1]), fraction = Math.min(1, .2 / remaining);
                    const x = current[0] + (target[0] - current[0]) * fraction, z = current[2] + (target[1] - current[2]) * fraction;
                    const ground = world.terrainGenerator.getHeight(x, z), next = [x, ground + .9, z];
                    collision.resolve(next, collision.stepUp(next, current, world.terrainGenerator), .28, 1.8, { grounded: true,
                        floorHeight: (x, z) => world.terrainGenerator.getHeight(x, z) + .9 });
                    next[1] = collision.groundHeight(next, ground, .55, .9, .28) + .9;
                    assert.ok(collision.capsuleClear(next, .28, 1.8), `${seed}/${face.id}: body collision`);
                    assert.ok(Math.hypot(next[0] - current[0], next[2] - current[2]) > .01, `${seed}/${face.id}: blocked route`);
                    current = next;
                }
            }
            assert.ok(Math.hypot(...current.map((value, axis) => value - face.position[axis])) < 2.5);
            const options = { ignoreInstances: new Set([face.modelId]) };
            assert.equal(collision.segmentBlocked(current, face.position, options), false, `${seed}/${face.id}: inaccessible face`);
            assert.equal(collision.segmentBlocked([face.base[0], face.base[1] + .9, center[2] - 8], face.position, options), true, `${seed}/${face.id}: wall bypass`);
        }
    }
});
