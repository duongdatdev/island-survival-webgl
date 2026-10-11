import { PRNG } from './PRNG.js';

const WIDTH = 640;
const CHUNK = 40;
const STEP = 1.25;
const COLORS = {
    Beach: [0.83, 0.73, 0.5], Grassland: [0.29, 0.46, 0.19], Forest: [0.15, 0.33, 0.13],
    RockArea: [0.43, 0.42, 0.37], Highland: [0.38, 0.43, 0.33], Ocean: [0.12, 0.25, 0.29],
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
    constructor() { this.width = WIDTH; this.size = WIDTH / STEP; }

    generate(seed, metadataMap = {}, debug = false, options = {}) {
        const started = performance.now();
        this.seed = String(seed);
        this.prng = new PRNG('campaign-terrain:' + seed);
        this.rotation = this.prng.nextRange(-Math.PI, Math.PI);
        const radius = this.prng.nextRange(260, 280);
        this.island = { radius, innerRadius: radius - 26, outerBeachRadius: radius + 32,
            underwaterBeachExtent: 32, center: [0, 0], isBeach: (x, z) => Math.hypot(x, z) > radius - 26,
            isLand: (x, z) => Math.hypot(x, z) <= radius, isOcean: (x, z) => Math.hypot(x, z) > radius };
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
        return { seed: this.seed, generatorVersion: 2, mode: 'campaign', width: WIDTH,
            terrain, terrainGenerator: this, biomeGenerator: this, placedObjects, resourceNodes,
            spawnPosition, buildArea: [...start], pois: this.pois, paths: this.paths, shortcutPath: this.shortcutPath,
            landmarks: { waterfall: this.poiById.waterfall.position, treasureChests: [] },
            navigationGrid: this._navigation(placedObjects), generationTimeMs: performance.now() - started,
            objectCount: placedObjects.length + resourceNodes.length };
    }

    _baseHeight(x, z) {
        const distance = Math.hypot(x, z);
        const radius = this.island.radius;
        if (distance > radius) return -Math.min(12, ((distance - radius) / 32) ** 1.25 * 10);
        if (distance >= this.island.innerRadius) return 0.22;
        const inland = Math.min(1, (radius - distance - 26) / 35);
        const gradient = inland * inland * (3 - 2 * inland);
        const localX = x * Math.cos(this.rotation) + z * Math.sin(this.rotation);
        const localZ = -x * Math.sin(this.rotation) + z * Math.cos(this.rotation);
        const hills = 14 * Math.exp(-((localX + 120) ** 2 + (localZ + 65) ** 2) / 10000)
            + 18 * Math.exp(-((localX - 30) ** 2 + (localZ + 160) ** 2) / 12000);
        const noise = this.waves.reduce((sum, wave) => sum + Math.sin(x * wave.x) * Math.cos(z * wave.z) * wave.amplitude, 0);
        return 0.22 + gradient * Math.max(0.3, 2 + hills + noise);
    }

    getHeight(x, z) {
        let height = this._baseHeight(x, z);
        if (!this.pois) return height;
        for (const poi of this.pois) {
            if (poi.role === 'wreck') continue;
            const distance = Math.hypot(x - poi.position[0], z - poi.position[2]);
            if (distance < poi.radius + 5) {
                const blend = Math.max(0, Math.min(1, (poi.radius + 5 - distance) / 5));
                height = height * (1 - blend) + poi.position[1] * blend;
            }
        }
        for (const [a, b] of [...(this.paths || []), ...(this.shortcutPath ? [this.shortcutPath] : [])]) {
            const point = segmentPoint(x, z, a, b);
            if (point.distance < 7) {
                const blend = Math.min(1, (7 - point.distance) / 3);
                height = height * (1 - blend) + (a[1] + (b[1] - a[1]) * point.t) * blend;
            }
        }
        // Keep architectural floors flat after all approach-path blends.
        for (const poi of this.pois) {
            if (poi.role === 'wreck') continue;
            const d = Math.hypot(x - poi.position[0], z - poi.position[2]);
            if (d < poi.radius + 5) {
                const amount = Math.min(1, (poi.radius + 5 - d) / 5);
                height = height * (1 - amount) + poi.position[1] * amount;
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
        const distance = Math.hypot(x, z);
        if (distance > this.island.radius) return 'Ocean';
        if (distance > this.island.innerRadius) return 'Beach';
        if (height > 11) return 'Highland';
        const angle = (Math.atan2(z, x) - this.rotation + Math.PI * 4) % (Math.PI * 2);
        if (angle > 2.7 && angle < 4.5) return 'RockArea';
        return angle > 1.3 && angle < 3.4 ? 'Forest' : 'Grassland';
    }

    getBiomeColor(biome) { return COLORS[biome] || COLORS.Grassland; }

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
            const candidates = available.filter(asset => asset.biome === biome
                || biome === 'Highland' && ['RockArea', 'Forest'].includes(asset.biome));
            if (!candidates.length) continue;
            const asset = prng.choose(candidates);
            const scale = prng.nextRange(asset.minScale || 0.8, asset.maxScale || 1.2);
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
            normals.push(...this.getNormal(wx, wz, step / 2));
            colors.push(...this.getBiomeColor(this.getBiome(wx, wz, height)), 1);
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
            cells[z * size + x] = this.getHeight(wx, wz) < 0.15 ? 1 : 0;
        }
        for (const object of objects.filter(object => object.navigationBlocker)) {
            const x = Math.floor((object.position[0] + WIDTH / 2) / 4);
            const z = Math.floor((object.position[2] + WIDTH / 2) / 4);
            if (x >= 0 && z >= 0 && x < size && z < size) cells[z * size + x] = 1;
        }
        return { size, step: 4, halfWidth: WIDTH / 2, cells };
    }
}
