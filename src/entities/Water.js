import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';

const SHORE_BAND_HEIGHT = 0.8;
const SHORE_BAND_WIDTH = 1.2;

/** [normalized depth, shore proximity] derived from actual sampled terrain. */
export function sampleWaterShore(terrain, x, z) {
    if (typeof terrain?.getHeight !== 'function') return [1, 0];
    const height = terrain.getHeight(x, z);
    const depth = Math.max(0, -height);
    const shore = height >= 0
        ? 1 - smoothstep(0, SHORE_BAND_HEIGHT, height)
        : 1 - smoothstep(0, SHORE_BAND_WIDTH, depth);
    return [Math.min(1, depth / 2), Math.max(0, Math.min(1, shore))];
}

function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** Dense local waves with gradually larger cells toward the distant horizon. */
export function oceanGridAxis(innerSegments, width, innerWidth, outerSegments) {
    if (!Number.isInteger(innerSegments) || innerSegments < 2 || !Number.isInteger(outerSegments) || outerSegments < 1
        || !Number.isFinite(width) || !Number.isFinite(innerWidth) || !(width > innerWidth && innerWidth > 0)) throw new Error('Invalid ocean grid dimensions');
    const step = innerWidth / innerSegments, reach = (width - innerWidth) / 2;
    let low = 0, high = Math.max(2, reach / step);
    const sum = ratio => { let value = 0, cell = step; for (let i = 0; i < outerSegments; i++) { cell *= ratio; value += cell; } return value; };
    for (let i = 0; i < 64; i++) { const ratio = (low + high) / 2; if (sum(ratio) < reach) low = ratio; else high = ratio; }
    const ratio = (low + high) / 2, outer = []; let cell = step, edge = innerWidth / 2;
    for (let i = 0; i < outerSegments; i++) { cell *= ratio; edge += cell; outer.push(edge); }
    outer[outer.length - 1] = width / 2;
    return [...[...outer].reverse().map(value => -value),
        ...Array.from({ length: innerSegments + 1 }, (_, i) => i * step - innerWidth / 2), ...outer];
}

export class Water extends Entity {
    constructor(gl, size = 60, width = 100.0, terrain = null, localGrid = null) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;
        if (localGrid) {
            this.gridAxis = oceanGridAxis(size, width, localGrid.innerWidth, localGrid.outerSegments);
            this.size = this.gridAxis.length - 1;
        }

        const data = this._generateWaterGrid(terrain);
        this.mesh = new Mesh(gl, data);

        this.position[1] = 0.0;
        this.updateModelMatrix();
    }

    _generateWaterGrid(terrain) {
        const size = this.size;
        const width = this.width;
        const step = width / size;
        const halfWidth = width / 2.0;

        const positions = [];
        const normals = [];
        const colors = [];
        const texCoords = [];
        const indices = [];

        for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
                const px = this.gridAxis?.[x] ?? x * step - halfWidth;
                const pz = this.gridAxis?.[z] ?? z * step - halfWidth;
                const py = 0.0;

                positions.push(px, py, pz);
                normals.push(0.0, 1.0, 0.0);

                colors.push(0.06, 0.32, 0.52, 0.85);

                texCoords.push(...this._sampleSeabed(terrain, px, pz));
            }
        }

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const row1 = z * (size + 1);
                const row2 = (z + 1) * (size + 1);

                indices.push(row1 + x);
                indices.push(row2 + x);
                indices.push(row1 + x + 1);

                indices.push(row1 + x + 1);
                indices.push(row2 + x);
                indices.push(row2 + x + 1);
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            texCoords: new Float32Array(texCoords),
            indices: new Uint32Array(indices)
        };
    }

    _sampleSeabed(terrain, x, z) {
        return sampleWaterShore(terrain, x, z);
    }

    draw(shaderProgram) {
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw();
    }

    delete() {
        if (this.mesh) {
            this.mesh.delete();
            this.mesh = null;
        }
    }
}
