import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';

test('campaign assets contain real renderable geometry and complete licensing records', async () => {
    const manifest = JSON.parse(await readFile('assets/campaign/manifest.json', 'utf8'));
    const io = new NodeIO();
    const ids = new Set();
    for (const model of manifest.models) {
        assert.equal(ids.has(model.id), false, `duplicate ${model.id}`);
        ids.add(model.id);
        const document = await io.read(model.path);
        assert.ok(document.getRoot().listMeshes().length, model.id);
        assert.ok(model.targetSize.every(size => Number.isFinite(size) && size > 0), model.id);
        assert.ok(model.source && model.license, model.id);
        assert.ok(model.triangles > 0, model.id);
    }
    for (const id of ['campaign_hook', 'campaign_smelter', 'campaign_fish_trap', 'campaign_smoker',
        'campaign_water_tank', 'campaign_dive_kit', 'campaign_antenna', 'campaign_foundation',
        'campaign_wall', 'campaign_door', 'campaign_crop_carrot_4', 'quaternius_fishing_rod', 'campaign_raft_sail', 'campaign_raft_motor',
        'campaign_raft_frame', 'campaign_raft_floats', 'campaign_raft_paddle',
        'survival_workbench', 'pirate_ship-wreck', 'cave_corridor']) assert.ok(ids.has(id), id);
    for (const license of manifest.licenses) assert.ok((await readFile(license, 'utf8')).length > 50);
});
