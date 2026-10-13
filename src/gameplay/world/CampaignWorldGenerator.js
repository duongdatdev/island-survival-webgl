import { PRNG } from './PRNG.js';

const WIDTH = 640;
const CHUNK = 40;
const STEP = 1.25;
const smooth = (low, high, value) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
};
const mixColor = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
const COLORS = {
    Beach: [0.83, 0.73, 0.5], Grassland: [0.29, 0.46, 0.19], Forest: [0.15, 0.33, 0.13],
    RockArea: [0.43, 0.42, 0.37], Highland: [0.38, 0.43, 0.33], Ocean: [0.12, 0.25, 0.29],
    Jungle: [0.09, 0.29, 0.16], Mangrove: [0.28, 0.34, 0.21], Savanna: [0.61, 0.53, 0.25],
};
const POIS = [
    ['wreck_beach', 'Bãi đắm tàu', 0, 0.93, 'beach', 10],
    ['waterfall', 'Thác nước', 0.2, 0.63, 'waterfall', 10],
    ['abandoned_camp', 'Trại bỏ hoang', -0.32, 0.29, 'camp', 12],
    ['mine', 'Hang mỏ', -0.57, -0.22, 'mine', 14],
    ['weather_station', 'Trạm khí tượng', 0.08, -0.61, 'station', 14],
    ['offshore_wreck', 'Xác tàu ngoài bờ', 0.98, 0.42, 'wreck', 10],
    ['coastal_depot', 'Kho ven biển', 0.75, 0.13, 'depot', 12],
    ['signal_tower', 'Tháp tín hiệu', 0.56, -0.51, 'tower', 12],
];
const PATHS = [
    ['wreck_beach', 'waterfall'], ['waterfall', 'abandoned_camp'], ['abandoned_camp', 'mine'],
    ['mine', 'weather_station'], ['weather_station', 'signal_tower'],
    ['signal_tower', 'coastal_depot'], ['coastal_depot', 'waterfall'],
];

function segmentPoint(x, z, a, b) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
    return { distance: Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t), t };
}

/** Campaign geometry is versioned separately so Classic seeds never change. */
export class CampaignWorldGenerator {
    constructor(generatorVersion = 3) { this.width = WIDTH; this.size = WIDTH / STEP; this.generatorVersion = generatorVersion; }

    generate(seed, metadataMap = {}, debug = false, options = {}) {
        const started = performance.now();
        this.seed = String(seed);
        this.prng = new PRNG('campaign-terrain:' + seed);
        this.rotation = this.prng.nextRange(-Math.PI, Math.PI);
        const radius = this.prng.nextRange(260, 280);
        this.island = { radius, innerRadius: radius - 26, outerBeachRadius: radius + 32,
            underwaterBeachExtent: 32, center: [0, 0], isBeach: (x, z) => this.getBiome(x, z) === 'Beach',
            isLand: (x, z) => this._shoreDistance(x, z) >= 0, isOcean: (x, z) => this._shoreDistance(x, z) < 0 };
        this.waves = Array.from({ length: 4 }, () => ({ x: this.prng.nextRange(0.012, 0.037),
            z: this.prng.nextRange(0.012, 0.037), amplitude: this.prng.nextRange(0.3, 1) }));
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        this.pois = POIS.map(([id, name, nx, nz, role, reservedRadius]) => {
            const x = radius * (nx * cos - nz * sin), z = radius * (nx * sin + nz * cos);
            return { id, name, role, radius: reservedRadius, position: [x, this._baseHeight(x, z), z],
                yaw: this.rotation, rewardId: `poi:${id}` };
        });
        this.poiById = Object.fromEntries(this.pois.map(poi => [poi.id, poi]));
        this.paths = PATHS.map(([a, b]) => [this.poiById[a].position, this.poiById[b].position]);
        this.shortcutPath = [this.poiById.abandoned_camp.position, this.poiById.weather_station.position];
        const start = this.poiById.wreck_beach.position;
        const spawnPosition = [start[0] * 0.98, 0, start[2] * 0.98];
        spawnPosition[1] = this.getHeight(spawnPosition[0], spawnPosition[2]);
        const placedObjects = options.props === false ? [] : this._placeEnvironment(metadataMap);
        const resourceNodes = this._resources();
        const terrain = options.mesh === false ? { chunks: [] } : this._terrain(debug);
        return { seed: this.seed, generatorVersion: this.generatorVersion, mode: 'campaign', width: WIDTH,
            terrain, terrainGenerator: this, biomeGenerator: this, placedObjects, resourceNodes,
            spawnPosition, buildArea: [...start], pois: this.pois, paths: this.paths, shortcutPath: this.shortcutPath,
            landmarks: { waterfall: this.poiById.waterfall.position, treasureChests: [] },
            navigationGrid: this._navigation(placedObjects), generationTimeMs: performance.now() - started,
            objectCount: placedObjects.length + resourceNodes.length };
    }

