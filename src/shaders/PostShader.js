/**
 * Post-processing shader sources (v1.0) — WebGL 2 / GLSL 3.00 es.
 *
 * All passes share a single fullscreen-triangle vertex shader that synthesizes
 * its own vertices from `gl_VertexID`, so no VBO or VAO attribute setup is
 * needed and the passes can't be disturbed by whatever vertex state the scene
 * left bound.
 */

const FULLSCREEN_VERTEX = `#version 300 es
    out vec2 vUv;

    void main() {
        // Oversized triangle covering the clip-space viewport: vertex 0 at
        // (-1,-1), 1 at (3,-1), 2 at (-1,3).
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

    /**
     * Bright pass: keeps only what exceeds the bloom threshold, with a soft
     * knee so lighting that drifts across the threshold doesn't pop.
     */
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
            contribution *= contribution; // ease-in so the ramp isn't linear

            fragColor = vec4(color * contribution, 1.0);
        }
    `,

    /**
     * Separable 9-tap Gaussian. Run twice per bloom iteration with
     * uDirection = (1/w, 0) then (0, 1/h).
     */
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

    /**
     * Final composite: scene + bloom, highlight rolloff, vignette, and an
     * optional grade tint driven by the time of day.
     *
     * The scene shaders write display-space colour (no linear→sRGB encode
     * anywhere in the pipeline), so this pass deliberately does *not* apply a
     * gamma curve or a full filmic tone map — either would visibly wash out
     * the existing art. Rolloff is limited to values bloom pushes past 1.0.
     */
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

            // Reinhard only where the image is already blown out, blended in by
            // luminance so mid-tones come through the pass unchanged.
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            vec3 rolled = color / (1.0 + color);
            color = mix(color, rolled, smoothstep(0.85, 1.8, luma));

            // Radial darkening. uVignette == 0 leaves the image untouched.
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
