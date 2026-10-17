import { ShaderProgram } from './ShaderProgram.js';
import { Mat4 } from '../math/Mat4.js';
import { createBasicShader } from '../shaders/BasicShader.js';

const MAX_MANGROVE_PUDDLES = 36;
const INSTANCE_FLOATS = 20;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const IDENTITY = Mat4.create();

const vertexDeclarations = `
    layout(location = 4) in vec4 aInstanceMatrix0;
    layout(location = 5) in vec4 aInstanceMatrix1;
    layout(location = 6) in vec4 aInstanceMatrix2;
    layout(location = 7) in vec4 aInstanceMatrix3;
    layout(location = 8) in vec4 aInstanceColor;
`;

const vertexTransform = `
    mat4 instanceMatrix = mat4(aInstanceMatrix0, aInstanceMatrix1, aInstanceMatrix2, aInstanceMatrix3);
    localPosition = (instanceMatrix * vec4(localPosition, 1.0)).xyz;
    localNormal = transpose(inverse(mat3(instanceMatrix))) * localNormal;
    localColor *= aInstanceColor;
`;

function hash01(a, b, seed) {
    let value = Math.imul(a | 0, 0x1f123bb5) ^ Math.imul(b | 0, 0x5f356495) ^ seed;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function flatGeometry(triangles) {
    const positions = [], normals = [], colors = [], indices = [];
    for (const tri of triangles) {
        const [a, b, c] = tri;
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot(...normal) || 1;
        for (const point of tri) {
            positions.push(...point);
            normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
            colors.push(1, 1, 1, 1);
            indices.push(indices.length);
        }
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        indices: new Uint16Array(indices),
    };
}

function rockGeometry() {
    const top = [0, 0.9, 0], bottom = [0.05, -0.55, 0.02];
    const ring = [[-0.65, 0, -0.42], [-0.48, 0.12, 0.55], [0.28, 0.04, 0.62],
        [0.66, -0.08, 0.08], [0.35, 0.12, -0.58], [-0.42, -0.10, -0.61]];
    const triangles = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        triangles.push([top, a, b], [bottom, b, a]);
    }
    return flatGeometry(triangles);
}

function fernGeometry() {
    const triangles = [];
    for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 0.4;
        const dx = Math.cos(angle), dz = Math.sin(angle);
        const tip = [dx * 0.74, 0.52 + (i % 2) * 0.09, dz * 0.74];
        const left = [-dz * 0.14, 0.09, dx * 0.14];
        const right = [dz * 0.14, 0.09, -dx * 0.14];
        triangles.push([left, right, tip]);
        triangles.push([[0, 0.02, 0], left, right]);
    }
    return flatGeometry(triangles);
}

function logGeometry() {
    const triangles = [];
    const sides = 7;
    for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides, b = (i + 1) * Math.PI * 2 / sides;
        const p0 = [-0.5, Math.cos(a) * 0.13, Math.sin(a) * 0.13];
        const p1 = [-0.5, Math.cos(b) * 0.13, Math.sin(b) * 0.13];
        const p2 = [0.5, Math.cos(a) * 0.13, Math.sin(a) * 0.13];
        const p3 = [0.5, Math.cos(b) * 0.13, Math.sin(b) * 0.13];
        triangles.push([p0, p2, p1], [p1, p2, p3]);
    }
    return flatGeometry(triangles);
}

function puddleGeometry() {
    const triangles = [];
    const sides = 9;
    const center = [0, 0, 0];
    for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides, b = (i + 1) * Math.PI * 2 / sides;
        triangles.push([center, [Math.cos(a), 0, Math.sin(a)], [Math.cos(b), 0, Math.sin(b)]]);
    }
    return flatGeometry(triangles);
}

/** Small deterministic dressing around landmarks and sheltered mangrove flats. */
export class LandmarkDetails {
    constructor(gl, world) {
        this.gl = gl;
        this.world = world;
        this.generator = world.terrainGenerator || world.biomeGenerator || world;
        this.seed = String(world.seed ?? 'landmark-details');
        this.seedHash = Array.from(this.seed).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
        this.groups = new Map();
        this.disposed = false;
        this.lastDrawnInstances = 0;
        this._populateLandmarks();
        this._populateMangroves();
        const shader = createBasicShader({ vertexDeclarations, vertexTransform });
        this.program = new ShaderProgram(gl, shader.vertex, shader.fragment);
        this._createGpuGroups();
    }