    _shoreDistance(x, z) {
        const angle = Math.atan2(z, x) - this.rotation;
        // Small coves and headlands, sheltered around the arrival beach (local +Z).
        const shelter = 1 - smooth(0.65, 0.95, Math.sin(angle));
        const coves = shelter * (8 + 6 * Math.sin(angle * 3 + 0.4) + 3 * Math.sin(angle * 7));
        return this.island.radius - Math.max(0, coves) - Math.hypot(x, z);
    }

    _baseHeight(x, z) {
        const shore = this._shoreDistance(x, z);
        if (shore < 0) return -Math.min(12, (-shore / 32) ** 1.25 * 10);
        const localX = x * Math.cos(this.rotation) + z * Math.sin(this.rotation);
        const localZ = -x * Math.sin(this.rotation) + z * Math.cos(this.rotation);
        const hill = (cx, cz, sx, sz, height) => height * Math.exp(-(((localX - cx) / sx) ** 2) - ((localZ - cz) / sz) ** 2);
        const mountains = hill(-42, -25, 65, 93, 66) + hill(60, -100, 48, 70, 53)
            + hill(-130, -60, 42, 65, 34);
        // The two foreground bluffs frame the climb from the beach to the waterfall.
        const foothills = hill(-62, 159, 36, 47, 25) + hill(92, 133, 42, 55, 34)
            + hill(-120, 74, 51, 42, 19);
        const ridges = 3.5 * Math.sin(localX * 0.055 + Math.sin(localZ * 0.023))
            + 2.2 * Math.cos(localZ * 0.067 + localX * 0.018);
        const noise = this.waves.reduce((sum, wave) => sum + Math.sin(x * wave.x) * Math.cos(z * wave.z) * wave.amplitude, 0);
        const beach = 0.08 + 0.52 * smooth(0, 20, shore);
        let height = beach + smooth(12, 54, shore) * Math.max(0.4, 3 + mountains + foothills + ridges + noise);
        if (this.generatorVersion >= 3) {
            const { Mangrove, Savanna } = this.biomeWeights(x, z);
            // Sheltered, dry tidal flats and broad rolling grassland; paths/POI pads
            // are graded afterwards by getHeight, so story routes stay traversable.
            height = height * (1 - Mangrove * .88) + (0.65 + noise * .12) * Mangrove * .88;
            height += Savanna * smooth(25, 60, shore) * (1.6 + Math.sin(localZ * .035) * 1.3);
        }
        return height;
    }

    biomeWeights(x, z) {
        const lx = x * Math.cos(this.rotation) + z * Math.sin(this.rotation);
        const lz = -x * Math.sin(this.rotation) + z * Math.cos(this.rotation);
        const patch = (cx, cz, sx, sz) => 1 - smooth(.55, 1.15,
            Math.hypot((lx - cx) / sx, (lz - cz) / sz) + .045 * Math.sin(lx * .075) * Math.cos(lz * .06));
        return { Jungle: patch(-130, 80, 105, 95), Mangrove: patch(183, 139, 64, 57),
            Savanna: patch(150, -25, 100, 150) };
    }

