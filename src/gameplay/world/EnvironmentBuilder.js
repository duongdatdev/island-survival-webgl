import { BiomeType } from './BiomeGenerator.js';

export class EnvironmentBuilder {
    constructor(prng, island, terrain, biomeGen, worldWidth = 100.0) {
        this.prng = prng;
        this.island = island;
        this.terrain = terrain;
        this.biomeGen = biomeGen;
        this.worldWidth = worldWidth;
    }

    /**
     * Process metadata assets and place objects and resources deterministically
     */
    build(metadataMap) {
        const placedObjects = [];
        const resourceNodes = [];

        // 1. Group assets by their metadata biome
        // Mountain and Jungle are sub-classes that fall back to RockArea and Forest
        const assetsByBiome = {
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
        // Density lifted to ~60x60 to compensate for filters that reject most candidates.
        const halfWidth = this.worldWidth / 2.0;
        const sampleGridSize = 60;
        const cellWidth = this.worldWidth / sampleGridSize;
        const attemptsPerCell = 2;

        for (let sz = 0; sz < sampleGridSize; sz++) {
            for (let sx = 0; sx < sampleGridSize; sx++) {
                for (let attempt = 0; attempt < attemptsPerCell; attempt++) {
                // Jittered coordinate inside the grid cell
                const px = (sx + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;
                const pz = (sz + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;

                const py = this.terrain.getHeight(px, pz);

                // Skip if below water
                if (py < 0.05) continue;

                // Determine biome at this point
                const biome = this.biomeGen.getBiome(px, pz, py);
                if (biome === BiomeType.OCEAN) continue;

                // Map generator biome to a pool of candidate metadata biomes.
                // Mountain overlays RockArea when elevation is high enough;
                // Jungle overlays Forest as a denser sub-biome selected by noise.
                let candidates;
                if (biome === BiomeType.BEACH) {
                    candidates = assetsByBiome['Beach'];
                } else if (biome === BiomeType.FOREST) {
                    // Jungle patches inside forest, deterministic per position
                    const jungleNoise = Math.sin(px * 0.17) * Math.cos(pz * 0.19);
                    if (jungleNoise > 0.35 && assetsByBiome['Jungle'].length > 0) {
                        candidates = assetsByBiome['Jungle'];
                    } else {
                        candidates = assetsByBiome['Forest'];
                    }
                } else if (biome === BiomeType.ROCK_AREA) {
                    // Mountain assets at high elevation, otherwise regular rock
                    if (py > 2.0 && assetsByBiome['Mountain'].length > 0) {
                        candidates = assetsByBiome['Mountain'];
                    } else {
                        candidates = assetsByBiome['RockArea'];
                    }
                } else {
                    candidates = assetsByBiome['Grassland'];
                }

                if (!candidates || candidates.length === 0) continue;

                // Track the target key so it is recorded on the placed object below
                let targetBiomeKey;
                if (candidates === assetsByBiome['Beach']) targetBiomeKey = 'Beach';
                else if (candidates === assetsByBiome['Jungle']) targetBiomeKey = 'Jungle';
                else if (candidates === assetsByBiome['Forest']) targetBiomeKey = 'Forest';
                else if (candidates === assetsByBiome['Mountain']) targetBiomeKey = 'Mountain';
                else if (candidates === assetsByBiome['RockArea']) targetBiomeKey = 'RockArea';
                else targetBiomeKey = 'Grassland';

                // Choose candidate based on spawn weight
                const selectedAsset = this.weightedChoice(candidates);
                if (!selectedAsset) continue;

                // Roll spawn chance
                const rules = selectedAsset.placementRules || {};
                const spawnChance = rules.spawnChance !== undefined ? rules.spawnChance : 0.5;
                if (this.prng.next() > spawnChance) continue;

                // Verify placement constraints
                const inferredTerrainType = selectedAsset.terrain; // "Grass", "Sand", "Rock"
                
                // Verify slope limit
                const step = 0.5;
                const normal = this.terrain.getNormal(px, pz, step);
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
                    const minDistSq = minDistanceToAnother * minDistanceToAnother;

                    for (let c = 0; c < clusterSize; c++) {
                        // Offset coordinates
                        const angle = this.prng.nextRange(0, Math.PI * 2);
                        const dist = this.prng.nextRange(0.5, radius);
                        const cX = px + Math.cos(angle) * dist;
                        const cZ = pz + Math.sin(angle) * dist;
                        const cY = this.terrain.getHeight(cX, cZ);

                        if (cY < 0.05) continue;
                        if (this.biomeGen.getBiome(cX, cZ, cY) !== biome) continue;

                        // Cluster members must satisfy the same placement rules
                        if (cY < heightRange.min || cY > heightRange.max) continue;

                        const cDistToCenter = Math.sqrt(cX * cX + cZ * cZ);
                        if (cDistToCenter > (this.island.radius - minDistanceToWater)) continue;
                        if (minDistanceToBeach > 0.0 && this.island.isBeach(cX, cZ)) continue;

                        const cNormal = this.terrain.getNormal(cX, cZ, step);
                        const cSlope = Math.acos(cNormal[1]) * (180.0 / Math.PI);
                        if (cSlope > maxSlope) continue;

                        let cOverlap = false;
                        for (const other of placedObjects) {
                            const dx = other.position[0] - cX;
                            const dz = other.position[2] - cZ;
                            if (dx * dx + dz * dz < minDistSq) {
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
                // Stop retrying attempts once we successfully placed for this cell
                break;
                } // end attempt
            }
        }

        // 3. Spawning collectible resource nodes inside biomes deterministically
        const resourceSpawnRules = [
            { biome: BiomeType.BEACH, types: ['wood', 'barrel', 'rope', 'coconut'], count: 20 },
            { biome: BiomeType.GRASSLAND, types: ['stone'], count: 25 },
            { biome: BiomeType.FOREST, types: ['wood'], count: 25 },
            { biome: BiomeType.ROCK_AREA, types: ['stone'], count: 20 }
        ];

        const resourceSpecs = {
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

                // Check distance against placed objects (min 2m)
                let tooClose = false;
                for (const obj of placedObjects) {
                    const dx = obj.position[0] - rx;
                    const dz = obj.position[2] - rz;
                    if (dx * dx + dz * dz < 2.0 * 2.0) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Check distance against other resources (min 1.6m)
                for (const node of resourceNodes) {
                    const dx = node.position[0] - rx;
                    const dz = node.position[2] - rz;
                    if (dx * dx + dz * dz < 1.6 * 1.6) {
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
        // Fallback sits just outside inner radius, snapped to actual terrain height.
        const fallbackR = (this.island.innerRadius + this.island.radius) * 0.5;
        let buildArea = [0.0, this.terrain.getHeight(0.0, fallbackR), fallbackR];
        let foundBuildArea = false;
        
        for (let angleOff = 0; angleOff < Math.PI / 4; angleOff += 0.05) {
            const testAngles = [Math.PI / 2 + angleOff, Math.PI / 2 - angleOff];
            for (const angle of testAngles) {
                const bx = Math.cos(angle) * (this.island.innerRadius + 2.0);
                const bz = Math.sin(angle) * (this.island.innerRadius + 2.0);
                const by = this.terrain.getHeight(bx, bz);

                if (by > 0.02 && by < 0.25 && this.island.isBeach(bx, bz)) {
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

        // 5. Generate Navigation Grid (~1m resolution across the world)
        const navSize = Math.max(60, Math.floor(this.worldWidth));
        const navGrid = [];
        const navStep = this.worldWidth / navSize;
        const navHalfWidth = this.worldWidth / 2.0;

        for (let z = 0; z < navSize; z++) {
            const row = [];
            for (let x = 0; x < navSize; x++) {
                const wx = x * navStep - navHalfWidth;
                const wz = z * navStep - navHalfWidth;
                const wy = this.terrain.getHeight(wx, wz);

                let blocked = false;
                
                if (wy <= 0.05) {
                    blocked = true;
                } else {
                    for (const obj of placedObjects) {
                        if (obj.collision || obj.navigationBlocker) {
                            const dx = obj.position[0] - wx;
                            const dz = obj.position[2] - wz;
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

        // 6. Procedural POI placement (waterfall + treasure chests)
        const landmarks = this._placeLandmarks(placedObjects, buildArea);

        return {
            placedObjects,
            resourceNodes,
            buildArea,
            navigationGrid: navGrid,
            landmarks
        };
    }

    /**
     * Choose landmark positions procedurally so they always sit inside the
     * generated island regardless of radius. Returns:
     *  - waterfall: [x, y, z] preferring high RockArea terrain
     *  - treasureChests: array of { position, quadrant } across the 4 quadrants
     */
    _placeLandmarks(placedObjects, buildArea) {
        const landmarks = { waterfall: null, treasureChests: [] };

        // -- Waterfall: search for the highest RockArea/Mountain point --
        let bestScore = -Infinity;
        for (let i = 0; i < 200; i++) {
            const angle = this.prng.nextRange(0, Math.PI * 2);
            const radius = this.prng.nextRange(this.island.innerRadius * 0.35, this.island.innerRadius * 0.9);
            const wx = Math.cos(angle) * radius;
            const wz = Math.sin(angle) * radius;
            const wy = this.terrain.getHeight(wx, wz);
            if (wy < 1.2) continue;

            const biome = this.biomeGen.getBiome(wx, wz, wy);
            if (biome !== BiomeType.ROCK_AREA) continue;

            // Prefer taller, more central spots
            const score = wy - radius * 0.02;
            if (score > bestScore) {
                bestScore = score;
                landmarks.waterfall = [wx, wy, wz];
            }
        }
        if (!landmarks.waterfall) {
            // Fallback: elevated point along +X axis
            const fx = this.island.innerRadius * 0.55;
            landmarks.waterfall = [fx, this.terrain.getHeight(fx, -fx * 0.4), -fx * 0.4];
        }

        // -- Treasure chests: one per quadrant, on land, away from build area --
        const quadrants = [
            { sx: -1, sz: 1 },
            { sx: 1, sz: -1 },
            { sx: 1, sz: 1 },
            { sx: -1, sz: -1 }
        ];
        const minChestDist = 3.0;
        const minChestDistSq = minChestDist * minChestDist;

        for (const q of quadrants) {
            let placed = null;
            for (let i = 0; i < 60; i++) {
                const r = this.prng.nextRange(this.island.innerRadius * 0.45, this.island.innerRadius * 0.92);
                const angle = this.prng.nextRange(0.15, Math.PI / 2 - 0.15);
                const cx = q.sx * Math.cos(angle) * r;
                const cz = q.sz * Math.sin(angle) * r;
                const cy = this.terrain.getHeight(cx, cz);
                if (cy < 0.15) continue;

                const biome = this.biomeGen.getBiome(cx, cz, cy);
                if (biome === BiomeType.OCEAN) continue;

                // Slope must be gentle enough to sit a chest
                const normal = this.terrain.getNormal(cx, cz, 0.5);
                const slope = Math.acos(normal[1]) * (180.0 / Math.PI);
                if (slope > 20) continue;

                // Away from build area
                const bdx = cx - buildArea[0];
                const bdz = cz - buildArea[2];
                if (bdx * bdx + bdz * bdz < 6 * 6) continue;

                // Not stuffed inside another object
                let blocked = false;
                for (const obj of placedObjects) {
                    const dx = obj.position[0] - cx;
                    const dz = obj.position[2] - cz;
                    if (dx * dx + dz * dz < minChestDistSq) { blocked = true; break; }
                }
                if (blocked) continue;

                placed = [cx, cy, cz];
                break;
            }
            if (placed) landmarks.treasureChests.push({ position: placed, quadrant: q });
        }

        return landmarks;
    }

    weightedChoice(assets) {
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
