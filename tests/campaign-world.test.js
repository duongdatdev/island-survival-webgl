import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';

test('100 campaign seeds provide guaranteed connected land POIs and an accessible offshore wreck', () => {
    for (let seed = 0; seed < 100; seed++) {
        const generator = new CampaignWorldGenerator();
        const world = generator.generate(String(seed), {}, false, { mesh: false, props: false });
        assert.equal(world.width, 640);
        assert.equal(world.pois.length, 8);
        assert.ok(generator.island.radius >= 260 && generator.island.radius <= 280);
        for (const [a, b] of world.paths) {
            for (let index = 0; index <= 100; index++) {
                const t = index / 100;
                const x = a[0] + (b[0] - a[0]) * t;
                const z = a[2] + (b[2] - a[2]) * t;
                assert.ok(generator.getHeight(x, z) >= 0.15, `${seed} path ${index}`);
                assert.equal(generator._reserved(x, z), true);
            }
        }
        const wreck = world.pois.find(poi => poi.id === 'offshore_wreck');
        assert.ok(wreck.position[1] < 0);
        assert.ok(Math.hypot(wreck.position[0], wreck.position[2]) - generator.island.radius < 30);
        assert.ok(world.resourceNodes.some(node => node.id === 'iron_ore'));
        assert.ok(world.resourceNodes.some(node => node.id === 'fiber'));
        assert.equal(world.resourceNodes.filter(node => node.worldNodeId.startsWith('starter-')).length, 36);
    }
});

test('campaign seed regenerates identical POIs, resources and terrain samples', () => {
    const a = new CampaignWorldGenerator();
    const b = new CampaignWorldGenerator();
    const worldA = a.generate('persistent-campaign', {}, false, { mesh: false });
    const worldB = b.generate('persistent-campaign', {}, false, { mesh: false });
    assert.deepEqual(worldA.pois, worldB.pois);
    assert.deepEqual(worldA.resourceNodes, worldB.resourceNodes);
    for (const [x, z] of [[0, 0], [100, -200], [-250, 40]]) assert.equal(a.getHeight(x, z), b.getHeight(x, z));
});

test('mountain relief, curved coast and graded trails remain usable across campaign seeds', () => {
    for (let seed = 0; seed < 10; seed++) {
        const generator = new CampaignWorldGenerator();
        const world = generator.generate(seed, {}, false, { mesh: false, props: false });
        const local = (x, z) => [x * Math.cos(generator.rotation) - z * Math.sin(generator.rotation),
            x * Math.sin(generator.rotation) + z * Math.cos(generator.rotation)];
        let summit = 0;
        for (let z = -120; z <= 20; z += 10) for (let x = -100; x <= 100; x += 10) {
            summit = Math.max(summit, generator.getHeight(...local(x, z)));
        }
        assert.ok(summit > 50, 'central mountain has a visible summit beside the trails');
        assert.ok(generator.getHeight(...local(-62, 159)) > 18, 'arrival beach is framed by foothills');
        assert.ok(generator.island.isOcean(...local(generator.island.radius - 2, 0)), 'coast contains a cove');
        assert.ok(world.spawnPosition[1] >= 0.15, 'arrival stays dry');
        for (const [a, b] of [...world.paths, world.shortcutPath]) {
            const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const steps = Math.ceil(length);
            let previous = generator.getHeight(a[0], a[2]);
            for (let index = 1; index <= steps; index++) {
                const t = index / steps;
                const height = generator.getHeight(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t);
                assert.ok(height >= 0.15, 'trail stays on dry ground');
                assert.ok(Math.abs(height - previous) / (length / steps) < 0.55, 'trail has no abrupt climb at POI pads');
                previous = height;
            }
        }
    }
});

test('campaign terrain is chunked with three LODs and identical boundary heights', () => {
    const generator = new CampaignWorldGenerator();
    const world = generator.generate('chunked-world', {}, false, { props: false });
    assert.ok(world.terrain.chunks.length > 150);
    assert.ok(world.terrain.chunks.every(chunk => chunk.levels.length === 3));
    const chunk = world.terrain.chunks[0];
    assert.ok(chunk.levels[0].positions.length > chunk.levels[1].positions.length);
    assert.ok(chunk.levels[1].positions.length > chunk.levels[2].positions.length);
    for (const level of chunk.levels) {
        assert.equal(level.positions[1], generator.getHeight(level.positions[0], level.positions[2]));
        assert.ok(level.normals.every(Number.isFinite));
    }
});