    getHeight(x, z) {
        let height = this._baseHeight(x, z);
        if (!this.pois) return height;
        for (const poi of this.pois) {
            if (poi.role === 'wreck') continue;
            const distance = Math.hypot(x - poi.position[0], z - poi.position[2]);
            if (distance < poi.radius + 5) {
                const blend = 1 - smooth(poi.radius, poi.radius + 5, distance);
                const padHeight = poi.position[1] - (poi.role === 'mine' ? 0.2 : 0);
                height = height * (1 - blend) + padHeight * blend;
            }
        }
        for (const [a, b] of [...(this.paths || []), ...(this.shortcutPath ? [this.shortcutPath] : [])]) {
            const point = segmentPoint(x, z, a, b);
            if (point.distance < 15) {
                const blend = 1 - smooth(4, 15, point.distance);
                const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
                const ramp = smooth(18 / length, 1 - 18 / length, point.t);
                height = height * (1 - blend) + (a[1] + (b[1] - a[1]) * ramp) * blend;
            }
        }
        // Keep architectural floors flat after all approach-path blends. The cave's
        // floor starts at local Y=0; bury the terrain beneath it to prevent z-fighting.
        for (const poi of this.pois) {
            if (poi.role === 'wreck') continue;
            const d = Math.hypot(x - poi.position[0], z - poi.position[2]);
            if (d < poi.radius + 5) {
                const amount = 1 - smooth(poi.radius, poi.radius + 5, d);
                const padHeight = poi.position[1] - (poi.role === 'mine' ? 0.2 : 0);
                height = height * (1 - amount) + padHeight * amount;
            }
        }
        return height;
    }

    getNormal(x, z, step = 0.625) {
        const nx = this.getHeight(x - step, z) - this.getHeight(x + step, z);
        const nz = this.getHeight(x, z - step) - this.getHeight(x, z + step);
        const length = Math.hypot(nx, step * 2, nz);
        return [nx / length, step * 2 / length, nz / length];
    }

    getBiome(x, z, height = this.getHeight(x, z)) {
        const shore = this._shoreDistance(x, z);
        if (shore < 0) return 'Ocean';
        if (this.generatorVersion >= 3) {
            const weights = this.biomeWeights(x, z);
            if (weights.Mangrove > .35 && shore > 8 && height < 15) return 'Mangrove';
            if (height > 32) return 'Highland';
            if (shore > 28 && weights.Jungle > .35) return 'Jungle';
            if (shore > 25 && weights.Savanna > .35) return 'Savanna';
        }
        if (shore < 22 && height < 2.5) return 'Beach';
        if (height > 32) return 'Highland';
        const angle = (Math.atan2(z, x) - this.rotation + Math.PI * 4) % (Math.PI * 2);
        if (angle > 2.7 && angle < 4.5) return 'RockArea';
        return angle > 1.3 && angle < 3.4 ? 'Forest' : 'Grassland';
    }

    getBiomeColor(biome) { return COLORS[biome] || COLORS.Grassland; }

    _groundColor(x, z, height, normal) {
        const shore = this._shoreDistance(x, z);
        const variation = Math.sin(x * 0.17 + Math.cos(z * 0.11)) * Math.cos(z * 0.13) * 0.025;
        const grass = mixColor([0.30, 0.44, 0.18], [0.19, 0.32, 0.14], smooth(6, 35, height));
        let color = mixColor([0.83, 0.75, 0.55], grass, smooth(18, 38, shore));
        if (this.generatorVersion >= 3) {
            const weights = this.biomeWeights(x, z);
            for (const biome of ['Savanna', 'Jungle', 'Mangrove']) {
                color = mixColor(color, COLORS[biome], weights[biome] * smooth(8, 36, shore) * (1 - smooth(28, 42, height)));
            }
        }
        const rock = Math.max(smooth(0.13, 0.48, 1 - normal[1]), smooth(39, 66, height) * 0.85);
        color = mixColor(color, [0.49, 0.48, 0.42], rock);
        if (shore < 4) color = mixColor([0.43, 0.43, 0.33], color, smooth(-5, 4, shore));
        for (const [a, b] of this.paths) {
            const point = segmentPoint(x, z, a, b);
            color = mixColor(color, [0.53, 0.44, 0.29], (1 - smooth(1.4, 3.3, point.distance)) * smooth(22, 36, shore) * 0.65);
        }
        return color.map(value => Math.max(0, Math.min(1, value + variation)));
    }

