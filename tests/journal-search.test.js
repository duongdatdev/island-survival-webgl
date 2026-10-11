import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { buildCampaignLandmarks } from '../src/gameplay/world/CampaignLandmarks.js';
import { CAMPAIGN_JOURNALS } from '../src/gameplay/CampaignStory.js';

test('six optional searches have reproducible clear-trail locations and usable local clues across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
        const world = new CampaignWorldGenerator().generate('journal-' + seed, {}, false, { mesh: false, props: false });
        const layout = buildCampaignLandmarks(world), sites = Object.values(layout.journalSearchSites);
        assert.equal(sites.length, 6);
        assert.deepEqual(buildCampaignLandmarks(world).journalSearchSites, layout.journalSearchSites);
        for (const site of sites) {
            const origin = world.pois.find(p => p.id === site.originId), destination = world.pois.find(p => p.id === site.destinationId);
            assert.ok(Math.hypot(site.base[0] - origin.position[0], site.base[2] - origin.position[2]) > 20);
            assert.ok(Math.hypot(site.base[0] - destination.position[0], site.base[2] - destination.position[2]) > 20);
            assert.equal(world.terrainGenerator._reserved(site.base[0], site.base[2]), true);
            for (const dx of [-1.5, 0, 1.5]) for (const dz of [-1.5, 0, 1.5]) {
                assert.ok(world.terrainGenerator.getHeight(site.base[0] + dx, site.base[2] + dz) > .15);
            }
            assert.deepEqual(layout.journals[site.id].position, site.position);
            assert.ok(layout.journals[site.clueId].text.includes(site.clue));
            assert.ok(site.clue.includes(origin.name)); assert.ok(site.clue.includes(destination.name));
            assert.ok(site.clue.includes(site.distance + ' m'));
            assert.ok(layout.models.some(model => model.id === 'search-crate-' + site.id));
        }
    }
    assert.ok(!CAMPAIGN_JOURNALS.camp_log.text.includes('Dấu vết người đi trước'), 'seeded hints must not mutate the shared story');
});
