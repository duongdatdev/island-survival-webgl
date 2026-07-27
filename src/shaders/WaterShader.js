import { WAVE_GLSL, BASE_AMPLITUDE, BASE_SPEED } from './WaterWaves.js';

/**
 * Ocean water shader.
 *
 * The surface itself comes from WaterWaves.js, which gameplay code shares, so
 * anything floating rides the exact geometry being drawn here. This file adds
 * the shading on top: an analytic normal, a Fresnel-driven blend towards the
 * horizon, depth-graded colour and two kinds of foam.
 *
 * Scene-specific behaviour is selected by separate strength uniforms
 * (uDetailStrength, uFoamStrength, uSunGlitter) rather than by overloading one
 * flag. Every one of them disables its feature at zero, so a scene pays only
 * for what it asks for.
 */

/** Menu and gameplay both need these to build matching uniform values. */
export const WaterConstants = { BASE_AMPLITUDE, BASE_SPEED };

export const WaterShader = {
    vertex: `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
        // Baked by Water.js from the seabed underneath, not a texture lookup:
        // x = depth 0..1 (0 at the waterline, 1 offshore), y = shore band.
        layout(location = 3) in vec2 aTexCoord;

        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;

        uniform float uTime;
        uniform float uWaveEnable;
        uniform float uWaveAmplitude;
        uniform float uWaveSpeed;
        uniform float uWaveAttenStart;
        uniform float uWaveAttenEnd;
        // Wind heading; the whole wave field rotates with it.
        uniform vec2 uWaveHeading;

        out vec3 vWorldPosition;
        out vec4 vColor;
        // dh/dx and dh/dz of the displaced surface. Shading from this instead
        // of dFdx(worldPos) is what stops a 2 m grid reading as flat panels.
        out vec2 vSlope;
        // Crest height in [-1, 1], attenuation folded in so damped water near
        // the beach grows no crest foam.
        out float vCrest;
        out float vDepth;
        out float vShore;

${WAVE_GLSL}

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);

            vec2 slope = vec2(0.0);
            float crest = 0.0;

            if (uWaveEnable > 0.5) {
                // Guard the default-zero uniform: an unset heading would
                // collapse every wave vector and pump the plane flat.
                vec2 heading = length(uWaveHeading) > 0.001
                    ? normalize(uWaveHeading)
                    : vec2(1.0, 0.0);

                float atten = clamp(
                    (length(worldPos.xz) - uWaveAttenStart)
                        / max(uWaveAttenEnd - uWaveAttenStart, 0.0001),
                    0.0, 1.0);

                float height;
                vec2 unitSlope;
                oceanWave(worldPos.xz, uTime * ${BASE_SPEED.toFixed(4)} * uWaveSpeed,
                          heading, height, unitSlope);

                float amplitude = ${BASE_AMPLITUDE.toFixed(4)} * uWaveAmplitude * atten;
                worldPos.y += height * amplitude;

                // Scaling both by the same amplitude keeps the normal exact.
                slope = unitSlope * amplitude;
                crest = height * atten;
            }

            vWorldPosition = worldPos.xyz;
            vColor = aColor;
            vSlope = slope;
            vCrest = crest;
            vDepth = aTexCoord.x;
            vShore = aTexCoord.y;

            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec3 vWorldPosition;
        in vec4 vColor;
        in vec2 vSlope;
        in float vCrest;
        in float vDepth;
        in float vShore;

        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        uniform vec3 uViewPosition;
        uniform float uTime;
        uniform float uLightningFlash;

        // Sky colour at the waterline. Fresnel leans the surface towards it at
        // grazing angles, which is most of what sells water as reflective.
        uniform vec3 uHorizonColor;
        // Colour of water over a shallow seabed; deep water keeps vColor.
        uniform vec3 uShallowColor;

        // Per-pixel ripple normals layered on top of the vertex slope. Zero
        // strength skips them entirely.
        uniform float uDetailStrength;
        // Surf along the shoreline. Zero disables it.
        uniform float uFoamStrength;
        // Whitecaps out at sea. Separate from the shore band because they are
        // a wind phenomenon: a calm sea still has surf, but no breaking crests.
        uniform float uWhitecaps;

        // Distance haze that fades the ocean into the sky colour. Zero density
        // disables it, which is what GameScene gets by never setting these.
        uniform vec3 uFogColor;
        uniform float uFogStart;
        uniform float uFogDensity;

        // Sun glitter — the broken path of light running back to a low sun.
        // Zero intensity disables it, so only the menu pays for the extra work.
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uSunGlitter;

        out vec4 fragColor;

        void main() {
            vec2 slope = vSlope;

            if (uDetailStrength > 0.0) {
                // Five ripple trains at non-harmonic frequencies and spread
                // headings. Three was not enough — the sum stayed periodic
                // enough to read as woven fabric rather than open water. These
                // are far too fine to survive tessellation, which is exactly
                // why they live here and not in the vertex wave field.
                vec2 rp = vWorldPosition.xz;
                float c1 = cos(rp.x * 1.6 + rp.y * 1.25 + uTime * 0.80);
                float c2 = cos(rp.x * 5.6 - rp.y * 4.30 + uTime * 1.70);
                float c3 = cos(rp.x * 9.5 + rp.y * 7.40 - uTime * 2.10);
                float c4 = cos(rp.x * -3.7 + rp.y * 6.10 + uTime * 1.30);
                float c5 = cos(rp.x * 13.3 - rp.y * 9.10 - uTime * 2.60);

                // Fine chop is damped with distance so it never falls below a
                // pixel and shimmers on the run-up to the horizon.
                float chop = exp(-length(vWorldPosition - uViewPosition) * 0.012);

                slope.x += uDetailStrength *
                    (0.050 * c1 + (0.052 * c2 + 0.036 * c3 - 0.020 * c4 + 0.022 * c5) * chop);
                slope.y += uDetailStrength *
                    (0.039 * c1 + (-0.040 * c2 + 0.028 * c3 + 0.033 * c4 - 0.015 * c5) * chop);
            }

            vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
            vec3 L = normalize(uLightDirection);
            vec3 V = normalize(uViewPosition - vWorldPosition);

            vec3 ambient = uAmbientColor * uAmbientIntensity;

            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * uLightColor * uLightIntensity;

            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 128.0);
            vec3 specular = spec * uLightColor * uLightIntensity * 0.75;

            if (uSunGlitter > 0.0) {
                // A second, much wider lobe aimed at the real sun: the ripple
                // normals scatter it into the broken path of light that reads
                // as "the sun is over there".
                vec3 SH = normalize(normalize(uSunDirection) + V);
                float glint = pow(max(dot(N, SH), 0.0), 55.0);
                specular += glint * uSunColor * uSunGlitter;
            }

            // Shallows read turquoise because the seabed bounces light back
            // through a short water column; deep water keeps the vertex blue.
            vec3 baseColor = mix(uShallowColor, vColor.rgb, vDepth);

            float foam = 0.0;
            if (uFoamStrength > 0.0 || uWhitecaps > 0.0) {
                // Foam sits on crests, keyed off the normalised wave height.
                // The old version thresholded fract(worldY * 8.0), which on
                // this amplitude range drew arbitrary contour lines that traced
                // the polygon edges rather than the crests.
                //
                // The window is deliberately narrow: only ~1% of the surface
                // reaches 0.82, which is about what a wind-blown sea actually
                // breaks. A lower threshold turns the whole ocean into stripes.
                float crestFoam = smoothstep(0.82, 0.97, vCrest) * uWhitecaps;

                // Shore foam: a band whose edge surges in and out, so the
                // waterline is the busiest part of the ocean instead of the
                // deadest — attenuation kills the wave itself right there.
                float surge = 0.42 + 0.30 * sin(uTime * 1.15
                    + vWorldPosition.x * 0.35 + vWorldPosition.z * 0.28);
                float shoreFoam = smoothstep(surge, surge + 0.20, vShore) * uFoamStrength;

                foam = clamp(crestFoam + shoreFoam, 0.0, 1.0);
                baseColor = mix(baseColor, vec3(0.86, 0.94, 1.0), foam * 0.7);
            }

            vec3 finalColor = (ambient + diffuse) * baseColor + specular;

            // Schlick with water's F0. Looking straight down the surface is
            // nearly clear; at a grazing angle it turns into the sky.
            //
            // The mix is capped well below 1.0 on purpose. Physically the
            // ocean at eye level is nearly a mirror, but a full-strength blend
            // greys out the whole sea and turns every swell into a pale band —
            // the sky here is a flat gradient with nothing worth reflecting.
            float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
            finalColor = mix(finalColor, uHorizonColor, fresnel * 0.18);

            finalColor += uLightningFlash * vec3(0.8, 0.9, 1.0) * 0.5;

            if (uFogDensity > 0.0) {
                float d = max(length(vWorldPosition - uViewPosition) - uFogStart, 0.0) * uFogDensity;
                finalColor = mix(finalColor, uFogColor, clamp(1.0 - exp(-d * d), 0.0, 1.0));
            }

            // Transparency follows the same two rules as the colour: shallow
            // water lets the sand through, grazing water goes opaque. Foam is
            // spray sitting on top, so it is never see-through.
            float alpha = mix(mix(0.45, 0.85, vDepth), 0.97, fresnel);
            alpha = max(alpha, foam * 0.95);

            fragColor = vec4(finalColor, alpha);
        }
    `
};
