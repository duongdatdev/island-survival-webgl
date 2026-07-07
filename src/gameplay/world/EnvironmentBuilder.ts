import { PRNG } from './PRNG.js?v=6';
import { IslandGenerator } from './IslandGenerator.js?v=6';
import { TerrainGenerator } from './TerrainGenerator.js?v=6';
import { BiomeGenerator, BiomeType } from './BiomeGenerator.js?v=6';

export interface PlacedObject {
    id: string;          // BirchTree_1, Rock_1, etc.
    modelName: string;   // The obj filename derived
    objPath: string;     // The absolute path derived from manifest
    category: string;    // Tree, Rock, Bush, Palm, etc.
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    collision: boolean;
    navigationBlocker: boolean;
    biome: string;
    terrain: string;
}

export interface ResourceNode {
    id: string;          // wood, stone, rope, barrel, coconut
    position: [number, number, number];
    meshScale: [number, number, number];
}

export class EnvironmentBuilder {
    private prng: PRNG;
    private island: IslandGenerator;
    private terrain: TerrainGenerator;
    private biomeGen: BiomeGenerator;

    constructor(prng: PRNG, island: IslandGenerator, terrain: TerrainGenerator, biomeGen: BiomeGenerator) {
        this.prng = prng;
        this.island = island;
        this.terrain = terrain;
        this.biomeGen = biomeGen;
    }

