import test from 'node:test';
import assert from 'node:assert/strict';
import { Mat4 } from '../src/math/Mat4.js';
import { ModelAsset } from '../src/renderer/ModelAsset.js';

function shaderMock() {
    const values = new Map(), history = new Map();
    const set = (name, value) => { values.set(name, value); if (!history.has(name)) history.set(name, []); history.get(name).push(value); };
    return {
        values, history,
        setUniform1i: set,
        setUniform1f: set,
        setUniform3fv: (name, value) => set(name, Array.from(value)),
        setUniformMatrix4fv: set,
    };
}

test('glTF material factors tolerate absent or broken optional accessors', () => {
    assert.deepEqual(ModelAsset._extractMaterialParameters({
        getRoughnessFactor: () => 0.32,
        getMetallicFactor: () => 0.71,
        getEmissiveFactor: () => [0.1, 0.2, 0.3],
        getNormalScale: () => 0.6,
        getOcclusionStrength: () => 0.45,
    }), {
        roughness: 0.32, metallic: 0.71, emissive: [0.1, 0.2, 0.3], normalScale: 0.6,
        materialAO: 1, aoStrength: 0.45,
    });
    assert.deepEqual(ModelAsset._extractMaterialParameters({
        getRoughnessFactor: () => { throw new Error('optional factor unavailable'); },
        getEmissiveFactor: () => [0, NaN, 1],
    }), {
        roughness: 0.85, metallic: 0, emissive: [0, 0, 0], normalScale: 1, materialAO: 1, aoStrength: 1,
    });
});

test('ModelAsset binds per-drawable linear color, PBR maps, and raw motion bounds then resets flags', () => {
    const boundUnits = [];
    const gl = {
        TEXTURE0: 100, TEXTURE_2D: 1,
        activeTexture(unit) { boundUnits.push(['active', unit - this.TEXTURE0]); },
        bindTexture(target, texture) { boundUnits.push(['bind', texture]); },
    };
    const texture = name => ({ bind(unit) { boundUnits.push([name, unit]); } });
    const drawable = {
        mesh: { bounds: { min: [-1,-2,-3], max: [1,2,3] }, draw() {} },
        localMatrix: Mat4.create(), texture: texture('base'), normalTexture: texture('normal'),
        aoTexture: texture('ao'), emissiveTexture: texture('emissive'),
        metallicRoughnessTexture: texture('mr'), roughness: 0.4, metallic: 0.7,
        emissive: [0.2,0.1,0], materialAO: 0.8, aoStrength: 0.8, normalScale: 0.6,
        motionBoundsMin: [-1,-2,-3], motionBoundsMax: [1,2,3],
    };
    const asset = new ModelAsset(gl, [drawable], []);
    const shader = shaderMock();
    asset.draw(shader, Mat4.create());

    for (const [name, value] of [
        ['uVertexColorLinear',1], ['uUseBaseColorTexture',1], ['uUseNormalTexture',1],
        ['uUseAOTexture',1], ['uUseEmissiveTexture',1], ['uUseMetallicRoughnessTexture',1],
        ['uRoughness',0.4], ['uMetallic',0.7], ['uNormalScale',0.6],
    ]) assert.equal(shader.history.get(name)[0], value);
    assert.deepEqual(shader.history.get('uMotionBoundsMin')[0], [-1,-2,-3]);
    assert.deepEqual(shader.history.get('uMotionBoundsMax')[0], [1,2,3]);
    assert.deepEqual(boundUnits.filter(entry => ['base','normal','ao','emissive','mr'].includes(entry[0])),
        [['base',0],['normal',3],['ao',4],['emissive',5],['mr',6]]);
    assert.equal(shader.values.get('uVertexColorLinear'), 0);
    assert.equal(shader.values.get('uUseNormalTexture'), 0);
    assert.equal(shader.values.get('uRoughness'), 0.85);
    assert.equal(shader.values.get('uMaterialAO'), 1);
});