    _add(kind, x, z, scale, rotation, color) {
        const y = this.generator.getHeight?.(x, z);
        if (!Number.isFinite(y) || y < 0.45) return false;
        if (this.generator.getBiome?.(x, z, y) === 'Ocean' || this.generator._reserved?.(x, z)) return false;
        const normal = this.generator.getNormal?.(x, z) || [0, 1, 0];
        if (normal[1] < 0.78) return false;
        let group = this.groups.get(kind);
        if (!group) this.groups.set(kind, group = { kind, geometry: this._geometryFor(kind), instances: [], visible: [] });
        const matrix = Mat4.create();
        Mat4.translate(matrix, matrix, [x, y + (kind === 'puddle' ? 0.035 : 0.015), z]);
        Mat4.rotateY(matrix, matrix, rotation);
        Mat4.scale(matrix, matrix, scale);
        group.instances.push({ matrix, color, position: [x, y, z], radius: Math.max(...scale) * 1.2 });
        return true;
    }

    _geometryFor(kind) {
        if (kind === 'rock') return rockGeometry();
        if (kind === 'fern') return fernGeometry();
        if (kind === 'log') return logGeometry();
        return puddleGeometry();
    }

    _populateLandmarks() {
        const pois = this.world.pois || [];
        const waterfall = this.world.landmarks?.waterfall || pois.find(poi => poi.role === 'waterfall')?.position;
        const camp = pois.find(poi => poi.id === 'abandoned_camp' || poi.role === 'camp')?.position;
        const scatter = (anchor, label, options) => {
            if (!anchor) return;
            const [minRadius, maxRadius, count, kinds] = options;
            let placed = 0;
            for (let attempt = 0; attempt < count * 5 && placed < count; attempt++) {
                const u = hash01(attempt, label.length, this.seedHash ^ label.charCodeAt(0));
                const v = hash01(label.charCodeAt(label.length - 1), attempt * 13, this.seedHash ^ 0x4f1bbcdc);
                const angle = u * Math.PI * 2;
                const radius = minRadius + v * (maxRadius - minRadius);
                const x = anchor[0] + Math.cos(angle) * radius;
                const z = anchor[2] + Math.sin(angle) * radius;
                const kind = kinds[attempt % kinds.length];
                const size = 0.65 + hash01(attempt * 7, label.length, this.seedHash ^ 0x2c1b3c6d) * 0.8;
                const colors = kind === 'rock' ? [0.42, 0.41, 0.35, 1] : kind === 'fern' ? [0.18, 0.33, 0.14, 1] : [0.36, 0.25, 0.14, 1];
                if (this._add(kind, x, z, [size, size * (0.65 + u * 0.45), size], angle, colors)) placed++;
            }
        };
        scatter(waterfall, 'waterfall', [12, 31, 22, ['rock', 'rock', 'fern']]);
        scatter(camp, 'camp', [19, 38, 18, ['rock', 'fern', 'log', 'fern']]);
    }

    _populateMangroves() {
        const radius = this.generator.island?.radius || 280;
        let placed = 0;
        const step = 13;
        for (let z = -radius; z <= radius && placed < MAX_MANGROVE_PUDDLES; z += step) {
            for (let x = -radius; x <= radius && placed < MAX_MANGROVE_PUDDLES; x += step) {
                const jitterX = (hash01(x, z, this.seedHash ^ 0x72e2d7f1) - 0.5) * step * 0.8;
                const jitterZ = (hash01(z, x, this.seedHash ^ 0x165667b1) - 0.5) * step * 0.8;
                const px = x + jitterX, pz = z + jitterZ;
                const y = this.generator.getHeight?.(px, pz);
                if (this.generator.getBiome?.(px, pz, y) !== 'Mangrove') continue;
                if (hash01(x, z, this.seedHash ^ 0xa511e9b3) > 0.24) continue;
                const scale = 0.9 + hash01(z, x, this.seedHash ^ 0x632be5ab) * 1.2;
                if (this._add('puddle', px, pz, [scale * 1.5, 1, scale], hash01(x, z, this.seedHash ^ 0x9e3779b9) * Math.PI,
                    [0.19, 0.24, 0.19, 1])) placed++;
            }
        }
    }

