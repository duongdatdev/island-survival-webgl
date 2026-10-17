import test from 'node:test';
import assert from 'node:assert/strict';
import { Deer } from '../src/entities/BiomeWildlife.js';
import { CreatureState } from '../src/entities/Creature.js';
import { SURFACE_MOTION_GLSL } from '../src/shaders/SurfaceMotion.js';

function motionCapture() {
    const uniforms = {}, values = {};
    return { uniforms, values, setUniform1f: (name, value) => { uniforms[name] = value; (values[name] ||= []).push(value); },
        setUniformMatrix4fv() {}, draw() {} };
}

test('wildlife motion changes gait with state while keeping dead bodies still', () => {
    const deer = new Deer(null, [2, 1, 3], { draw() {} });
    const shader = motionCapture();
    deer.state = CreatureState.IDLE;
    deer.draw(shader);
    assert.deepEqual(shader.values.uCreatureMotion.slice(-2), [1, 0]);
    assert.equal(shader.uniforms.uMotionGait, 0);

    deer.state = CreatureState.PATROL;
    deer.draw(shader);
    assert.deepEqual(shader.values.uCreatureMotion.slice(-2), [1, 0]);
    assert.equal(shader.uniforms.uMotionGait, 0.46);

    deer.state = CreatureState.DEAD;
    deer.draw(shader);
    assert.deepEqual(shader.values.uCreatureMotion.slice(-2), [0, 0]);
    assert.match(SURFACE_MOTION_GLSL, /footMask/);
    assert.match(SURFACE_MOTION_GLSL, /uMotionBoundsMin/);
});