    _reserved(x, z) {
        return this.pois.some(poi => Math.hypot(x - poi.position[0], z - poi.position[2]) < poi.radius + 5)
            || this.paths.some(([a, b]) => segmentPoint(x, z, a, b).distance < 8)
            || this.shortcutPath && segmentPoint(x, z, ...this.shortcutPath).distance < 5;
    }

    _placeEnvironment(metadataMap) {
        const prng = new PRNG('campaign-props:' + this.seed);
        const available = Object.values(metadataMap).filter(asset => asset.objPath && asset.proceduralPlacement !== false);
        const placed = [];
        const occupied = new Set();
        for (let attempt = 0; attempt < 10000 && placed.length < 2400; attempt++) {
            const x = prng.nextRange(-this.island.radius, this.island.radius);
            const z = prng.nextRange(-this.island.radius, this.island.radius);
            if (Math.hypot(x, z) > this.island.radius || this._reserved(x, z)) continue;
            const key = `${Math.round(x / 4)}:${Math.round(z / 4)}`;
            if (occupied.has(key)) continue;
            const height = this.getHeight(x, z);
            const biome = this.getBiome(x, z, height);
            if (biome === 'Ocean') continue;
            const slope = this.getNormal(x, z)[1];
            const families = this.generatorVersion < 3 ? [biome, ...(biome === 'Highland' ? ['RockArea'] : [])]
                : ({ Jungle: ['Jungle', 'Forest', 'Beach'], Mangrove: ['Jungle', 'Beach'],
                    Savanna: ['Savanna', 'Grassland'], Highland: ['Mountain', 'RockArea'] }[biome] || [biome]);
            let candidates = available.filter(asset => families.includes(asset.biome) || asset.biome === biome)
                .filter(asset => slope > 0.88 || asset.biome === 'RockArea');
            if (this.generatorVersion >= 3 && biome === 'Jungle') {
                candidates = candidates.filter(asset => asset.biome !== 'Forest' || asset.id.startsWith('normaltree'));
            }
            if (this.generatorVersion >= 3 && ['Savanna', 'Mangrove'].includes(biome)) {
                const trees = candidates.filter(asset => asset.biome === biome);
                // Open acacia parkland versus dense mangrove stands.
                if (trees.length && prng.next() < (biome === 'Mangrove' ? .7 : .16)) candidates = trees;
                else candidates = candidates.filter(asset => asset.biome !== biome);
            }
            if (!candidates.length) continue;
            const asset = prng.choose(candidates);
            const scale = prng.nextRange(asset.minScale || 0.8, asset.maxScale || 1.2)
                * (biome === 'Jungle' ? 1.25 : biome === 'Mangrove' ? .8 : 1);
            occupied.add(key);
            placed.push({ ...asset, position: [x, height, z], rotation: [0, prng.nextRange(0, Math.PI * 2), 0],
                scale: [scale, scale, scale], biome, collision: !!asset.collision,
                navigationBlocker: !!asset.navigationBlocker });
        }
        return placed;
    }

    _resources() {
        const prng = new PRNG('campaign-resources:' + this.seed);
        const nodes = [];
        for (let index = 0; index < 320; index++) {
            const angle = prng.nextRange(0, Math.PI * 2);
            const radius = Math.sqrt(prng.next()) * (this.island.radius - 15);
            const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
            const biome = this.getBiome(x, z);
            if (biome === 'Ocean' || this.getNormal(x, z)[1] < 0.7) continue;
            const id = biome === 'RockArea' || biome === 'Highland' ? prng.choose(['stone', 'iron_ore', 'copper_ore'])
                : prng.choose(['wood', 'fiber', 'coconut', 'herb']);
            nodes.push({ worldNodeId: `resource-${index}`, id, position: [x, this.getHeight(x, z), z] });
        }
        const start = this.poiById.wreck_beach.position;
        for (let index = 0; index < 36; index++) {
            const angle = index * 2.399;
            const x = start[0] * 0.97 + Math.cos(angle) * (5 + index % 8);
            const z = start[2] * 0.97 + Math.sin(angle) * (5 + index % 8);
            const id = ['wood', 'stone', 'fiber', 'coconut'][index % 4];
            nodes.push({ worldNodeId: `starter-${index}`, id, position: [x, this.getHeight(x, z), z] });
        }
        const mine = this.poiById.mine.position;
        for (let index = 0; index < 24; index++) {
            const angle = index / 24 * Math.PI * 2;
            const x = mine[0] + Math.cos(angle) * 4, z = mine[2] + Math.sin(angle) * 4;
            nodes.push({ worldNodeId: `mine-vein-${index}`, id: index < 14 ? 'iron_ore' : 'copper_ore', amount: 4,
                position: [x, mine[1] + 0.1, z] });
        }
        return nodes;
    }

