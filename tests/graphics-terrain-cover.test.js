import test from 'node:test';
import assert from 'node:assert/strict';
import { GroundCover } from '../src/renderer/GroundCover.js';
import { Terrain } from '../src/entities/Terrain.js';
import { EnvironmentBatch } from '../src/renderer/EnvironmentBatch.js';
import { LandmarkDetails } from '../src/renderer/LandmarkDetails.js';

function createMockGL() {
    let nextId = 0;
    const calls = { instancedDraws: 0, buffersDeleted: 0, vaosDeleted: 0, programsDeleted: 0 };
    const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 10, STATIC_DRAW: 6, DYNAMIC_DRAW: 7, FLOAT: 8, TRIANGLES: 9,
        UNSIGNED_SHORT: 11,
        createShader: () => ({ id: ++nextId }), shaderSource() {}, compileShader() {},
        getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader() {},
        createProgram: () => ({ id: ++nextId }), attachShader() {}, linkProgram() {},
        getProgramParameter: () => true, getProgramInfoLog: () => '', deleteProgram() { calls.programsDeleted++; },
        createVertexArray: () => ({ id: ++nextId }), bindVertexArray() {},
        deleteVertexArray() { calls.vaosDeleted++; }, createBuffer: () => ({ id: ++nextId }),
        bindBuffer() {}, bufferData() {}, deleteBuffer() { calls.buffersDeleted++; },
        vertexAttribPointer() {}, enableVertexAttribArray() {}, vertexAttribDivisor() {},
        disableVertexAttribArray() {}, vertexAttrib3f() {}, vertexAttrib4f() {}, vertexAttrib2f() {},
        getUniformLocation: (_program, name) => ({ name }), useProgram(program) { calls.activeProgram = program; },
        uniformMatrix4fv() {}, uniform3fv() {}, uniform1f() {}, uniform1i() {},
        drawArraysInstanced() { calls.instancedDraws++; },
        drawElementsInstanced(_mode, _count, _type, _offset, instances) {
            calls.instancedDraws++;
            calls.lastInstanceCount = instances;
        },
    };
    return { gl, calls };
}

function fixture(seed = 'cover-seed') {
    return {
        seed,
        terrainGenerator: {
            seed,
            getHeight: (x, z) => 1.2 + Math.sin(x * 0.01) * Math.cos(z * 0.01),
            getBiome: () => 'Jungle',
            getNormal: () => [0, 1, 0],
            _reserved: (x, z) => Math.hypot(x, z) < 8,
        },
    };
}

test('ground cover is seed stable, respects reserved gameplay space, and pools nearby cells', () => {
    const first = new GroundCover(createMockGL().gl, fixture());
    const second = new GroundCover(createMockGL().gl, fixture());
    first.update([24, 0, 30], { density: 0.7, viewDistance: 75 });
    second.update([24, 0, 30], { density: 0.7, viewDistance: 75 });

    const serialize = cover => cover.activeGrass.concat(cover.activePebbles)
        .map(item => [item.kind, ...item.position, item.scale, item.rotation]);
    assert.deepEqual(serialize(first), serialize(second));
    assert.ok(first.activeGrass.length + first.activePebbles.length > 0);
    assert.ok(first.activeGrass.concat(first.activePebbles).every(item => Math.hypot(item.position[0], item.position[2]) >= 8));
    assert.ok(first.cells.size <= 320);

    first.update([1200, 0, -900], { density: 1, viewDistance: 180 });
    assert.ok(first.cells.size <= 320);
    first.delete();
    second.delete();
});

test('ground cover batches instances and releases GPU resources once', () => {
    const { gl, calls } = createMockGL();
    const cover = new GroundCover(gl, fixture('draw-seed'));
    cover.update([36, 0, 36], { density: 0.8, viewDistance: 55 });
    const camera = { viewMatrix: new Float32Array(16), projectionMatrix: new Float32Array(16) };
    cover.draw(camera);
    assert.ok(calls.instancedDraws >= 1);

    cover.delete();
    cover.delete();
    assert.equal(calls.programsDeleted, 1);
    assert.equal(calls.vaosDeleted, 4);
    assert.equal(calls.buffersDeleted, 8);
});

