
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

        void main() {
            vec3 scene = texture(uScene, vUv).rgb;
            vec3 bloom = texture(uBloom, vUv).rgb;

            vec3 color = scene + bloom * uBloomIntensity;
            color *= uExposure * uTint;

            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            vec3 rolled = color / (1.0 + color);
            color = mix(color, rolled, smoothstep(0.85, 1.8, luma));

            if (uVignette > 0.0) {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 1.4142;
                float falloff = smoothstep(0.55, 1.05, dist);
                color *= mix(1.0, 1.0 - uVignette, falloff);
            }

            fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
    `,
};
