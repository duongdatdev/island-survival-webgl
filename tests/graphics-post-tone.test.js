import test from 'node:test';
import assert from 'node:assert/strict';
import { toneMapACESChannel } from '../src/shaders/PostShader.js';

test('ACES tone mapping stays bounded and monotonic across SDR and HDR inputs', () => {
    let previous = toneMapACESChannel(0);
    assert.equal(previous, 0);
    for (let i = 1; i <= 10000; i++) {
        const mapped = toneMapACESChannel(i / 1000);
        assert.ok(mapped >= previous, `tone mapping decreased at input ${i / 1000}`);
        assert.ok(mapped >= 0 && mapped <= 1, `tone mapping escaped display range at input ${i / 1000}`);
        previous = mapped;
    }
    assert.ok(toneMapACESChannel(1.4) > toneMapACESChannel(1.2));
    assert.ok(toneMapACESChannel(1.8) > toneMapACESChannel(1.4));
});
