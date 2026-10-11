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
