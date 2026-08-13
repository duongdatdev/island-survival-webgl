import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { Campfire } from '../src/entities/Campfire.js';

test('campfire renders the shared Survival Pack mesh without disposing it', () => {
    const calls = { draw: 0, delete: 0, matrix: null, mode: null };
    const sharedMesh = {
        draw(mode) {
            calls.draw++;
            calls.mode = mode;
        },
        delete() {
            calls.delete++;
        },
    };
    const shader = {
        setUniformMatrix4fv(name, matrix) {
            assert.equal(name, 'uModelMatrix');
            calls.matrix = matrix;
        },
    };

    const campfire = new Campfire(null, [3, 2, 1], sharedMesh);
    campfire.isBuilt = true;
    campfire.draw(shader, 4);

    assert.equal(calls.draw, 1);
    assert.equal(calls.mode, 4);
    assert.equal(calls.matrix, campfire.modelMatrix);

    campfire.delete();
    assert.equal(calls.delete, 0);
    assert.equal(campfire.modelMesh, null);
});

test('campfire exposes a compact flickering point light above the model', () => {
    const campfire = new Campfire(null, [3, 2, 1], { draw() {} });

    const initialLightPosition = campfire.getLightPosition();
    assert.ok(Math.abs(initialLightPosition[0] - 3) < 1e-6);
    assert.ok(Math.abs(initialLightPosition[1] - 2.45) < 1e-6);
    assert.ok(Math.abs(initialLightPosition[2] - 1) < 1e-6);
    assert.equal(campfire.lightRange, 4.5);
    assert.ok(Math.abs(campfire.lightColor[0] - 1.0) < 1e-6);
    assert.ok(Math.abs(campfire.lightColor[1] - 0.45) < 1e-6);
    assert.ok(Math.abs(campfire.lightColor[2] - 0.12) < 1e-6);
    assert.equal(campfire.lightIntensity, 2.8);

    campfire.isBuilt = true;
    campfire.update(0.25);
    assert.notEqual(campfire.lightIntensity, 2.8);

    campfire.position[0] = 7;
    campfire.position[1] = 4;
    campfire.position[2] = -2;
    const movedLightPosition = campfire.getLightPosition();
    assert.ok(Math.abs(movedLightPosition[0] - 7) < 1e-6);
    assert.ok(Math.abs(movedLightPosition[1] - 4.45) < 1e-6);
    assert.ok(Math.abs(movedLightPosition[2] + 2) < 1e-6);
});

test('survival manifest keeps the campfire out of drifting debris', async () => {
    const manifestUrl = new URL('../Assets/survival-pack/survival-items.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const campfire = manifest.items.find(item => item.id === 'bonfire_fire');

    assert.ok(campfire);
    assert.equal(campfire.objPath, 'assets/survival-pack/SurvivalPack/OBJ/Bonfire_Fire.obj');
    assert.equal(campfire.mtlPath, 'assets/survival-pack/SurvivalPack/OBJ/Bonfire_Fire.mtl');
    assert.equal(campfire.modelScale, 1.25);
    assert.deepEqual(campfire.materialColors.Fire, [3.0, 0.65, 0.05]);
    assert.equal(campfire.registerAsDebris, false);
});
