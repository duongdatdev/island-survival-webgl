import { ShaderProgram } from './ShaderProgram.js';
import { Mat4 } from '../math/Mat4.js';
import { createBasicShader } from '../shaders/BasicShader.js';

const CELL_SIZE = 18;
const MAX_CACHED_CELLS = 320;
const DEFAULT_RANGE = 118;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function hash01(x, z, salt) {
    let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function colorFor(biome, kind, variation) {
    const colors = {
        Grassland: [[0.29, 0.40, 0.18], [0.42, 0.46, 0.25]],
        Forest: [[0.18, 0.35, 0.15], [0.31, 0.43, 0.19]],
        Jungle: [[0.12, 0.32, 0.17], [0.22, 0.40, 0.20]],
        Mangrove: [[0.28, 0.35, 0.21], [0.39, 0.41, 0.25]],
        Savanna: [[0.48, 0.45, 0.20], [0.59, 0.50, 0.25]],
        Beach: [[0.53, 0.49, 0.36], [0.67, 0.59, 0.41]],
        Highland: [[0.37, 0.40, 0.33], [0.48, 0.47, 0.38]],
        RockArea: [[0.42, 0.42, 0.36], [0.53, 0.49, 0.40]],
    };
    const pair = colors[biome] || colors.Grassland;
    const base = kind === 'pebble' ? [0.45, 0.43, 0.37]
        : kind === 'leaf' ? [0.34, 0.37, 0.19]
            : pair[variation > 0.5 ? 1 : 0];
    const factor = kind === 'pebble' ? 0.92 + variation * 0.16
        : kind === 'leaf' ? 0.82 + variation * 0.3
            : 0.92 + variation * 0.14;
    return [base[0] * factor, base[1] * factor, base[2] * factor, 1];
}

const vertexTransform = `
    float c = cos(aInstanceParams.x);
    float s = sin(aInstanceParams.x);
    vec2 rotated = vec2(aPosition.x * c - aPosition.z * s, aPosition.x * s + aPosition.z * c);
    localPosition = vec3(aInstancePosition.x + rotated.x * aInstancePosition.w,
                         aInstancePosition.y + aPosition.y * aInstancePosition.w,
                         aInstancePosition.z + rotated.y * aInstancePosition.w);
    localNormal = normalize(vec3(aNormal.x * c - aNormal.z * s, aNormal.y, aNormal.x * s + aNormal.z * c));
    localColor = aInstanceColor;
`;
const vertexDeclarations = `
    layout(location = 4) in vec4 aInstancePosition;
    layout(location = 5) in vec4 aInstanceColor;
    layout(location = 6) in vec2 aInstanceParams;
`;

/** Procedural, seed-stable decoration in a bounded camera-centered cell pool. */
export class GroundCover {
    constructor(gl, world) {
        this.gl = gl;
        this.world = world;
        this.generator = world.terrainGenerator || world.biomeGenerator || world;
        this.seed = String(world.seed ?? this.generator.seed ?? 'island');
        this.seedHash = Array.from(this.seed).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
        this.cells = new Map();
        this.activeGrass = [];
        this.activePebbles = [];
        this.activeShrubs = [];
        this.activeLeaves = [];
        this.cameraPosition = [0, 0, 0];
        this.range = DEFAULT_RANGE;
        this.density = 1;
        this.disposed = false;
        this.modelMatrix = Mat4.create();

        this.grassGeometry = this._createGeometry(this._grassVertices());
        this.shrubGeometry = this._createGeometry(this._shrubVertices());
        this.leafGeometry = this._createGeometry(this._leafVertices());
        this.pebbleGeometry = this._createGeometry(this._pebbleVertices());
        const shader = createBasicShader({ vertexDeclarations, vertexTransform });
        this.program = new ShaderProgram(gl, shader.vertex, shader.fragment);
    }

    update(cameraPosition, options = {}) {
        if (this.disposed) return;
        this.cameraPosition = [cameraPosition[0], cameraPosition[1], cameraPosition[2]];
        this.range = clamp(Number(options.viewDistance ?? options.range ?? DEFAULT_RANGE), 24, 220);
        const qualityDensity = { low: 0.32, medium: 0.58, high: 1, ultra: 1.35 };
        const quality = String(options.quality || '').toLowerCase();
        const nextDensity = clamp(Number(options.density ?? qualityDensity[quality] ?? 1), 0, 1.5);
        if (nextDensity !== this.density) this.cells.clear();
        this.density = nextDensity;
        this.activeGrass = [];
        this.activePebbles = [];
        this.activeShrubs = [];
        this.activeLeaves = [];
        if (this.density <= 0) {
            this._uploadInstances(this.grassGeometry, []);
            this._uploadInstances(this.shrubGeometry, []);
            this._uploadInstances(this.leafGeometry, []);
            this._uploadInstances(this.pebbleGeometry, []);
            return;
        }

        const cx = Math.floor(cameraPosition[0] / CELL_SIZE);
        const cz = Math.floor(cameraPosition[2] / CELL_SIZE);
        const cellRange = Math.ceil(this.range / CELL_SIZE);
        for (let z = cz - cellRange; z <= cz + cellRange; z++) {
            for (let x = cx - cellRange; x <= cx + cellRange; x++) {
                const centerX = (x + 0.5) * CELL_SIZE;
                const centerZ = (z + 0.5) * CELL_SIZE;
                const distance = Math.hypot(centerX - cameraPosition[0], centerZ - cameraPosition[2]);
                if (distance > this.range + CELL_SIZE) continue;
                const key = `${x}:${z}`;
                let cell = this.cells.get(key);
                if (!cell) {
                    cell = this._buildCell(x, z);
                    this.cells.set(key, cell);
                }
                for (const instance of cell.instances) {
                    const d = Math.hypot(instance.position[0] - cameraPosition[0], instance.position[2] - cameraPosition[2]);
                    if (d > this.range) continue;
                    if (instance.kind === 'pebble') this.activePebbles.push(instance);
                    else if (instance.kind === 'leaf') this.activeLeaves.push(instance);
                    else if (instance.kind === 'shrub') this.activeShrubs.push(instance);
                    else this.activeGrass.push(instance);
                }
            }
        }

        if (this.cells.size > MAX_CACHED_CELLS) {
            const farthest = [...this.cells.entries()].sort((a, b) =>
                Math.hypot(b[1].x - cx, b[1].z - cz) - Math.hypot(a[1].x - cx, a[1].z - cz));
            for (let i = 0; i < farthest.length - MAX_CACHED_CELLS; i++) this.cells.delete(farthest[i][0]);
        }
        this._uploadInstances(this.grassGeometry, this.activeGrass);
        this._uploadInstances(this.shrubGeometry, this.activeShrubs);
        this._uploadInstances(this.leafGeometry, this.activeLeaves);
        this._uploadInstances(this.pebbleGeometry, this.activePebbles);
    }

    _buildCell(cellX, cellZ) {
        const count = Math.round(18 * this.density);
        const instances = [];
        const offsetX = cellX * CELL_SIZE;
        const offsetZ = cellZ * CELL_SIZE;
        for (let i = 0; i < count; i++) {
            // Each cell holds a few compact clusters with spaces left between them.
            const anchorX = offsetX + 3 + hash01(cellX * 17 + i, cellZ, this.seedHash) * (CELL_SIZE - 6);
            const anchorZ = offsetZ + 3 + hash01(cellX, cellZ * 17 + i, this.seedHash ^ 0x632be5ab) * (CELL_SIZE - 6);
            const cluster = hash01(cellX + i * 7, cellZ - i * 11, this.seedHash ^ 0x41c64e6d);
            const members = cluster > 0.68 ? 3 : cluster > 0.38 ? 2 : 1;
            for (let member = 0; member < members; member++) {
                const x = anchorX + (hash01(cellX + i * 29, cellZ + member, this.seedHash ^ 0x9e3779b9) - 0.5) * 3.8;
                const z = anchorZ + (hash01(cellX + member, cellZ + i * 31, this.seedHash ^ 0x85ebca6b) - 0.5) * 3.8;
                const y = this.generator.getHeight?.(x, z);
                if (!Number.isFinite(y) || y < 0.45) continue;
                const biome = this.generator.getBiome?.(x, z, y) || 'Grassland';
                if (biome === 'Ocean' || biome === 'Beach' && y < 0.8) continue;
                if (this.generator._reserved?.(x, z)) continue;
                const normal = this.generator.getNormal?.(x, z) || [0, 1, 0];
                if (normal[1] < 0.84) continue;

                const roll = hash01(cellX * 43 + i, cellZ * 47 + member, this.seedHash ^ 0xc2b2ae35);
                const leafBiome = ['Forest', 'Jungle', 'Mangrove'].includes(biome);
                const kind = roll > 0.91 ? 'pebble'
                    : roll > (leafBiome ? 0.80 : 0.86) ? 'leaf'
                        : roll > 0.62 ? 'shrub' : 'grass';
                const variation = hash01(cellX + i, cellZ - member, this.seedHash ^ 0x27d4eb2f);
                const scale = kind === 'pebble' ? 0.18 + variation * 0.18
                    : kind === 'leaf' ? 0.36 + variation * 0.24
                        : kind === 'shrub' ? 0.74 + variation * 0.5
                            : 0.56 + variation * 0.58;
                instances.push({
                    kind, biome, position: [x, y + (kind === 'pebble' || kind === 'leaf' ? 0.018 : 0.012), z], scale,
                    rotation: hash01(cellX + member, cellZ + i, this.seedHash ^ 0x165667b1) * Math.PI * 2,
                    color: colorFor(biome, kind, variation),
                });
            }
        }
        return { x: cellX, z: cellZ, instances };
    }

    _uploadInstances(geometry, instances) {
        const data = new Float32Array(instances.length * 10);
        for (let i = 0; i < instances.length; i++) {
            const item = instances[i], offset = i * 10;
            data[offset] = item.position[0];
            data[offset + 1] = item.position[1];
            data[offset + 2] = item.position[2];
            data[offset + 3] = item.scale;
            data[offset + 4] = item.color[0];
            data[offset + 5] = item.color[1];
            data[offset + 6] = item.color[2];
            data[offset + 7] = 1;
            data[offset + 8] = item.rotation;
            data[offset + 9] = 0;
        }
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        geometry.instanceCount = instances.length;
    }

    _createGeometry(vertices) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        const vertexBuffer = gl.createBuffer();
        const instanceBuffer = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
        gl.enableVertexAttribArray(2);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        const instanceStride = 10 * Float32Array.BYTES_PER_ELEMENT;
        for (const [location, size, offset] of [[4, 4, 0], [5, 4, 4], [6, 2, 8]]) {
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, instanceStride, offset * Float32Array.BYTES_PER_ELEMENT);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribDivisor(location, 1);
        }
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return { vao, vertexBuffer, instanceBuffer, vertexCount: vertices.length / 10, instanceCount: 0 };
    }

    _grassVertices() {
        const vertices = [];
        for (const [x, z, h, w] of [[0, 0, 0.68, 0], [-0.23, 0.08, 0.48, -0.10], [0.18, -0.12, 0.56, 0.09]]) {
            // Each blade is a narrow triangle, with its face angled up for light response.
            vertices.push(x - 0.07, 0.02, z, 0, 0.72, 0.69, 1, 1, 1, 1);
            vertices.push(x + 0.07, 0.02, z, 0, 0.72, 0.69, 1, 1, 1, 1);
            vertices.push(x + w, h, z, 0, 0.72, 0.69, 1, 1, 1, 1);
        }
        return new Float32Array(vertices);
    }

    _shrubVertices() {
        const vertices = [];
        for (const [x, z, h, w] of [[0, 0, 0.42, 0], [0.24, 0, 0.35, 0.12], [-0.22, 0.12, 0.38, -0.11], [0.04, -0.24, 0.31, 0.08], [-0.12, -0.1, 0.29, -0.08]]) {
            vertices.push(x - 0.15, 0.015, z, 0, 0.78, 0.63, 1, 1, 1, 1);
            vertices.push(x + 0.15, 0.015, z, 0, 0.78, 0.63, 1, 1, 1, 1);
            vertices.push(x + w, h, z, 0, 0.78, 0.63, 1, 1, 1, 1);
        }
        return new Float32Array(vertices);
    }

    _leafVertices() {
        const vertices = [];
        for (const [x, z, rotation, scale] of [[0, 0, 0, 1], [0.12, -0.04, 1.9, 0.72], [-0.09, 0.06, -1.4, 0.8]]) {
            const c = Math.cos(rotation), s = Math.sin(rotation);
            const point = (px, pz) => [x + (px * c - pz * s) * scale, 0, z + (px * s + pz * c) * scale];
            vertices.push(...point(-0.28, 0), ...[0, 1, 0], 1, 1, 1, 1);
            vertices.push(...point(0.28, 0), ...[0, 1, 0], 1, 1, 1, 1);
            vertices.push(...point(0, 0.65), ...[0, 1, 0], 1, 1, 1, 1);
        }
        return new Float32Array(vertices);
    }

    _pebbleVertices() {
        const vertices = [];
        const points = Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
        for (let i = 0; i < 6; i++) {
            const a = points[i], b = points[(i + 1) % 6];
            vertices.push(0, 0.025, 0, 0, 1, 0, 1, 1, 1, 1);
            vertices.push(a[0], 0.015, a[1] * 0.72, 0, 1, 0, 1, 1, 1, 1);
            vertices.push(b[0], 0.015, b[1] * 0.72, 0, 1, 0, 1, 1, 1, 1);
        }
        return new Float32Array(vertices);
    }

    draw(cameraOrShader, bindings = {}) {
        if (this.disposed) return;
        const camera = cameraOrShader?.viewMatrix ? cameraOrShader : bindings.camera;
        if (!camera?.viewMatrix || !camera?.projectionMatrix) return;
        const gl = this.gl;
        const program = this.program;
        program.use();
        program.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        program.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        program.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        program.setUniform3fv('uViewPosition', this.cameraPosition);
        if (typeof bindings === 'function') bindings(program);
        else if (typeof bindings.applyLighting === 'function') bindings.applyLighting(program);
        else if (typeof bindings.applyCommonUniforms === 'function') bindings.applyCommonUniforms(program);
        program.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);
        program.setUniform1i('uUseBaseColorTexture', 0);
        this._drawGeometry(this.grassGeometry);
        this._drawGeometry(this.shrubGeometry);
        this._drawGeometry(this.leafGeometry);
        this._drawGeometry(this.pebbleGeometry);
    }

    _drawGeometry(geometry) {
        if (geometry.instanceCount <= 0) return;
        const gl = this.gl;
        gl.bindVertexArray(geometry.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, geometry.vertexCount, geometry.instanceCount);
        gl.bindVertexArray(null);
    }

    delete() {
        if (this.disposed) return;
        this.disposed = true;
        const gl = this.gl;
        for (const geometry of [this.grassGeometry, this.shrubGeometry, this.leafGeometry, this.pebbleGeometry]) {
            gl.deleteBuffer(geometry.vertexBuffer);
            gl.deleteBuffer(geometry.instanceBuffer);
            gl.deleteVertexArray(geometry.vao);
        }
        this.program.delete();
        this.cells.clear();
        this.activeGrass = [];
        this.activePebbles = [];
        this.activeShrubs = [];
        this.activeLeaves = [];
    }
}
