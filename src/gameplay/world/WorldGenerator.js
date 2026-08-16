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

    generate(seed, metadataMap, debugMode = false) {
        const startTime = performance.now();
        const prng = new PRNG(seed);

        const island = new IslandGenerator(prng);

        const terrainGen = new TerrainGenerator(prng, island, this.size, this.width);

        const biomeGen = new BiomeGenerator(prng, island);

        const builder = new EnvironmentBuilder(prng, island, terrainGen, biomeGen, this.width);
        const { placedObjects, resourceNodes, buildArea, navigationGrid, landmarks } = builder.build(metadataMap);

        const step = this.width / this.size;
        const halfWidth = this.width / 2.0;

        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];
        const heights = new Float32Array((this.size + 1) * (this.size + 1));

        for (let z = 0; z <= this.size; z++) {
            for (let x = 0; x <= this.size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;
                const py = terrainGen.getHeight(px, pz);

                positions.push(px, py, pz);
                heights[z * (this.size + 1) + x] = py;

                const biome = biomeGen.getBiome(px, pz, py);
                const rgb = biomeGen.getBiomeColor(biome, py, debugMode);
                
                colors.push(rgb[0], rgb[1], rgb[2], 1.0);
            }
        }

        const normalStep = step * 0.5;
        for (let z = 0; z <= this.size; z++) {
            for (let x = 0; x <= this.size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;

                const n = terrainGen.getNormal(px, pz, normalStep);
                normals.push(n[0], n[1], n[2]);
            }
        }

        const outerBeach = island.outerBeachRadius || island.radius;
        const outerBeachSq = outerBeach * outerBeach;
        for (let z = 0; z < this.size; z++) {
            for (let x = 0; x < this.size; x++) {
                const row1 = z * (this.size + 1);
                const row2 = (z + 1) * (this.size + 1);

                const idx00 = row1 + x;
                const idx01 = row1 + x + 1;
                const idx10 = row2 + x;
                const idx11 = row2 + x + 1;

                const px0 = x * step - halfWidth;
                const pz0 = z * step - halfWidth;
                const px1 = px0 + step;
                const pz1 = pz0 + step;
                const inRing =
                    (px0 * px0 + pz0 * pz0) <= outerBeachSq ||
                    (px1 * px1 + pz0 * pz0) <= outerBeachSq ||
                    (px0 * px0 + pz1 * pz1) <= outerBeachSq ||
                    (px1 * px1 + pz1 * pz1) <= outerBeachSq;
                if (!inRing) continue;

                indices.push(idx00);
                indices.push(idx10);
                indices.push(idx01);

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
            biomeGenerator: biomeGen,
            placedObjects,
            resourceNodes,
            buildArea,
            navigationGrid,
            landmarks,
            generationTimeMs,
            objectCount: placedObjects.length + resourceNodes.length
        };
    }
}