    _terrain() {
        const chunks = [];
        for (let cz = 0; cz < WIDTH / CHUNK; cz++) {
            for (let cx = 0; cx < WIDTH / CHUNK; cx++) {
                const x = cx * CHUNK - WIDTH / 2, z = cz * CHUNK - WIDTH / 2;
                const center = [x + CHUNK / 2, this.getHeight(x + CHUNK / 2, z + CHUNK / 2), z + CHUNK / 2];
                if (Math.hypot(center[0], center[2]) > this.island.radius + CHUNK) continue;
                chunks.push({ id: `${cx}:${cz}`, center, radius: 36,
                    levels: [STEP, STEP * 2, STEP * 4].map(step => this._chunkMesh(x, z, step)) });
            }
        }
        return { chunks };
    }

    _chunkMesh(originX, originZ, step) {
        const size = CHUNK / step;
        const positions = [], normals = [], colors = [], indices = [];
        for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
            const wx = originX + x * step, wz = originZ + z * step;
            const height = this.getHeight(wx, wz);
            positions.push(wx, height, wz);
            const normal = this.getNormal(wx, wz);
            normals.push(...normal);
            colors.push(...this._groundColor(wx, wz, height, normal), 1);
        }
        for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
            const a = z * (size + 1) + x, b = a + size + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
        // Skirts conceal height gaps at boundaries between different LODs.
        const perimeter = [...Array.from({ length: size + 1 }, (_, i) => i),
            ...Array.from({ length: size }, (_, i) => (i + 1) * (size + 1) + size),
            ...Array.from({ length: size }, (_, i) => size * (size + 1) + size - i - 1),
            ...Array.from({ length: size - 1 }, (_, i) => (size - i - 1) * (size + 1))];
        const skirtStart = positions.length / 3;
        for (const index of perimeter) {
            positions.push(positions[index * 3], positions[index * 3 + 1] - 2, positions[index * 3 + 2]);
            normals.push(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]);
            colors.push(...colors.slice(index * 4, index * 4 + 4));
        }
        for (let index = 0; index < perimeter.length; index++) {
            const next = (index + 1) % perimeter.length;
            indices.push(perimeter[index], perimeter[next], skirtStart + index,
                perimeter[next], skirtStart + next, skirtStart + index);
        }
        return { positions: new Float32Array(positions), normals: new Float32Array(normals),
            colors: new Float32Array(colors), indices: new Uint16Array(indices) };
    }

    _navigation(objects) {
        const size = WIDTH / 4;
        const cells = new Uint8Array(size * size);
        for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
            const wx = x * 4 - WIDTH / 2, wz = z * 4 - WIDTH / 2;
            cells[z * size + x] = this.getHeight(wx, wz) < 0.15 || this.getNormal(wx, wz)[1] < 0.78 ? 1 : 0;
        }
        for (const object of objects.filter(object => object.navigationBlocker)) {
            const x = Math.floor((object.position[0] + WIDTH / 2) / 4);
            const z = Math.floor((object.position[2] + WIDTH / 2) / 4);
            if (x >= 0 && z >= 0 && x < size && z < size) cells[z * size + x] = 1;
        }
        return { size, step: 4, halfWidth: WIDTH / 2, cells };
    }
}
