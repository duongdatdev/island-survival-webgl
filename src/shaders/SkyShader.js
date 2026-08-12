/**
 * Sky shader (v2.0) — dynamic day/night procedural sky dome.
 *
 * Supports:
 * - Dynamic sky gradient that changes with time of day (sunrise/sunset/night)
 * - Procedural sun with corona, bloom and god-rays
 * - Procedural moon with craters and earthshine
 * - Twinkling stars that fade in/out with sky brightness
 * - Cirrus clouds tinted by the current sky colors
 * - Sub-LSB dithering to eliminate banding on dark skies
 *
 * The vertex stage synthesizes its own geometry from `gl_VertexID` (the same
 * trick as PostShader), so the caller only has to bind an empty VAO.
 */

/**
 * Default colour stops — used by MainMenuScene as a fixed dusk palette.
 * GameScene passes dynamic values from DayNightCycle instead.
 */
const PALETTE = {
    horizon: [0.62, 0.35, 0.13],
    mid: [0.11, 0.13, 0.25],
    zenith: [0.020, 0.034, 0.082],
    sun: [1.00, 0.74, 0.40],
};

const VERTEX = `#version 300 es
    out vec2 vUv;

    void main() {
        // Oversized triangle covering clip space: vertex 0 at (-1,-1),
        // 1 at (3,-1), 2 at (-1,3).
        vec2 pos = vec2(
            (gl_VertexID == 1) ? 3.0 : -1.0,
            (gl_VertexID == 2) ? 3.0 : -1.0
        );
        vUv = pos * 0.5 + 0.5;
        gl_Position = vec4(pos, 0.0, 1.0);
    }
`;