test('terrain chunk LOD has hysteresis and frustum-culls sphere bounds', () => {
    const terrain = Object.create(Terrain.prototype);
    const nearDraws = [0, 0, 0], outsideDraws = [0, 0, 0];
    terrain.modelMatrix = new Float32Array(16);
    terrain.mesh = null;
    terrain.viewPosition = [0, 0, 0];
    terrain.viewDistance = 100;
    terrain.chunkMeshes = [
        { center: [10, 3, 0], radius: 4, meshes: nearDraws.map((_, i) => ({ draw: () => nearDraws[i]++ })) },
        { center: [20, 3, 0], radius: 4, meshes: outsideDraws.map((_, i) => ({ draw: () => outsideDraws[i]++ })) },
    ];
    const frustumCalls = [];
    const frustum = { containsSphere: (x, y, z, radius) => {
        frustumCalls.push([x, y, z, radius]);
        return x < 15;
    } };
    terrain.draw({ setUniformMatrix4fv() {} }, frustum);
    assert.equal(terrain.lastChunkDraws, 1);
    assert.equal(nearDraws.reduce((sum, value) => sum + value, 0), 1);
    assert.deepEqual(outsideDraws, [0, 0, 0]);
    assert.deepEqual(frustumCalls, [[10, 3, 0, 4], [20, 3, 0, 4]]);

    const chunk = {};
    assert.equal(terrain._selectChunkLod(chunk, 40), 0);
    assert.equal(terrain._selectChunkLod(chunk, 86), 0);
    assert.equal(terrain._selectChunkLod(chunk, 89), 1);
    assert.equal(terrain._selectChunkLod(chunk, 160), 1);
    assert.equal(terrain._selectChunkLod(chunk, 169), 2);
    assert.equal(terrain._selectChunkLod(chunk, 156), 2);
    assert.equal(terrain._selectChunkLod(chunk, 151), 1);
});

test('environment batches standing entities, skips falling trees every frame, and deletes batch resources', () => {
    const { gl, calls } = createMockGL();
    const sharedMesh = {
        positionsBuffer: {}, normalsBuffer: {}, colorsBuffer: {}, texCoordsBuffer: {}, indexBuffer: {},
        hasIndices: true, indexCount: 6, indexType: gl.UNSIGNED_SHORT,
    };
    const makeEntity = (x, treeState = 'none') => ({
        mesh: sharedMesh,
        treeState,
        modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]),
        cullingCenter: [x, 0, 0],
        cullingRadius: 2,
    });
    const standingTree = makeEntity(8, 'standing');
    const fallingTree = makeEntity(9, 'falling');
    const staticProp = makeEntity(10);
    const outOfView = makeEntity(80);
    const entities = [standingTree, fallingTree, staticProp, outOfView];
    const batch = new EnvironmentBatch(gl, entities);
    const camera = { position: [0, 0, 0], viewMatrix: new Float32Array(16), projectionMatrix: new Float32Array(16) };
    const frustum = { containsSphere: x => x < 50 };
    let lightingBindings = 0;

    assert.equal(batch.draw(camera, frustum, { viewDistance: 40, applyLighting: () => lightingBindings++ }), 2);
    assert.equal(calls.lastInstanceCount, 2);
    assert.equal(lightingBindings, 1);

    fallingTree.treeState = 'standing';
    assert.equal(batch.draw(camera, frustum, { viewDistance: 40 }), 3);
    assert.equal(calls.lastInstanceCount, 3);
    fallingTree.treeState = 'falling';
    assert.equal(batch.draw(camera, frustum, { viewDistance: 40, depthOnly: true }), 2);
    assert.equal(calls.activeProgram, batch.depthProgram.program);
    assert.equal(calls.lastInstanceCount, 2);

    batch.delete();
    batch.delete();
    assert.equal(calls.programsDeleted, 2);
    assert.equal(calls.vaosDeleted, 1);
    assert.equal(calls.buffersDeleted, 1);
});

test('landmark details are seed-stable, instanced, terrain grounded, and disposable', () => {
    const makeWorld = () => ({
        seed: 'detail-seed',
        landmarks: { waterfall: [18, 1, 8] },
        pois: [{ id: 'abandoned_camp', role: 'camp', position: [-18, 1, -8] }],
        terrainGenerator: {
            island: { radius: 45 },
            getHeight: (x, z) => 0.8 + Math.sin(x * 0.03) * 0.1,
            getBiome: (x, z) => Math.abs(x) < 28 && Math.abs(z) < 28 ? 'Mangrove' : 'Jungle',
            getNormal: () => [0, 1, 0],
            _reserved: (x, z) => Math.hypot(x - 18, z - 8) < 9 || Math.hypot(x + 18, z + 8) < 16,
        },
    });
    const { gl, calls } = createMockGL();
    const details = new LandmarkDetails(gl, makeWorld());
    const replica = new LandmarkDetails(createMockGL().gl, makeWorld());
    const summarize = value => [...value.groups.entries()].map(([kind, group]) =>
        [kind, group.instances.map(item => [...item.position, ...item.matrix.slice(0, 12)])]);
    assert.deepEqual(summarize(details), summarize(replica));
    assert.ok(details.groups.get('rock')?.instances.length > 0);
    assert.ok(details.groups.get('puddle')?.instances.length > 0);
    assert.ok([...details.groups.values()].every(group => group.instances.every(item => item.position[1] >= 0.45)));

    const camera = { position: [0, 0, 0], viewMatrix: new Float32Array(16), projectionMatrix: new Float32Array(16) };
    let lightingBindings = 0;
    assert.ok(details.draw(camera, { viewDistance: 220, applyLighting: () => lightingBindings++ }) > 0);
    assert.equal(lightingBindings, 1);
    details.delete();
    details.delete();
    replica.delete();
    assert.equal(calls.programsDeleted, 1);
    assert.ok(calls.vaosDeleted > 0);
    assert.ok(calls.buffersDeleted > 0);
});
