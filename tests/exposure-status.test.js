import test from 'node:test';
import assert from 'node:assert/strict';

import { GameScene } from '../src/scenes/GameScene.js';
import { ExposureSystem } from '../src/systems/ExposureSystem.js';

function createClassList() {
    const values = new Set(['hidden']);
    return {
        toggle(name, enabled) {
            if (enabled) values.add(name);
            else values.delete(name);
        },
        contains: name => values.has(name),
    };
}

test('exposure status updates icons and notifies once per state transition', () => {
    const scene = Object.create(GameScene.prototype);
    const notifications = [];
    const wetnessIcon = {
        textContent: '',
        classList: createClassList(),
        setAttribute() {},
    };
    const coldVignette = { style: { opacity: '0' } };
    scene.exposure = new ExposureSystem({ warmth: 35, wetness: 55 });
    scene._lastExposureState = 'normal';
    scene._domCache = { wetnessIcon, coldVignette };
    scene._updateVitalBar = () => {};
    scene._showNotification = message => notifications.push(message);

    scene._updateExposureStatus();
    scene._updateExposureStatus();
    assert.equal(notifications.length, 1);
    assert.equal(wetnessIcon.textContent, '💦');
    assert.equal(wetnessIcon.classList.contains('hidden'), false);
    assert.ok(Number(coldVignette.style.opacity) > 0);

    scene.exposure.setState({ warmth: 10, wetness: 85 });
    scene._updateExposureStatus();
    scene.exposure.setState({ warmth: 60, wetness: 0 });
    scene._updateExposureStatus();
    assert.equal(notifications.length, 3);
    assert.equal(wetnessIcon.classList.contains('hidden'), true);
    assert.equal(coldVignette.style.opacity, '0');
});