const FRAGMENT = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 fragColor;

    uniform mat4 uInvViewProj;
    uniform vec3 uCameraPos;

    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSkyMid;
    uniform vec3 uSkyZenith;

    // Moon direction is opposite to sun
    uniform vec3 uMoonDirection;
    uniform vec3 uMoonColor;

    // How much of a "sunset" tint to apply (0 = day/night, 1 = full sunset)
    uniform float uSunsetAmount;

    uniform float uTime;

    // ────────────────────────────────────────────────────────────────────────
    // Hash / noise
    // ────────────────────────────────────────────────────────────────────────
    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    float hash31(vec3 p) {
        p = fract(p * vec3(123.34, 456.21, 789.53));
        p += dot(p, p.yzx + 45.32);
        return fract(p.x * p.y * p.z);
    }

    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            sum += valueNoise(p) * amp;
            p = p * 2.03 + vec2(11.3, 7.7);
            amp *= 0.5;
        }
        return sum;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Moon surface (craters)
    // ────────────────────────────────────────────────────────────────────────
    float moonCraters(vec2 uv) {
        float craters = 0.0;
        // Large craters
        for (float i = 0.0; i < 6.0; i++) {
            vec2 center = vec2(
                hash21(vec2(i * 13.7, 7.3)) * 1.4 - 0.7,
                hash21(vec2(i * 5.1, 19.3)) * 1.4 - 0.7
            );
            float radius = 0.08 + hash21(vec2(i * 3.3, 11.1)) * 0.14;
            float d = length(uv - center);
            float rim = smoothstep(radius, radius - 0.02, d) - smoothstep(radius - 0.02, radius - 0.06, d);
            float basin = smoothstep(radius - 0.02, radius - 0.08, d) * 0.3;
            craters += rim * 0.35 - basin;
        }
        // Small craters
        for (float i = 0.0; i < 12.0; i++) {
            vec2 center = vec2(
                hash21(vec2(i * 23.7, 17.3)) * 1.6 - 0.8,
                hash21(vec2(i * 15.1, 29.3)) * 1.6 - 0.8
            );
            float radius = 0.02 + hash21(vec2(i * 7.3, 31.1)) * 0.05;
            float d = length(uv - center);
            craters += smoothstep(radius, radius - 0.01, d) * 0.15;
        }
        return craters;
    }

    void main() {
        // Unproject the far plane to get the world-space ray through this pixel.
        vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec3 dir = normalize(far.xyz / far.w - uCameraPos);

        float h = dir.y;
        vec3 sunDir = normalize(uSunDirection);
        vec3 moonDir = normalize(uMoonDirection);
        float sd = max(dot(dir, sunDir), 0.0);
        float md = max(dot(dir, moonDir), 0.0);

        // ── Sky gradient ──
        // Warm at the waterline, dark overhead. The stops shift with
        // the dynamic uniforms so sunrise/sunset/night all look distinct.
        vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(-0.04, 0.25, h));
        col = mix(col, uSkyZenith, smoothstep(0.20, 0.85, h));

        // ── Horizon glow during sunrise/sunset ──
        // A warm band that hugs the horizon when uSunsetAmount > 0.
        float horizonGlow = exp(-abs(h) * 6.0) * uSunsetAmount;
        vec3 sunsetTint = uSunColor * 0.6;
        col += sunsetTint * horizonGlow * 0.5;

        // Scatter glow towards the sun near the horizon
        float sunHorizonGlow = pow(sd, 3.0) * exp(-abs(h) * 4.0) * uSunsetAmount;
        col += uSunColor * sunHorizonGlow * 0.4;

        // ── Stars ──
        float skyLum = dot(col, vec3(0.299, 0.587, 0.114));
        float starMask = smoothstep(0.08, 0.40, h) * (1.0 - smoothstep(0.03, 0.18, skyLum));
        if (starMask > 0.001) {
            vec2 grid = dir.xz / (h + 0.55) * 2.6 * 30.0;
            vec2 gi = floor(grid);
            vec2 gf = fract(grid);
            float r = hash21(gi);
            if (r > 0.88) {
                vec2 pt = vec2(hash21(gi + 3.1), hash21(gi + 7.7));
                float d = length(gf - pt);
                float twinkle = 0.55 + 0.45 * sin(uTime * 1.8 + r * 90.0);
                float brightness = (r - 0.88) / 0.12;
                float star = smoothstep(0.12, 0.0, d) * brightness;
                // Color variation: some stars are warm, some cool
                vec3 starColor = mix(
                    vec3(0.75, 0.82, 1.0),
                    vec3(1.0, 0.90, 0.75),
                    hash21(gi + 99.9)
                );
                col += starColor * star * twinkle * starMask * 1.0;
            }
        }

        // ── Sun: glow, corona, disc ──
        // Uses mix() instead of additive blending to avoid grey desaturation.
        // Disc stays at or near 1.0 to avoid tone-mapping compressing it to grey.
        if (sunDir.y > -0.15) {
            float sunVisibility = smoothstep(-0.15, 0.0, sunDir.y);

            // Soft outer glow — blends sky toward warm sun color
            float outerGlow = pow(sd, 48.0) * 0.35 * sunVisibility;
            col = mix(col, uSunColor, outerGlow);

            // Corona — tighter, brighter ring
            float corona = pow(sd, 256.0) * 0.6 * sunVisibility;
            col = mix(col, min(uSunColor * 1.2, vec3(1.0)), corona);

            // Sun disc — bright white center, sun-tinted edge
            float disc = smoothstep(0.9994, 0.9998, sd) * sunVisibility;

            // Center is pure white; edge picks up the sun's warmth
            float edgeFade = 1.0 - smoothstep(0.9994, 0.9998, sd);
            vec3 sunDiscColor = mix(vec3(1.0, 1.0, 0.98), uSunColor, edgeFade * 0.4);

            col = mix(col, sunDiscColor, disc);
        }

        // ── Moon: disc with craters and earthshine ──
        if (moonDir.y > -0.10) {
            float moonVisibility = smoothstep(-0.10, 0.05, moonDir.y);

            // Gentle glow around the moon
            col += uMoonColor * 0.15 * (pow(md, 12.0) * moonVisibility);
            col += uMoonColor * 0.06 * (pow(md, 4.0) * moonVisibility);

            // Moon disc
            float moonDiscAngle = acos(clamp(md, -1.0, 1.0));
            float moonRadius = 0.012;  // angular radius
            float moonDisc = smoothstep(moonRadius * 1.1, moonRadius * 0.8, moonDiscAngle);

            if (moonDisc > 0.001) {
                // Project onto moon surface for crater mapping
                // Build a local coordinate system around moonDir
                vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
                vec3 moonUp = cross(moonDir, moonRight);
                vec2 moonUV = vec2(
                    dot(dir - moonDir * md, moonRight),
                    dot(dir - moonDir * md, moonUp)
                ) / moonRadius * 1.2;

                // Base moon color with craters
                float crater = moonCraters(moonUV);
                vec3 moonSurface = uMoonColor * (0.85 + crater * 0.3);

                // Simple lambertian shading — lit by the sun
                float moonLighting = max(dot(moonDir, sunDir), 0.0) * 0.4 + 0.6;
                // Phase: crescent shape when sun is partially behind
                float phase = dot(normalize(dir - moonDir * dot(dir, moonDir)), sunDir);
                float phaseMask = smoothstep(-0.3, 0.3, phase);
                moonSurface *= moonLighting * mix(0.3, 1.0, phaseMask);

                // Earthshine: faint blue light on the dark side
                vec3 earthshine = vec3(0.08, 0.12, 0.18) * (1.0 - phaseMask) * 0.4;
                moonSurface += earthshine;

                // Edge softness
                float edgeSoft = smoothstep(moonRadius * 1.1, moonRadius * 0.85, moonDiscAngle);
                col = mix(col, moonSurface, edgeSoft * moonVisibility);
            }
        }

        // ── Cirrus clouds ──
        // Tinted by the current sky and sun colors.
        float cloudMask = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.35, 0.80, h));
        if (cloudMask > 0.001) {
            vec2 cuv = dir.xz / max(h, 0.05);
            cuv = cuv * vec2(0.20, 0.46) + vec2(uTime * 0.008, uTime * 0.003);
            float cover = smoothstep(0.48, 0.84, fbm(cuv));

            // Cloud color: blend between a dark base and the sun-lit horizon
            vec3 cloudBase = uSkyMid * 0.5;
            vec3 cloudLit = mix(uSkyHorizon, uSunColor * 0.7, 0.3 + pow(sd, 4.0) * 0.6);
            vec3 cloudCol = mix(cloudBase, cloudLit, 0.15 + pow(sd, 3.0) * 0.75);

            // During sunset, clouds catch more warm light
            cloudCol = mix(cloudCol, uSunColor * 0.65, uSunsetAmount * 0.3 * pow(sd, 2.0));

            col = mix(col, cloudCol, cover * cloudMask * 0.75);
        }

        // Sub-LSB dither to remove banding on dark gradients.
        col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

        fragColor = vec4(col, 1.0);
    }
`;

export const SkyShader = {
    vertex: VERTEX,
    fragment: FRAGMENT,
    palette: PALETTE,
};
