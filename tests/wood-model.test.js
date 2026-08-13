import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    ResourceDatabase,
    ResourceType,
    WOOD_LOG_MODEL_ID,
} from '../src/systems/ResourceDatabase.js';
import { DebrisDatabase, DebrisType } from '../src/systems/DebrisDatabase.js';
import { ResourceManager } from '../src/systems/ResourceManager.js';

test('all raw wood pickups resolve to the Survival Pack wood-log model', async () => {
    assert.equal(ResourceDatabase[ResourceType.WOOD].modelId, WOOD_LOG_MODEL_ID);
    assert.equal(DebrisDatabase[DebrisType.WOOD].modelId, WOOD_LOG_MODEL_ID);

    const manifestUrl = new URL('../assets/survival-pack/survival-items.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const woodLog = manifest.items.find(item => `survival:${item.id}` === WOOD_LOG_MODEL_ID);

    assert.ok(woodLog, 'wood-log model must be present in the Survival Pack manifest');
    assert.match(woodLog.objPath, /WoodLog\.obj$/);
});

test('world wood uses the shared model without taking ownership of its GPU mesh', () => {
    let deleteCalls = 0;
    const sharedWoodMesh = {
        draw() {},
        delete() { deleteCalls++; },
    };
    const assets = {
        getModel(id) {
            return id === WOOD_LOG_MODEL_ID ? sharedWoodMesh : null;
        },
    };
    const manager = new ResourceManager(assets);
    const resource = manager.createResourceEntity(
        {},
        ResourceDatabase[ResourceType.WOOD],
        [1, 2, 3]
    );

    assert.equal(resource.mesh, sharedWoodMesh);
    assert.equal(resource.useModel, true);
    resource.delete();
    assert.equal(deleteCalls, 0);
});
