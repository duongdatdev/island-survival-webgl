
const FULLSCREEN_VERTEX = `#version 300 es
    out vec2 vUv;

    void main() {
        vec2 pos = vec2(
            (gl_VertexID == 1) ? 3.0 : -1.0,
            (gl_VertexID == 2) ? 3.0 : -1.0
        );
        vUv = pos * 0.5 + 0.5;
        gl_Position = vec4(pos, 0.0, 1.0);
    }
`;

export const PostShader = {
    vertex: FULLSCREEN_VERTEX,

    brightPass: `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uScene;
        uniform float uThreshold;
        uniform float uSoftKnee;

        void main() {
            vec3 color = texture(uScene, vUv).rgb;
            float brightness = max(color.r, max(color.g, color.b));

            float knee = max(uSoftKnee, 0.0001);
            float contribution = clamp((brightness - uThreshold) / knee, 0.0, 1.0);
            contribution *= contribution;

            fragColor = vec4(color * contribution, 1.0);
        }
    `,

    blur: `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uSource;
        uniform vec2 uDirection;

        const float WEIGHTS[5] = float[5](0.227027, 0.194594, 0.121621, 0.054054, 0.016216);

        void main() {
            vec3 result = texture(uSource, vUv).rgb * WEIGHTS[0];
            for (int i = 1; i < 5; i++) {
                vec2 offset = uDirection * float(i);
                result += texture(uSource, vUv + offset).rgb * WEIGHTS[i];
                result += texture(uSource, vUv - offset).rgb * WEIGHTS[i];
            }
            fragColor = vec4(result, 1.0);
        }
    `,

    composite: `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uScene;
        uniform sampler2D uBloom;
        uniform float uBloomIntensity;
        uniform float uVignette;
        uniform float uExposure;
        uniform vec3  uTint;
        uniform sampler2D uDepth;
        uniform vec2 uInvResolution;
        uniform float uFXAA;
        uniform float uUnderwater;
        uniform float uUnderwaterDensity;
        uniform vec3 uUnderwaterColor;
        uniform float uCameraNear;
        uniform float uCameraFar;
        uniform float uAOIntensity;
        uniform float uAORadius;

        float luma(vec3 color) {
            return dot(color, vec3(0.299, 0.587, 0.114));
        }

        vec3 toneMap(vec3 color) {
            color = max(color, vec3(0.0));
            return clamp((color * (2.51 * color + 0.03))
                / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
        }

        vec3 linearToSrgb(vec3 color) {
            color = max(color, vec3(0.0));
            vec3 low = color * 12.92;
            vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
            return mix(high, low, lessThanEqual(color, vec3(0.0031308)));
        }

        float ambientOcclusionAt(vec2 uv, float centerDepth) {
            if (uAOIntensity <= 0.0) return 1.0;
            float z = centerDepth * 2.0 - 1.0;
            float centerDistance = (2.0 * uCameraNear * uCameraFar)
                / max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 0.0001);
            float occlusion = 0.0;
            for (int i = 0; i < 8; i++) {
                float angle = 6.2831853 * (float(i) / 8.0);
                vec2 offset = vec2(cos(angle), sin(angle)) * uAORadius * uInvResolution;
                float neighborDepth = texture(uDepth, uv + offset).r;
                float neighborZ = neighborDepth * 2.0 - 1.0;
                float neighborDistance = (2.0 * uCameraNear * uCameraFar)
                    / max(uCameraFar + uCameraNear - neighborZ * (uCameraFar - uCameraNear), 0.0001);
                occlusion += step(0.12, centerDistance - neighborDistance);
            }
            return 1.0 - uAOIntensity * occlusion * 0.125;
        }

        vec3 compositeLinearAt(vec2 uv) {
            vec3 color = texture(uScene, uv).rgb + texture(uBloom, uv).rgb * uBloomIntensity;
            color *= uExposure * uTint;
            if (uUnderwater > 0.5) {
                float depthSample = texture(uDepth, uv).r;
                float z = depthSample * 2.0 - 1.0;
                float distanceToSurface = (2.0 * uCameraNear * uCameraFar)
                    / max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 0.0001);
                float absorption = 1.0 - exp(-max(uUnderwaterDensity, 0.0) * distanceToSurface);
                color = mix(color, uUnderwaterColor, clamp(absorption, 0.0, 1.0));
            }
            color = toneMap(color);
            if (uVignette > 0.0) {
                float dist = length(uv - 0.5) * 1.4142;
                float falloff = smoothstep(0.55, 1.05, dist);
                color *= mix(1.0, 1.0 - uVignette, falloff);
            }
            return color;
        }

        vec3 applyFxaa(vec2 uv, vec3 center) {
            float lumaNW = luma(compositeLinearAt(uv + vec2(-1.0, -1.0) * uInvResolution));
            float lumaNE = luma(compositeLinearAt(uv + vec2( 1.0, -1.0) * uInvResolution));
            float lumaSW = luma(compositeLinearAt(uv + vec2(-1.0,  1.0) * uInvResolution));
            float lumaSE = luma(compositeLinearAt(uv + vec2( 1.0,  1.0) * uInvResolution));
            float lumaM = luma(center);
            float rangeMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
            float rangeMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
            float range = rangeMax - rangeMin;
            if (range < max(0.0312, rangeMax * 0.125)) return center;
            vec2 direction;
            direction.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
            direction.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
            float reduction = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.125), 1.0 / 128.0);
            float inverseMin = 1.0 / (min(abs(direction.x), abs(direction.y)) + reduction);
            direction = clamp(direction * inverseMin, vec2(-8.0), vec2(8.0)) * uInvResolution;
            vec3 a = 0.5 * (compositeLinearAt(uv + direction * (1.0 / 3.0 - 0.5))
                + compositeLinearAt(uv + direction * (2.0 / 3.0 - 0.5)));
            vec3 b = a * 0.5 + 0.25 * (compositeLinearAt(uv + direction * -0.5)
                + compositeLinearAt(uv + direction * 0.5));
            float lumaB = luma(b);
            return (lumaB < rangeMin || lumaB > rangeMax) ? a : b;
        }

        void main() {
            vec3 color = compositeLinearAt(vUv);
            if (uFXAA > 0.5) color = applyFxaa(vUv, color);
            if (uAOIntensity > 0.0) color *= ambientOcclusionAt(vUv, texture(uDepth, vUv).r);
            fragColor = vec4(linearToSrgb(color), 1.0);
        }
    `,
};

// Kept in sync with the composite shader so CPU-side graphics checks can verify
// the tone curve without relying on shader-source inspection.
export function toneMapACESChannel(value) {
    const x = Math.max(0, value);
    return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
}
