import { BiomeType } from './BiomeGenerator.js';

const CATEGORY_SCALE_MULTIPLIERS = {
    Tree:    0.70,
    Palm:    0.75,
    Rock:    0.60,
    Bush:    0.45,
    Grass:   0.35,
    Flower:  0.35,
    Plant:   0.45,
    Unknown: 0.35,
};

export class EnvironmentBuilder {
    constructor(prng, island, terrain, biomeGen, worldWidth = 100.0) {
        this.prng = prng;
        this.island = island;
        this.terrain = terrain;
        this.biomeGen = biomeGen;
        this.worldWidth = worldWidth;
    }

    _getCategoryScale(category) {
        return CATEGORY_SCALE_MULTIPLIERS[category] || 0.5;
    }

    build(metadataMap) {
        const placedObjects = [];
        const resourceNodes = [];

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

        const halfWidth = this.worldWidth / 2.0;
        const sampleGridSize = 60;
        const cellWidth = this.worldWidth / sampleGridSize;
        const attemptsPerCell = 4;

        for (let pass = 0; pass < 2; pass++) {
            for (let sz = 0; sz < sampleGridSize; sz++) {
                for (let sx = 0; sx < sampleGridSize; sx++) {
                    for (let attempt = 0; attempt < attemptsPerCell; attempt++) {
                    const px = (sx + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;
                    const pz = (sz + this.prng.nextRange(0.1, 0.9)) * cellWidth - halfWidth;

                    const py = this.terrain.getHeight(px, pz);

                    if (py < 0.05) continue;

                    const biome = this.biomeGen.getBiome(px, pz, py);
                    if (biome === BiomeType.OCEAN) continue;

                    let candidates;
                    if (biome === BiomeType.BEACH) {
                        if (pass === 0) {
                            candidates = assetsByBiome['Beach'];
                        } else {
                            candidates = [];
                        }
                    } else if (biome === BiomeType.FOREST) {
                        if (pass === 0) {
                            candidates = assetsByBiome['Forest'];
                        } else {
                            const jungleNoise = Math.sin(px * 0.17) * Math.cos(pz * 0.19);
                            if (jungleNoise > 0.35 && assetsByBiome['Jungle'].length > 0) {
                                candidates = assetsByBiome['Jungle'];
                            } else {
                                candidates = [];
                            }
                        }
                    } else if (biome === BiomeType.ROCK_AREA) {
                        if (pass === 0) {
                            if (py > 2.0 && assetsByBiome['Mountain'].length > 0) {
                                candidates = assetsByBiome['Mountain'];
                            } else {
                                candidates = assetsByBiome['RockArea'];
                            }
                        } else {
                            candidates = [];
                        }
                    } else {
                        if (pass === 0) {
                            if (this.prng.next() < 0.30 && assetsByBiome['Forest'].length > 0) {
                                candidates = assetsByBiome['Forest'];
                            } else {
                                candidates = [];
                            }
                        } else {
                            candidates = assetsByBiome['Grassland'];
                        }
                    }

                    if (!candidates || candidates.length === 0) continue;

                    let targetBiomeKey;
                    if (candidates === assetsByBiome['Beach']) targetBiomeKey = 'Beach';
                    else if (candidates === assetsByBiome['Jungle']) targetBiomeKey = 'Jungle';
                    else if (candidates === assetsByBiome['Forest']) targetBiomeKey = 'Forest';
                    else if (candidates === assetsByBiome['Mountain']) targetBiomeKey = 'Mountain';
                    else if (candidates === assetsByBiome['RockArea']) targetBiomeKey = 'RockArea';
                    else targetBiomeKey = 'Grassland';

                    const selectedAsset = this.weightedChoice(candidates);
                    if (!selectedAsset) continue;

                    const isLargeFeature = selectedAsset.category === 'Tree' || 
                                           selectedAsset.category === 'Palm' || 
                                           selectedAsset.category === 'Rock';
                    if (pass === 0 && !isLargeFeature) continue;
                    if (pass === 1 && isLargeFeature) continue;

                    const rules = selectedAsset.placementRules || {};
                    let spawnChance = rules.spawnChance !== undefined ? rules.spawnChance : 0.5;
                    if (selectedAsset.category === 'Tree' || selectedAsset.category === 'Palm') {
                        spawnChance = Math.min(0.98, spawnChance * 1.4);
                    }
                    if (this.prng.next() > spawnChance) continue;

                    const inferredTerrainType = selectedAsset.terrain;
                    
                    const step = 0.5;
                    const normal = this.terrain.getNormal(px, pz, step);
                    const slope = Math.acos(normal[1]) * (180.0 / Math.PI);
                    const maxSlope = rules.maxSlope !== undefined ? rules.maxSlope : 30;
                    if (slope > maxSlope) continue;

                    const heightRange = rules.heightRange || { min: 0.1, max: 10 };
                    if (py < heightRange.min || py > heightRange.max) continue;

                    const distToCenter = Math.sqrt(px * px + pz * pz);
                    const minDistanceToWater = rules.minDistanceToWater !== undefined ? rules.minDistanceToWater : 4.0;
                    const shoreDistance = this.island.radius - distToCenter;
                    if (distToCenter > (this.island.radius - minDistanceToWater)) continue;

                    const minDistanceToBeach = rules.minDistanceToBeach !== undefined ? rules.minDistanceToBeach : 0.0;
                    if (minDistanceToBeach > 0.0 && biome !== BiomeType.BEACH && this.island.isBeach(px, pz)) continue;

                    if (distToCenter < 5.0) continue;

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

                    const cluster = selectedAsset.clusterRules;
                    if (cluster && cluster.minSize > 1) {
                        const clusterSize = this.prng.nextInt(cluster.minSize, cluster.maxSize + 1);
                        const density = cluster.density || 0.3;
                        const radius = (clusterSize * density) + 1.5;
                        const minDistSq = minDistanceToAnother * minDistanceToAnother;

                        for (let c = 0; c < clusterSize; c++) {
                            const angle = this.prng.nextRange(0, Math.PI * 2);
                            const dist = this.prng.nextRange(0.5, radius);
                            const cX = px + Math.cos(angle) * dist;
                            const cZ = pz + Math.sin(angle) * dist;
                            const cY = this.terrain.getHeight(cX, cZ);

                            if (cY < 0.05) continue;
                            if (this.biomeGen.getBiome(cX, cZ, cY) !== biome) continue;

                            if (cY < heightRange.min || cY > heightRange.max) continue;

                            const cDistToCenter = Math.sqrt(cX * cX + cZ * cZ);
                            if (cDistToCenter > (this.island.radius - minDistanceToWater)) continue;
                            if (minDistanceToBeach > 0.0 && biome !== BiomeType.BEACH && this.island.isBeach(cX, cZ)) continue;

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

                            const catScale = this._getCategoryScale(selectedAsset.category);
                            const scaleVal = this.prng.nextRange(selectedAsset.minScale || 0.8, selectedAsset.maxScale || 1.2) * catScale;
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
                        const catScale = this._getCategoryScale(selectedAsset.category);
                        const scaleVal = this.prng.nextRange(selectedAsset.minScale || 0.8, selectedAsset.maxScale || 1.2) * catScale;
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
                    break;
                    }
                }
            }
        }

        const resourceSpawnRules = [
            { biome: BiomeType.BEACH, types: ['wood', 'barrel', 'rope', 'coconut'], count: 20 },
            { biome: BiomeType.GRASSLAND, types: ['stone'], count: 25 },
            { biome: BiomeType.FOREST, types: ['wood'], count: 25 },
            { biome: BiomeType.ROCK_AREA, types: ['stone'], count: 20 }
        ];

        const herbRules = [
            { biome: BiomeType.FOREST, types: ['herb'], count: 15 }
        ];
        resourceSpawnRules.push(...herbRules);

        const resourceSpecs = {
            'wood': { scale: [0.25, 0.6, 0.25] },
            'stone': { scale: [0.5, 0.3, 0.45] },
            'rope': { scale: [0.4, 0.15, 0.4] },
            'barrel': { scale: [0.4, 0.55, 0.4] },
            'coconut': { scale: [0.3, 0.3, 0.3] },
            'herb': { scale: [0.12, 0.06, 0.12] }
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

                const distFromCenter = Math.sqrt(rx * rx + rz * rz);
                if (distFromCenter < 4.0) continue;

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

                for (const node of resourceNodes) {
                    const dx = node.position[0] - rx;
                    const dz = node.position[2] - rz;
                    if (dx * dx + dz * dz < 1.6 * 1.6) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

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

        const landmarks = this._placeLandmarks(placedObjects, buildArea, resourceNodes);

        console.log("Placed objects count:", placedObjects.length);
        console.log("Placed objects stats:", placedObjects.reduce((acc, obj) => {
            const key = `${obj.biome}_${obj.category}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}));

        return {
            placedObjects,
            resourceNodes,
            buildArea,
            navigationGrid: navGrid,
            landmarks
        };
    }

    _placeLandmarks(placedObjects, buildArea, resourceNodes = []) {
        const landmarks = { waterfall: null, treasureChests: [] };

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

            const score = wy - radius * 0.02;
            if (score > bestScore) {
                bestScore = score;
                landmarks.waterfall = [wx, wy, wz];
            }
        }
        if (!landmarks.waterfall) {
            const fx = this.island.innerRadius * 0.55;
            landmarks.waterfall = [fx, this.terrain.getHeight(fx, -fx * 0.4), -fx * 0.4];
        }

        if (landmarks.waterfall) {
            const [wfx, , wfz] = landmarks.waterfall;
            const clearRadiusSq = 6.5 * 6.5;
            const clearOverlapping = (arr) => {
                for (let i = arr.length - 1; i >= 0; i--) {
                    const dx = arr[i].position[0] - wfx;
                    const dz = arr[i].position[2] - wfz;
                    if (dx * dx + dz * dz < clearRadiusSq) arr.splice(i, 1);
                }
            };
            clearOverlapping(placedObjects);
            clearOverlapping(resourceNodes);
        }

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

                const normal = this.terrain.getNormal(cx, cz, 0.5);
                const slope = Math.acos(normal[1]) * (180.0 / Math.PI);
                if (slope > 20) continue;

                const bdx = cx - buildArea[0];
                const bdz = cz - buildArea[2];
                if (bdx * bdx + bdz * bdz < 6 * 6) continue;

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
