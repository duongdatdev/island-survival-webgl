import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';

/** Water this deep is fully "open ocean" for colouring purposes. */
const DEEP_WATER = 6.0;

/** How far offshore the surf band reaches, in world metres from the waterline. */
const SHORE_BAND_WIDTH = 6.0;

/** How far the terrain height interpolation extends above the waterline. */
const SHORE_BAND_HEIGHT = 0.8;

/**
 * Ocean Water Plane Grid Mesh
 */
export class Water extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number} size - grid divisions per axis
     * @param {number} width - world size of the plane
     * @param {object} [terrain] - sampled once to bake seabed depth into the
     *   mesh. Without it the whole plane is treated as deep open water, which
     *   is what the menu ocean wants.
     */
    constructor(gl, size = 60, width = 100.0, terrain = null) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;

        const data = this._generateWaterGrid(terrain);
        this.mesh = new Mesh(gl, data);

        // Water level is at Y = 0.0
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

        // 1. Generate vertices on horizontal plane
        for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;
                const py = 0.0; // Flat base height, vertex shader will displace it

                positions.push(px, py, pz);
                normals.push(0.0, 1.0, 0.0); // Upward base normals

                // Translucent ocean blue color [R, G, B, A]
                colors.push(0.06, 0.32, 0.52, 0.85);

                // The texcoord slot carries seabed data rather than a UV — the
                // water shader has no texture, and baking it here costs nothing
                // at runtime because the island never moves.
                texCoords.push(...this._sampleSeabed(terrain, px, pz));
            }
        }

        // 2. Generate indices for triangles
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

    /**
     * Per-vertex seabed description for the water shader.
     * @returns {number[]} [depth, shore] — depth 0 at the waterline rising to 1
     *   over open water, shore peaking at 1 exactly where land meets sea.
     *
     * Shore is keyed on *radial distance* to the island, not on seabed depth,
     * because the terrain generator floors the seabed at a constant −1 m. A
     * depth-based shore value would paint every open-ocean vertex as "shore".
     */
    _sampleSeabed(terrain, x, z) {
        if (!terrain) return [1.0, 0.0];

        const height = terrain.getHeight(x, z);
        const r = Math.sqrt(x * x + z * z);
        const islandRadius = terrain.generator?.island?.radius || 44.0;

        // Distance from the waterline.  Positive = offshore, negative = inland.
        const d = r - islandRadius;

        // Shore band: peaks at the waterline (d = 0), decays to zero
        // SHORE_BAND_WIDTH metres offshore.
        const SW = SHORE_BAND_WIDTH;
        const shore = d > 0 ? Math.max(0.0, 1.0 - d / SW) : 1.0;

        if (height > 0.0) {
            // Vertex is above water (beach). Interpolate so the mesh has a
            // valid gradient crossing the waterline.
            return [0.0, shore * Math.max(0.0, 1.0 - height / SHORE_BAND_HEIGHT)];
        }

        // Depth for shallow-water colour: the underwater sand shelf is ~2 m
        // deep at most, so 2 m is a better normaliser than 6 m.
        const depth = -height;
        return [
            Math.min(1.0, depth / 2.0),
            shore
        ];
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
