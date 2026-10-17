
import { ColorSpaceGLSL } from './ColorSpace.js';
import { SURFACE_MOTION_GLSL } from './SurfaceMotion.js';
import { SurfaceLightingGLSL } from './SurfaceLighting.js';

/** Shared lighting with explicit hooks for terrain and instanced foliage. */
export function createBasicShader({ vertexDeclarations = '', vertexTransform = '', fragmentDeclarations = '', surfaceTransform = '' } = {}) {
return {
    vertex: `#version 300 es
        precision highp float;
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
        layout(location = 3) in vec2 aTexCoord;

        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat4 uLightViewProjection;
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec2 uWindDirection;
        uniform float uFoliage;

        out vec3 vWorldPosition;
        out vec3 vNormal;
        out vec4 vColor;
        out vec2 vTexCoord;
        out vec4 vShadowPosition;
        ${SURFACE_MOTION_GLSL}
        ${vertexDeclarations}

        void main() {
            vec3 localPosition = aPosition;
            vec3 localNormal = aNormal;
            vec4 localColor = aColor;
            applyCreatureMotion(localPosition, localNormal);
            ${vertexTransform}
            vec4 worldPos = uModelMatrix * vec4(localPosition, 1.0);
            float leaf = smoothstep(0.015, 0.12, localColor.g - localColor.r) * uFoliage;
            float phase = dot(worldPos.xz, vec2(0.17, 0.13)) + uTime * 1.4;
            worldPos.xz += uWindDirection * (sin(phase) + 0.35 * sin(phase * 2.31 + 1.7)) * leaf * uWindStrength * 0.075;
            vWorldPosition = worldPos.xyz;
            
            vNormal = transpose(inverse(mat3(uModelMatrix))) * localNormal;
            
            vColor = localColor;
            vTexCoord = aTexCoord;
            vShadowPosition = uLightViewProjection * worldPos;
            
            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec3 vWorldPosition;
        in vec3 vNormal;
        in vec4 vColor;
        in vec2 vTexCoord;
        in vec4 vShadowPosition;

        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        uniform vec3 uPointLightPosition;
        uniform vec3 uPointLightColor;
        uniform float uPointLightIntensity;
        uniform float uPointLightRange;

        uniform sampler2D uBaseColorTexture;
        uniform int uUseBaseColorTexture;
        uniform int uVertexColorLinear;

        uniform float uFirstPersonHeadCutoff;

        uniform vec3 uViewPosition;
        ${ColorSpaceGLSL}
        ${SurfaceLightingGLSL}
        ${fragmentDeclarations}

        out vec4 fragColor;

        void main() {
            if (vWorldPosition.y > uFirstPersonHeadCutoff) discard;
            float viewDistance = length(vWorldPosition - uViewPosition);
            if (uFadeEnd > 0.0) {
                float fade = smoothstep(uFadeStart, uFadeEnd, viewDistance);
                float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                if (fade > noise) discard;
            }

            vec3 N = surfaceNormal(normalize(vNormal));
            vec3 L = normalize(uLightDirection);
            
            // Broad sky fill and softer ground bounce keep shaded faces readable.
            float skyWeight = N.y * 0.5 + 0.5;
            vec3 ambientColor = srgbToLinear(uAmbientColor);
            vec3 groundBounce = ambientColor * vec3(0.72, 0.65, 0.55);
            vec3 ambient = mix(groundBounce, ambientColor, skyWeight) * uAmbientIntensity;
            
            float diff = max(dot(N, L), 0.0);
            float visibility = shadowVisibility(N, L);
            vec3 light = srgbToLinear(uLightColor) * uLightIntensity;
            vec3 diffuse = diff * light * visibility;
            
            vec3 V = normalize(uViewPosition - vWorldPosition);
            vec3 H = normalize(L + V);
            vec2 roughMetal = uUseMetallicRoughnessTexture == 1 ? texture(uMetallicRoughnessTexture, vTexCoord).gb : vec2(1.0);
            float roughness = clamp(uRoughness * roughMetal.x, 0.12, 1.0);
            float spec = pow(max(dot(N, H), 0.0), mix(160.0, 6.0, roughness * roughness));

            vec3 toPointLight = uPointLightPosition - vWorldPosition;
            float pointDistance = length(toPointLight);
            vec3 pointDirection = toPointLight / max(pointDistance, 0.0001);
            float pointDiffuse = max(dot(N, pointDirection), 0.0);
            float pointFalloff = max(1.0 - pointDistance / max(uPointLightRange, 0.0001), 0.0);
            pointFalloff *= pointFalloff;
            vec3 pointLight = srgbToLinear(uPointLightColor)
                * uPointLightIntensity
                * pointFalloff
                * (0.16 + pointDiffuse * 0.84);
            
            vec4 surfaceColor = vColor;
            float luminance = dot(surfaceColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            surfaceColor.rgb = mix(surfaceColor.rgb, mix(vec3(luminance), surfaceColor.rgb, 0.72), uPaletteStrength);
            if (uVertexColorLinear == 0) surfaceColor.rgb = srgbToLinear(surfaceColor.rgb);
            if (uUseBaseColorTexture == 1) {
                surfaceColor *= texture(uBaseColorTexture, vTexCoord);
            }
            ${surfaceTransform}
            float metallic = clamp(uMetallic * roughMetal.y, 0.0, 1.0);
            vec3 specular = spec * mix(vec3(0.04), surfaceColor.rgb, metallic) * light * diff * visibility * (1.0 - roughness * 0.6);
            for (int i = 0; i < 3; i++) pointLight += pointContribution(uExtraLightPositions[i], uExtraLightColors[i], uExtraLightParams[i].x, uExtraLightParams[i].y, N);

            float materialAO = uMaterialAO * (uUseAOTexture == 1 ? mix(1.0, texture(uAOTexture, vTexCoord).r, uAOStrength) : 1.0);
            vec3 emissive = uEmissive * (uUseEmissiveTexture == 1 ? texture(uEmissiveTexture, vTexCoord).rgb : vec3(1.0));
            vec3 finalColor = (ambient * materialAO * mix(0.85, 1.0, visibility) + diffuse + pointLight)
                * surfaceColor.rgb * (1.0 - metallic * 0.75) + specular + emissive;
            if (uFogDensity > 0.0) {
                float d = max(viewDistance - uFogStart, 0.0) * uFogDensity;
                finalColor = mix(finalColor, srgbToLinear(uFogColor), 1.0 - exp(-d * d));
            }
            
            fragColor = vec4(sceneOutput(finalColor), surfaceColor.a);
        }
    `
};
}

export const BasicShader = createBasicShader();
