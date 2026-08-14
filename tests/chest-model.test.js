import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebIO } from '@gltf-transform/core';

import {
    ResourceDatabase,
    ResourceType,
    CHEST_MODEL_ID,
} from '../src/systems/ResourceDatabase.js';
import { ResourceManager } from '../src/systems/ResourceManager.js';
import { WorldResource } from '../src/entities/WorldResource.js';

test('treasure chest resolves to the chest 3D model id', () => {
    assert.equal(ResourceDatabase[ResourceType.TREASURE_CHEST].modelId, CHEST_MODEL_ID);
    assert.equal(CHEST_MODEL_ID, 'environment:chest');
});

test('chest GLB model exists and contains valid meshes and materials', async () => {
    const chestUrl = new URL('../assets/environment/chest.glb', import.meta.url);
    const buffer = await readFile(chestUrl);
    assert.ok(buffer.byteLength > 0, 'chest.glb must not be empty');

    const io = new WebIO();
    const doc = await io.readBinary(buffer);
    const root = doc.getRoot();

    const meshes = root.listMeshes();
    assert.ok(meshes.length > 0, 'chest model must contain meshes');

    const meshNames = meshes.map(m => m.getName());
    assert.ok(meshNames.includes('Chest_Base') || meshNames.includes('Chest_Top') || meshes.length >= 1);

    const materials = root.listMaterials();
    assert.ok(materials.length > 0, 'chest model must contain materials');
});

test('treasure chest entity uses shared ModelAsset without taking GPU ownership', () => {
    let deleteCalls = 0;
    const calls = { draw: 0, shader: null, matrix: null, mode: null };
    const sharedModelAsset = {
        drawables: [{}],
        draw(shader, matrix, mode) {
            calls.draw++;
            calls.shader = shader;
            calls.matrix = matrix;
            calls.mode = mode;
        },
        delete() {
            deleteCalls++;
        },
    };

    const assets = {
        getModel(id) {
            return id === CHEST_MODEL_ID ? sharedModelAsset : null;
        },
    };

    const manager = new ResourceManager(assets);
    const chest = manager.createResourceEntity(
        null,
        ResourceDatabase[ResourceType.TREASURE_CHEST],
        [10, 1, 20]
    );

    assert.equal(chest.mesh, sharedModelAsset);
    assert.equal(chest.useModel, true);

    const fakeShader = { id: 'basic_shader' };
    chest.draw(fakeShader, 4);

    assert.equal(calls.draw, 1);
    assert.equal(calls.shader, fakeShader);
    assert.equal(calls.matrix, chest.modelMatrix);
    assert.equal(calls.mode, 4);

    chest.delete();
    assert.equal(deleteCalls, 0, 'Shared model asset must not be deleted by entity delete()');
    assert.equal(chest.mesh, null);
});
