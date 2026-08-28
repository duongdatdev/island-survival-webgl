import test from 'node:test';
import assert from 'node:assert/strict';

import { SkyShader } from '../src/shaders/SkyShader.js';

test('sky shader never blends a black moon disc into the daytime sky', () => {
    assert.match(SkyShader.fragment, /float moonColorVisibility/);
    assert.match(
        SkyShader.fragment,
        /moonVisibility = smoothstep\(-0\.10, 0\.05, moonDir\.y\) \* moonColorVisibility/
    );
});