    _createGpuGroups() {
        const gl = this.gl;
        for (const group of this.groups.values()) {
            const geometry = group.geometry;
            group.vao = gl.createVertexArray();
            group.vertexBuffer = gl.createBuffer();
            group.indexBuffer = gl.createBuffer();
            group.instanceBuffer = gl.createBuffer();
            gl.bindVertexArray(group.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, group.vertexBuffer);
            const vertexData = new Float32Array(geometry.positions.length / 3 * 10);
            const vertexCount = geometry.positions.length / 3;
            for (let i = 0; i < vertexCount; i++) {
                const p = i * 3, target = i * 10, c = i * 4;
                vertexData.set(geometry.positions.subarray(p, p + 3), target);
                vertexData.set(geometry.normals.subarray(p, p + 3), target + 3);
                vertexData.set(geometry.colors.subarray(c, c + 4), target + 6);
            }
            gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
            const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
            for (const [location, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 4, 6]]) {
                gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
                gl.enableVertexAttribArray(location);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, group.indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, group.instanceBuffer);
            for (let column = 0; column < 4; column++) {
                const location = 4 + column;
                gl.vertexAttribPointer(location, 4, gl.FLOAT, false, INSTANCE_STRIDE, column * 4 * Float32Array.BYTES_PER_ELEMENT);
                gl.enableVertexAttribArray(location);
                gl.vertexAttribDivisor(location, 1);
            }
            gl.vertexAttribPointer(8, 4, gl.FLOAT, false, INSTANCE_STRIDE, 16 * Float32Array.BYTES_PER_ELEMENT);
            gl.enableVertexAttribArray(8);
            gl.vertexAttribDivisor(8, 1);
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
    }

    draw(camera, bindings = {}) {
        if (this.disposed || !camera?.viewMatrix || !camera?.projectionMatrix) return 0;
        const gl = this.gl;
        const cameraPosition = camera.position || [0, 0, 0];
        const viewDistance = Number(bindings.viewDistance ?? 170);
        const frustum = bindings.frustum;
        this.program.use();
        this.program.setUniformMatrix4fv('uModelMatrix', IDENTITY);
        this.program.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        this.program.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        this.program.setUniform3fv('uViewPosition', cameraPosition);
        if (typeof bindings.applyLighting === 'function') bindings.applyLighting(this.program);
        this.program.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);
        this.program.setUniform1i('uUseBaseColorTexture', 0);

        this.lastDrawnInstances = 0;
        for (const group of this.groups.values()) {
            const visible = [];
            for (const instance of group.instances) {
                const [x, y, z] = instance.position;
                const dx = x - cameraPosition[0], dy = y - cameraPosition[1], dz = z - cameraPosition[2];
                if (Math.hypot(dx, dy, dz) > viewDistance + instance.radius) continue;
                if (frustum && !frustum.containsSphere(x, y, z, instance.radius)) continue;
                visible.push(instance);
            }
            if (!visible.length) continue;
            const data = new Float32Array(visible.length * INSTANCE_FLOATS);
            for (let i = 0; i < visible.length; i++) {
                data.set(visible[i].matrix, i * INSTANCE_FLOATS);
                data.set(visible[i].color, i * INSTANCE_FLOATS + 16);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, group.instanceBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindVertexArray(group.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, group.geometry.indices.length, gl.UNSIGNED_SHORT, 0, visible.length);
            gl.bindVertexArray(null);
            this.lastDrawnInstances += visible.length;
        }
        return this.lastDrawnInstances;
    }

    delete() {
        if (this.disposed) return;
        this.disposed = true;
        const gl = this.gl;
        for (const group of this.groups.values()) {
            gl.deleteBuffer(group.vertexBuffer);
            gl.deleteBuffer(group.indexBuffer);
            gl.deleteBuffer(group.instanceBuffer);
            gl.deleteVertexArray(group.vao);
        }
        this.groups.clear();
        this.program?.delete();
        this.program = null;
        this.lastDrawnInstances = 0;
    }
}
