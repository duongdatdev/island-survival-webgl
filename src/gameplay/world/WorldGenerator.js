import { PRNG } from './PRNG.js';
import { IslandGenerator } from './IslandGenerator.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { BiomeGenerator } from './BiomeGenerator.js';
import { EnvironmentBuilder } from './EnvironmentBuilder.js';

export class WorldGenerator {
    constructor(size = 120, width = 100.0) {
        this.size = size;
        this.width = width;
    }

    /**
     * Entry point to generate a complete world deterministically
     * @param seed Seed string or number
     * @param metadataMap Metadata dictionary loaded from environment *.asset.json files
     * @param debugMode If true, draw bright debug biome colors
     */
    generate(seed, metadataMap, debugMode = false) {
        const startTime = performance.now();
        const prng = new PRNG(seed);

        // 1. Generate Island
        const island = new IslandGenerator(prng);

        // 2. Generate Terrain height controller
        const terrainGen = new TerrainGenerator(prng, island, this.size, this.width);

        // 3. Generate Biomes controller
        const biomeGen = new BiomeGenerator(prng, island);

        // 4. Generate Environment Props, resources, and build site
        const builder = new EnvironmentBuilder(prng, island, terrainGen, biomeGen);
        const { placedObjects, resourceNodes, buildArea, navigationGrid } = builder.build(metadataMap);

        // 5. Build geometry buffers for WebGL rendering
        const step = this.width / this.size;
        const halfWidth = this.width / 2.0;

        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        const heights = new Float32Array((this.size + 1) * (this.size + 1));

        // 5.1 Vertices, Heights, and Colors
        for (let z = 0; z <= this.size; z++) {
            for (let x = 0; x <= this.size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;
                const py = terrainGen.getHeight(px, pz);

                positions.push(px, py, pz);
                heights[z * (this.size + 1) + x] = py;

                // Determine biome at this vertex coordinate
                const biome = biomeGen.getBiome(px, pz, py);
                const rgb = biomeGen.getBiomeColor(biome, py, debugMode);
                
                colors.push(rgb[0], rgb[1], rgb[2], 1.0);
            }
        }

        // 5.2 Normals
        const normalStep = step * 0.5;
        for (let z = 0; z <= this.size; z++) {
            for (let x = 0; x <= this.size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;

                const n = terrainGen.getNormal(px, pz, normalStep);
                normals.push(n[0], n[1], n[2]);
            }
        }

        // 5.3 Indices grid - only generate triangles near the island
        for (let z = 0; z < this.size; z++) {
            for (let x = 0; x < this.size; x++) {
                const row1 = z * (this.size + 1);
                const row2 = (z + 1) * (this.size + 1);

                const idx00 = row1 + x;
                const idx01 = row1 + x + 1;
                const idx10 = row2 + x;
                const idx11 = row2 + x + 1;

                // Skip grid cells entirely in deep ocean
                const maxH = Math.max(heights[idx00], heights[idx01], heights[idx10], heights[idx11]);
                if (maxH <= 0.02) continue;

                // First triangle
                indices.push(idx00);
                indices.push(idx10);
                indices.push(idx01);

                // Second triangle
                indices.push(idx01);
                indices.push(idx10);
                indices.push(idx11);
            }
        }

        const endTime = performance.now();
        const generationTimeMs = endTime - startTime;

        return {
            seed,
            terrain: {
                positions: new Float32Array(positions),
                normals: new Float32Array(normals),
                colors: new Float32Array(colors),
                indices: new Uint32Array(indices),
                heights
            },
            terrainGenerator: terrainGen,
            placedObjects,
            resourceNodes,
            buildArea,
            navigationGrid,
            generationTimeMs,
            objectCount: placedObjects.length + resourceNodes.length
        };
    }
}
