import { createBasicShader } from './BasicShader.js';

// Terrain keeps the generator's vertex biome/path palette as its broad color
// layer, then adds deterministic world-space detail without a tiled bitmap.
const fragmentDeclarations = `
    float terrainHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    float terrainNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x),
                   mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
`;

const surfaceTransform = `
    vec3 sourceColor = surfaceColor.rgb;
    float broadNoise = terrainNoise(vWorldPosition.xz * 0.105);
    float fineNoise = terrainNoise(vWorldPosition.xz * 0.72);
    float detailFade = 1.0 - smoothstep(85.0, 220.0, distance(uViewPosition, vWorldPosition));

    // Biome/path identity remains anchored by the generated vertex palette.
    float sandy = smoothstep(0.035, 0.16, sourceColor.r - sourceColor.g * 1.04);
    float grassland = 1.0 - sandy;
    float slope = 1.0 - clamp(N.y, 0.0, 1.0);
    float exposedRock = smoothstep(0.18, 0.58, slope) * 0.58;
    float highRock = smoothstep(34.0, 57.0, vWorldPosition.y) * 0.45;
    float rock = clamp(max(exposedRock, highRock), 0.0, 0.7);

    float mottling = (broadNoise - 0.5) * 0.105 + (fineNoise - 0.5) * 0.075;
    vec3 soilTint = vec3(0.88, 0.79, 0.63);
    vec3 grassTint = vec3(0.78, 0.91, 0.69);
    vec3 rockTint = vec3(0.87, 0.86, 0.80);
    vec3 detailed = sourceColor * mix(soilTint, grassTint, grassland);
    detailed = mix(detailed, sourceColor * rockTint, rock);
    detailed *= 1.0 + mottling * detailFade;

    // Damp sand follows the actual height field at the waterline, so coves and
    // headlands get their band from terrain elevation instead of a radial mask.
    float waterlineBand = 1.0 - smoothstep(0.3, 2.5, abs(vWorldPosition.y - 0.28));
    float dampSand = waterlineBand * sandy;
    detailed = mix(detailed, detailed * vec3(0.68, 0.67, 0.57), dampSand * 0.52);
    float shoreGrain = (terrainNoise(vWorldPosition.xz * 1.7) - 0.5) * dampSand * detailFade * 0.08;
    surfaceColor.rgb = max(detailed + shoreGrain, vec3(0.0));
`;

export const TerrainShader = createBasicShader({ fragmentDeclarations, surfaceTransform });

