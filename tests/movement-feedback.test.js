import test from 'node:test';
import assert from 'node:assert/strict';

import { MovementFeedback } from '../src/systems/MovementFeedback.js';
import { Camera } from '../src/renderer/Camera.js';

test('footsteps are triggered by actual distance instead of held input time', () => {
    const feedback = new MovementFeedback();

    assert.equal(feedback.update(1, 0.6, 3.2, false).stepCount, 0);
    assert.equal(feedback.update(1, 0, 3.2, false).stepCount, 0);
    assert.equal(feedback.update(1, 0.65, 3.2, false).stepCount, 1);
});

test('reduced motion keeps footsteps but disables camera motion', () => {
    const feedback = new MovementFeedback({ reducedMotion: true });
    const state = feedback.update(1, 1.5, 4.4, true);

    assert.equal(state.stepCount, 1);
    assert.equal(state.fovBoostDegrees, 0);
    assert.equal(state.horizontalOffset, 0);
    assert.equal(state.verticalOffset, 0);
});

test('combat kick decays and reduced motion suppresses it', () => {
    const feedback = new MovementFeedback();
    feedback.triggerCombatKick(0.02);
    const kicked = feedback.update(1 / 60, 0, 0, false);
    const decayed = feedback.update(0.2, 0, 0, false);
    assert.ok(kicked.verticalOffset < -0.019);
    assert.ok(Math.abs(decayed.verticalOffset) < Math.abs(kicked.verticalOffset));

    const reduced = new MovementFeedback({ reducedMotion: true });
    reduced.triggerCombatKick(0.02);
    assert.equal(reduced.update(1 / 60, 0, 0, false).verticalOffset, 0);
});

test('sprint feedback smoothly approaches its fov boost', () => {
    const feedback = new MovementFeedback();
    const state = feedback.update(0.5, 2.2, 4.4, true);

    assert.ok(state.fovBoostDegrees > 3.9 && state.fovBoostDegrees < 4);
    assert.notEqual(state.verticalOffset, 0);
});

test('camera applies first person motion offsets without changing aim direction', () => {
    const camera = new Camera();
    camera._debug.enabled = false;
    camera.setMotionOffset(0.1, 0.2);
    camera.update(null, [0, 0, 0], 1);

    assert.ok(Math.abs(camera.position[0] - 0.1) < 1e-6);
    assert.ok(Math.abs(camera.position[1] - 1.2) < 1e-6);
    assert.ok(Math.abs(camera.target[0] - camera.position[0]) < 1e-6);
    assert.ok(Math.abs(camera.target[2] - camera.position[2] - 1) < 1e-6);
});

test('restored look angles drive the actual view and reject non-finite updates', () => {
    const camera = new Camera(); camera._debug.enabled = false;
    assert.equal(camera.setLookAngles(0.7, 0.2), true); camera.update(null, [10, 2, 3], 0.75);
    assert.ok(Math.abs(camera.target[0] - camera.position[0] - Math.sin(0.7) * Math.cos(0.2)) < 1e-6);
    assert.ok(Math.abs(camera.target[1] - camera.position[1] - Math.sin(0.2)) < 1e-6);
    const before = [camera._yaw, camera._pitch]; assert.equal(camera.setLookAngles(Infinity, 0), false);
    assert.deepEqual([camera._yaw, camera._pitch], before);
});
