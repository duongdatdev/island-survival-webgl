import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';

/**
 * Ocean Water Plane Grid Mesh
 */
export class Water extends Entity {
    constructor(gl, size = 60, width = 100.0) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;

        const data = this._generateWaterGrid();
        this.mesh = new Mesh(gl, data);

        // Water level is at Y = 0.0
        this.position[1] = 0.0;
        this.updateModelMatrix();
    }

    _generateWaterGrid() {
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
                texCoords.push(x / size, z / size);
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
