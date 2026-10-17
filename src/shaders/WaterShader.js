import { WAVE_GLSL, BASE_AMPLITUDE, BASE_SPEED } from './WaterWaves.js';
import { ColorSpaceGLSL } from './ColorSpace.js';


export const WaterConstants = { BASE_AMPLITUDE, BASE_SPEED };

export const WaterShader = {
    vertex: `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
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
        uniform vec2 uWaveHeading;

        out vec3 vWorldPosition;
        out vec4 vColor;
        out vec2 vSlope;
        out float vCrest;
        out float vDepth;
        out float vShore;

${WAVE_GLSL}

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);

            vec2 slope = vec2(0.0);
            float crest = 0.0;

            if (uWaveEnable > 0.5) {
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

        uniform vec3 uHorizonColor;
        uniform vec3 uShallowColor;

        uniform float uDetailStrength;
        uniform float uFoamStrength;
        uniform float uWhitecaps;

        uniform vec3 uFogColor;
        uniform float uFogStart;
        uniform float uFogDensity;

        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uSunGlitter;
        uniform float uWaterQuality;

        out vec4 fragColor;

${ColorSpaceGLSL}

        float foamNoise(vec2 p) {
            float broad = sin(p.x * 0.72 + sin(p.y * 0.39)) * cos(p.y * 0.61 - p.x * 0.23);
            float fine = sin(p.x * 2.31 + p.y * 1.77) * cos(p.y * 2.07 - p.x * 1.19);
            return broad * 0.67 + fine * 0.33;
        }

        void main() {
            vec2 slope = vSlope;

            if (uDetailStrength > 0.0) {
                vec2 rp = vWorldPosition.xz;
                float c1 = cos(rp.x * 1.6 + rp.y * 1.25 + uTime * 0.80);
                float c2 = cos(rp.x * 5.6 - rp.y * 4.30 + uTime * 1.70);
                float c3 = cos(rp.x * 9.5 + rp.y * 7.40 - uTime * 2.10);
                float c4 = cos(rp.x * -3.7 + rp.y * 6.10 + uTime * 1.30);
                float c5 = cos(rp.x * 13.3 - rp.y * 9.10 - uTime * 2.60);

                float chop = exp(-length(vWorldPosition - uViewPosition) * 0.012);

                slope.x += uDetailStrength *
                    (0.050 * c1 + (0.052 * c2 + 0.036 * c3 - 0.020 * c4 + 0.022 * c5) * chop);
                slope.y += uDetailStrength *
                    (0.039 * c1 + (-0.040 * c2 + 0.028 * c3 + 0.033 * c4 - 0.015 * c5) * chop);
            }

            vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
            vec3 L = normalize(uLightDirection);
            vec3 V = normalize(uViewPosition - vWorldPosition);

            vec3 ambient = srgbToLinear(uAmbientColor) * uAmbientIntensity;

            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * srgbToLinear(uLightColor) * uLightIntensity;

            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 128.0);
            vec3 specular = spec * srgbToLinear(uLightColor) * uLightIntensity * 0.75;

            if (uSunGlitter > 0.0) {
                vec3 SH = normalize(normalize(uSunDirection) + V);
                float glint = pow(max(dot(N, SH), 0.0), 55.0);
                specular += glint * srgbToLinear(uSunColor) * uSunGlitter;
            }

            vec3 baseColor = mix(srgbToLinear(uShallowColor), srgbToLinear(vColor.rgb), vDepth);

            float foam = 0.0;
            if (uFoamStrength > 0.0 || uWhitecaps > 0.0) {
                float crestFoam = smoothstep(0.82, 0.97, vCrest) * uWhitecaps;

                vec2 shorePos = vWorldPosition.xz;
                float noise = foamNoise(shorePos * 0.55 + vec2(uTime * 0.045, -uTime * 0.032));
                float surge = 0.42 + 0.13 * noise + 0.12 * sin(uTime * 0.72
                    + shorePos.x * 0.22 + shorePos.y * 0.19);
                float shoreFoam = smoothstep(surge, surge + 0.16, vShore) * uFoamStrength;
                shoreFoam *= smoothstep(0.02, 0.24, vShore);
                shoreFoam *= 0.25 + 0.75 * smoothstep(-0.25, 0.65, noise);

                foam = clamp(crestFoam + shoreFoam, 0.0, 1.0);
                baseColor = mix(baseColor, srgbToLinear(vec3(0.86, 0.94, 1.0)), foam * 0.7);
            }

            vec3 finalColor = (ambient + diffuse) * baseColor + specular;

            float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
            finalColor = mix(finalColor, srgbToLinear(uHorizonColor), fresnel * 0.18);

            if (uWaterQuality > 0.01) {
                vec3 reflected = reflect(-V, N);
                float skyHeight = clamp(reflected.y * 0.5 + 0.5, 0.0, 1.0);
                vec3 skyLow = srgbToLinear(uHorizonColor);
                vec3 skyHigh = skyLow * mix(vec3(0.32, 0.58, 0.88), vec3(0.50, 0.76, 1.0), skyHeight);
                float horizonBand = 1.0 - smoothstep(0.04, 0.62, skyHeight);
                vec3 sky = mix(skyHigh, skyLow, horizonBand * 0.72);
                float sunBand = pow(max(dot(reflected, normalize(uSunDirection)), 0.0), 20.0);
                sky += srgbToLinear(uSunColor) * sunBand * 0.42;
                finalColor = mix(finalColor, sky, uWaterQuality * mix(0.08, 0.28, fresnel));

                float shallow = (1.0 - vDepth) * vShore;
                vec2 cp = vWorldPosition.xz * 1.15;
                float caustic = abs(sin(cp.x + uTime * 0.72) * sin(cp.y - uTime * 0.57));
                caustic = smoothstep(0.70, 0.96, caustic) * shallow * uWaterQuality;
                finalColor += srgbToLinear(uShallowColor) * caustic * 0.16;
            }

            finalColor += uLightningFlash * vec3(0.8, 0.9, 1.0) * 0.5;

            if (uFogDensity > 0.0) {
                float d = max(length(vWorldPosition - uViewPosition) - uFogStart, 0.0) * uFogDensity;
                finalColor = mix(finalColor, srgbToLinear(uFogColor), clamp(1.0 - exp(-d * d), 0.0, 1.0));
            }

            // Deep and grazing-angle water hides seabed/terrain chunk outlines.
            float alpha = mix(mix(0.45, 1.0, vDepth), 1.0, fresnel);
            alpha = max(alpha, foam * 0.95);

            fragColor = vec4(sceneOutput(finalColor), alpha);
        }
    `
};