    /**
     * Process metadata assets and place objects and resources deterministically
     */
    public build(
        metadataMap: Record<string, any>
    ): { placedObjects: PlacedObject[]; resourceNodes: ResourceNode[]; buildArea: [number, number, number]; navigationGrid: boolean[][] } {
        const placedObjects: PlacedObject[] = [];
        const resourceNodes: ResourceNode[] = [];
        
        // 1. Group assets by their metadata biome
        const assetsByBiome: Record<string, any[]> = {
            'Beach': [],
            'Grassland': [],
            'Forest': [],
            'RockArea': [],
            'Mountain': [],
            'Jungle': []
        };

        for (const key in metadataMap) {
            const asset = metadataMap[key];
            if (asset.proceduralPlacement && assetsByBiome[asset.biome]) {
                assetsByBiome[asset.biome].push(asset);
            }
        }

        // 2. Setup a grid to sample placements (prevent overlaps)
        // Divide world space [-50, 50] into a 40x40 sampling grid (cell size 2.5m)
        const sampleGridSize = 40;
        const cellWidth = 100.0 / sampleGridSize;
        const halfWidth = 50.0;

        for (let sz = 0; sz < sampleGridSize; sz++) {
            for (let sx = 0; sx < sampleGridSize; sx++) {
                // Jittered coordinate inside the grid cell
                const px = (sx + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;
                const pz = (sz + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;

                const py = this.terrain.getHeight(px, pz);
                
                // Skip if below water
                if (py < 0.05) continue;

                // Determine biome at this point
                const biome = this.biomeGen.getBiome(px, pz, py);
                if (biome === BiomeType.OCEAN) continue;

                // Map generator biome to metadata biome
                let targetBiomeKey = 'Grassland';
                if (biome === BiomeType.BEACH) targetBiomeKey = 'Beach';
                else if (biome === BiomeType.FOREST) targetBiomeKey = 'Forest';
                else if (biome === BiomeType.ROCK_AREA) targetBiomeKey = 'RockArea';

                const candidates = assetsByBiome[targetBiomeKey] || [];
                if (candidates.length === 0) continue;

                // Choose candidate based on spawn weight
                const selectedAsset = this.weightedChoice(candidates);
                if (!selectedAsset) continue;

                // Roll spawn chance
                const rules = selectedAsset.placementRules || {};
                const spawnChance = rules.spawnChance !== undefined ? rules.spawnChance : 0.5;
                if (this.prng.next() > spawnChance) continue;

                // Verify placement constraints
                // Terrain type (e.g. Grass, Sand, Rock)
                const inferredTerrainType = selectedAsset.terrain; // "Grass", "Sand", "Rock"
                
                // Verify slope limit
                const step = 0.5;
                const normal = this.terrain.getNormal(px, pz, step);
                // Slope in degrees: acos(normal.y) * 180 / PI
                const slope = Math.acos(normal[1]) * (180.0 / Math.PI);
                const maxSlope = rules.maxSlope !== undefined ? rules.maxSlope : 30;
                if (slope > maxSlope) continue;

                // Verify height range
                const heightRange = rules.heightRange || { min: 0.1, max: 10 };
                if (py < heightRange.min || py > heightRange.max) continue;

                // Verify distance to water & beach
                const distToCenter = Math.sqrt(px * px + pz * pz);
                const minDistanceToWater = rules.minDistanceToWater !== undefined ? rules.minDistanceToWater : 4.0;
                const shoreDistance = this.island.radius - distToCenter;
                if (distToCenter > (this.island.radius - minDistanceToWater)) continue; // Too close to water boundary

                const minDistanceToBeach = rules.minDistanceToBeach !== undefined ? rules.minDistanceToBeach : 0.0;
                if (minDistanceToBeach > 0.0 && this.island.isBeach(px, pz)) continue; // Cannot be on beach

                // Prevent spawning too close to start zone (center [0, 0])
                if (distToCenter < 5.0) continue;

                // Prevent overlap with already placed objects
                const minDistanceToAnother = rules.minDistanceToAnother !== undefined ? rules.minDistanceToAnother : 2.0;
                let overlap = false;
                for (const other of placedObjects) {
                    const dx = other.position[0] - px;
                    const dz = other.position[2] - pz;
                    if (dx * dx + dz * dz < minDistanceToAnother * minDistanceToAnother) {
                        overlap = true;
                        break;
                    }
                }
                if (overlap) continue;

                // Place the object!
                // Cluster check
                const cluster = selectedAsset.clusterRules;
                if (cluster && cluster.minSize > 1) {
                    const clusterSize = this.prng.nextInt(cluster.minSize, cluster.maxSize + 1);
                    const density = cluster.density || 0.3;
                    const radius = (clusterSize * density) + 1.5;

                    for (let c = 0; c < clusterSize; c++) {
                        // Offset coordinates
                        const angle = this.prng.nextRange(0, Math.PI * 2);
                        const dist = this.prng.nextRange(0.5, radius);
                        const cX = px + Math.cos(angle) * dist;
                        const cZ = pz + Math.sin(angle) * dist;
                        const cY = this.terrain.getHeight(cX, cZ);

                        if (cY < 0.05) continue;
                        if (this.biomeGen.getBiome(cX, cZ, cY) !== biome) continue;

                        let cOverlap = false;
                        for (const other of placedObjects) {
                            const dx = other.position[0] - cX;
                            const dz = other.position[2] - cZ;
                            if (dx * dx + dz * dz < 2.0) {
                                cOverlap = true;
                                break;
                            }
                        }
                        if (cOverlap) continue;

                        // Place cluster member
                        const scaleVal = this.prng.nextRange(selectedAsset.minScale || 0.8, selectedAsset.maxScale || 1.2);
                        placedObjects.push({
                            id: selectedAsset.id,
                            modelName: `${selectedAsset.id}.obj`,
                            objPath: selectedAsset.objPath,
                            category: selectedAsset.category || '',
                            position: [cX, cY, cZ],
                            rotation: [0, selectedAsset.randomRotation ? this.prng.nextRange(0, Math.PI * 2) : 0, 0],
                            scale: [scaleVal, scaleVal, scaleVal],
                            collision: selectedAsset.collision || false,
                            navigationBlocker: selectedAsset.navigationBlocker || false,
                            biome: targetBiomeKey,
                            terrain: inferredTerrainType
                        });
                    }
                } else {
                    // Place single object
                    const scaleVal = this.prng.nextRange(selectedAsset.minScale || 0.8, selectedAsset.maxScale || 1.2);
                    placedObjects.push({
                        id: selectedAsset.id,
                        modelName: `${selectedAsset.id}.obj`,
                        objPath: selectedAsset.objPath,
                        category: selectedAsset.category || '',
                        position: [px, py, pz],
                        rotation: [0, selectedAsset.randomRotation ? this.prng.nextRange(0, Math.PI * 2) : 0, 0],
                        scale: [scaleVal, scaleVal, scaleVal],
                        collision: selectedAsset.collision || false,
                        navigationBlocker: selectedAsset.navigationBlocker || false,
                        biome: targetBiomeKey,
                        terrain: inferredTerrainType
                    });
                }
            }
        }

        // 3. Spawning collectible resource nodes inside biomes deterministically
        // Target resource count: Beach (20), Grassland (25), Forest (25), Rock Area (20)
        const resourceSpawnRules = [
            { biome: BiomeType.BEACH, types: ['wood', 'barrel', 'rope', 'coconut'], count: 20 },
            { biome: BiomeType.GRASSLAND, types: ['stone'], count: 25 },
            { biome: BiomeType.FOREST, types: ['wood'], count: 25 },
            { biome: BiomeType.ROCK_AREA, types: ['stone'], count: 20 }
        ];

        // Resource visual specs (matching ResourceDatabase shapes)
        const resourceSpecs: Record<string, { scale: [number, number, number] }> = {
            'wood': { scale: [0.25, 0.6, 0.25] },
            'stone': { scale: [0.5, 0.3, 0.45] },
            'rope': { scale: [0.4, 0.15, 0.4] },
            'barrel': { scale: [0.4, 0.55, 0.4] },
            'coconut': { scale: [0.3, 0.3, 0.3] }
        };

        for (const rule of resourceSpawnRules) {
            let spawned = 0;
            let attempts = 0;
            const maxAttempts = rule.count * 8;

            while (spawned < rule.count && attempts < maxAttempts) {
                attempts++;

                const angle = this.prng.nextRange(0, Math.PI * 2);
                const radius = this.prng.nextRange(2.0, this.island.radius);
                const rx = Math.cos(angle) * radius;
                const rz = Math.sin(angle) * radius;
                const ry = this.terrain.getHeight(rx, rz);

                if (ry < 0.05) continue;
                if (this.biomeGen.getBiome(rx, rz, ry) !== rule.biome) continue;

                // Avoid center start zone
                const distFromCenter = Math.sqrt(rx * rx + rz * rz);
                if (distFromCenter < 4.0) continue;

                // Check distance against placed objects
                let tooClose = false;
                for (const obj of placedObjects) {
                    const dx = obj.position[0] - rx;
                    const dz = obj.position[2] - rz;
                    if (dx * dx + dz * dz < 2.0) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Check distance against other resources
                for (const node of resourceNodes) {
                    const dx = node.position[0] - rx;
                    const dz = node.position[2] - rz;
                    if (dx * dx + dz * dz < 2.5) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Spawn!
                const resType = this.prng.choose(rule.types);
                const spec = resourceSpecs[resType];
                resourceNodes.push({
                    id: resType,
                    position: [rx, ry, rz],
                    meshScale: spec.scale
                });
                spawned++;
            }
        }

        // 4. Generate Build Area on Southern shoreline beach
        // Southern shoreline is at angle around PI/2 (WebGL coordinates)
        let buildArea: [number, number, number] = [0.0, 0.0, 42.0];
        let foundBuildArea = false;
        
        for (let angleOff = 0; angleOff < Math.PI / 4; angleOff += 0.05) {
            // Check directly South first, then sweep outwards
            const testAngles = [Math.PI / 2 + angleOff, Math.PI / 2 - angleOff];
            for (const angle of testAngles) {
                const bx = Math.cos(angle) * (this.island.innerRadius + 2.0);
                const bz = Math.sin(angle) * (this.island.innerRadius + 2.0);
                const by = this.terrain.getHeight(bx, bz);

                if (by > 0.02 && by < 0.25 && this.island.isBeach(bx, bz)) {
                    // Check if clear of placed objects
                    let clear = true;
                    for (const obj of placedObjects) {
                        const dx = obj.position[0] - bx;
                        const dz = obj.position[2] - bz;
                        if (dx * dx + dz * dz < 4.0 * 4.0) {
                            clear = false;
                            break;
                        }
                    }
                    if (clear) {
                        buildArea = [bx, by, bz];
                        foundBuildArea = true;
                        break;
                    }
                }
            }
            if (foundBuildArea) break;
        }

        // 5. Generate Navigation Grid
        // A 120x120 boolean matrix indicating if coordinates are blocked
        const navSize = 120;
        const navGrid: boolean[][] = [];
        const stepSize = 100.0 / navSize;

        for (let z = 0; z < navSize; z++) {
            const row: boolean[] = [];
            for (let x = 0; x < navSize; x++) {
                const wx = x * stepSize - 50.0;
                const wz = z * stepSize - 50.0;
                const wy = this.terrain.getHeight(wx, wz);

                let blocked = false;
                
                // Blocked if in ocean (deep water)
                if (wy <= 0.05) {
                    blocked = true;
                } else {
                    // Blocked if too close to an obstacle with collision
                    for (const obj of placedObjects) {
                        if (obj.collision || obj.navigationBlocker) {
                            const dx = obj.position[0] - wx;
                            const dz = obj.position[2] - wz;
                            // Block cells within 1.2x of the object scale
                            const collisionRadius = obj.scale[0] * 1.3;
                            if (dx * dx + dz * dz < collisionRadius * collisionRadius) {
                                blocked = true;
                                break;
                            }
                        }
                    }
                }
                row.push(blocked);
            }
            navGrid.push(row);
        }

        return {
            placedObjects,
            resourceNodes,
            buildArea,
            navigationGrid: navGrid
        };
    }

    private weightedChoice(assets: any[]): any {
        const totalWeight = assets.reduce((sum, a) => sum + (a.spawnWeight || 0), 0);
        if (totalWeight === 0) return assets[0];

        let roll = this.prng.next() * totalWeight;
        for (const asset of assets) {
            roll -= (asset.spawnWeight || 0);
            if (roll <= 0) return asset;
        }
        return assets[assets.length - 1];
    }
}
