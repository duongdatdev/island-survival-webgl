export const SurfaceLightingGLSL = `
    uniform vec3 uFogColor;
    uniform float uFogStart;
    uniform float uFogDensity;
    uniform float uFadeStart;
    uniform float uFadeEnd;
    uniform float uRoughness;
    uniform float uMetallic;
    uniform vec3 uEmissive;
    uniform float uMaterialAO;
    uniform float uPaletteStrength;
    uniform sampler2D uNormalTexture;
    uniform sampler2D uAOTexture;
    uniform sampler2D uEmissiveTexture;
    uniform sampler2D uMetallicRoughnessTexture;
    uniform int uUseNormalTexture;
    uniform int uUseAOTexture;
    uniform int uUseEmissiveTexture;
    uniform int uUseMetallicRoughnessTexture;
    uniform float uNormalScale;
    uniform float uAOStrength;
    uniform vec3 uExtraLightPositions[3];
    uniform vec3 uExtraLightColors[3];
    uniform vec3 uExtraLightParams[3];
    uniform sampler2D uShadowMap;
    uniform float uShadowEnabled;
    uniform float uShadowTexel;
    uniform vec3 uShadowCenter;
    uniform float uShadowDistance;
    vec3 surfaceNormal(vec3 normal) {
        if (uUseNormalTexture == 0) return normal;
        vec3 dp1 = dFdx(vWorldPosition), dp2 = dFdy(vWorldPosition);
        vec2 duv1 = dFdx(vTexCoord), duv2 = dFdy(vTexCoord);
        float determinant = duv1.x * duv2.y - duv1.y * duv2.x;
        if (abs(determinant) < 0.000001) return normal;
        vec3 tangent = normalize((dp1 * duv2.y - dp2 * duv1.y) / determinant);
        tangent = normalize(tangent - normal * dot(normal, tangent));
        vec3 bitangent = normalize(cross(normal, tangent)) * sign(determinant);
        vec3 mapped = texture(uNormalTexture, vTexCoord).xyz * 2.0 - 1.0;
        mapped.xy *= uNormalScale;
        return normalize(mat3(tangent, bitangent, normal) * mapped);
    }
    float shadowVisibility(vec3 N, vec3 L) {
        if (uShadowEnabled < 0.5) return 1.0;
        vec3 p = vShadowPosition.xyz / max(vShadowPosition.w, 0.0001) * 0.5 + 0.5;
        if (any(lessThan(p, vec3(0.0))) || any(greaterThan(p, vec3(1.0)))) return 1.0;
        float bias = max(0.00016, 0.0007 * (1.0 - max(dot(N, L), 0.0)));
        float visible = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            float depth = texture(uShadowMap, p.xy + vec2(float(x), float(y)) * uShadowTexel).r;
            visible += p.z - bias <= depth ? 1.0 : 0.0;
        }
        float edge = smoothstep(uShadowDistance * 0.7, uShadowDistance * 0.95, length(vWorldPosition.xz - uShadowCenter.xz));
        return mix(visible / 9.0, 1.0, edge);
    }
    vec3 pointContribution(vec3 position, vec3 color, float intensity, float range, vec3 N) {
        vec3 delta = position - vWorldPosition;
        float distanceToLight = length(delta);
        float falloff = max(1.0 - distanceToLight / max(range, 0.001), 0.0);
        return srgbToLinear(color) * intensity * falloff * falloff
            * (0.08 + 0.92 * max(dot(N, delta / max(distanceToLight, 0.001)), 0.0));
    }
`;
