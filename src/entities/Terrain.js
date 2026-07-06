import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';

/**
 * Procedural Island Terrain Grid
 */
export class Terrain extends Entity {
    constructor(gl, size = 60, width = 60.0) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;

        // Generate geometry
        const data = this._generateTerrainData();
        this.mesh = new Mesh(gl, data);
        
        this.updateModelMatrix();
    }

    _getHeight(x, z) {
        const d = Math.sqrt(x * x + z * z);
        let height = 0.0;
        
        // Circular island boundary check
        if (d < this.width * 0.46) {
            // Gaussian bell curve shape peaking at 3.5 units
            height = 3.5 * Math.exp(-0.0015 * d * d) - 0.3;
            height = Math.max(0.0, height);
            
            // Apply Biome & POI height adjustments
            if (height > 0.0) {
                // 1. Forest Biome (Smooth rolling terrain)
                if (x > 10 && z > 10) {
                    const hill = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.3;
                    height += hill;
                }
                // 2. Dense Rocky Biome (High cliff plateau)
                else if (x < -10 && z < -10) {
                    const cliff = Math.sin(x * 0.4) * Math.cos(z * 0.4) * 0.6;
                    height += 0.8 + cliff;
                }
                // 3. Waterfall POI (Steep waterfall cliff)
                else if (x > 18 && z < -18) {
                    const plateau = 2.8 * Math.exp(-0.005 * ((x - 25) * (x - 25) + (z + 25) * (z + 25)));
                    height += plateau;
                }
                // 4. Caverns POI (Cavern mountain hill)
                else if (x < -18 && z > 18) {
                    const mountain = 2.5 * Math.exp(-0.006 * ((x + 25) * (x + 25) + (z - 25) * (z - 25)));
                    height += mountain;
                }

                // Apply high-frequency noise
                const noise1 = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.2;
                const noise2 = Math.sin(x * 1.5) * Math.cos(z * 1.5) * 0.05;
                height += noise1 + noise2;
            }
        }
        
        return Math.max(0.0, height);
    }

    getHeight(x, z) {
        return this._getHeight(x, z);
    }

    _generateTerrainData() {
        const size = this.size;
        const width = this.width;
        const step = width / size;
        const halfWidth = width / 2.0;

        const positions = [];
        const normals = [];
        const colors = [];
        const texCoords = [];
        const indices = [];

        // 1. Generate vertices
        for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;
                const py = this._getHeight(px, pz);

                positions.push(px, py, pz);
                texCoords.push(x / size, z / size);

                // Compute color based on height and coordinate position (biomes)
                let r, g, b;
                if (py <= 0.08) {
                    // Sand beach color
                    r = 0.90; g = 0.83; b = 0.65;
                } else if (px > 10 && pz > 10) {
                    // Forest Biome - Deep moss green
                    const factor = Math.min(py / 3.0, 1.0);
                    r = mix(0.12, 0.08, factor);
                    g = mix(0.38, 0.28, factor);
                    b = mix(0.15, 0.10, factor);
                } else if (px < -10 && pz < -10) {
                    // Rocky Biome - Charcoal dark grey
                    const factor = Math.min((py - 0.5) / 3.0, 1.0);
                    r = mix(0.32, 0.45, factor);
                    g = mix(0.32, 0.45, factor);
                    b = mix(0.35, 0.48, factor);
                } else if (px > 18 && pz < -18) {
                    // Waterfall POI color - Slate grey cliff
                    r = 0.42; g = 0.42; b = 0.45;
                } else if (px < -18 && pz > 18) {
                    // Caverns POI color - Earthy dark brown/grey
                    r = 0.38; g = 0.34; b = 0.30;
                } else if (py <= 1.8) {
                    // Lush green grass color with slight height variance
                    const factor = py / 1.8;
                    r = mix(0.24, 0.18, factor);
                    g = mix(0.55, 0.42, factor);
                    b = mix(0.26, 0.20, factor);
                } else {
                    // Gray stone color for mountain peak
                    const factor = Math.min((py - 1.8) / 2.0, 1.0);
                    r = mix(0.40, 0.70, factor);
                    g = mix(0.40, 0.70, factor);
                    b = mix(0.40, 0.70, factor);
                }
                colors.push(r, g, b, 1.0);
            }
        }

        // 2. Compute smooth normals from adjacent vertex gradients
        for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
                const px = x * step - halfWidth;
                const pz = z * step - halfWidth;

                // Query surrounding height slopes
                const hL = this._getHeight(px - step, pz);
                const hR = this._getHeight(px + step, pz);
                const hD = this._getHeight(px, pz - step);
                const hU = this._getHeight(px, pz + step);

                // Normal vector calculation (slope gradients)
                const normal = Vec3.create(hL - hR, 2.0 * step, hD - hU);
                Vec3.normalize(normal, normal);
                
                normals.push(normal[0], normal[1], normal[2]);
            }
        }

        // 3. Generate index grid
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const row1 = z * (size + 1);
                const row2 = (z + 1) * (size + 1);

                // First triangle
                indices.push(row1 + x);
                indices.push(row2 + x);
                indices.push(row1 + x + 1);

                // Second triangle
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

// Utility linear interpolation helper
function mix(start, end, amt) {
    return (1 - amt) * start + amt * end;
}
