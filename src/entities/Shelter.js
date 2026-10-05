import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Mat4 } from '../math/Mat4.js';
import { createCubeData } from '../renderer/CubeGeometry.js';

export class Shelter extends Entity {
    constructor(gl) {
        super();
        this.isBuilt = false;
        this.woodMesh = gl ? new Mesh(gl, createCubeData(0.43, 0.28, 0.14)) : null;
        this.roofMesh = gl ? new Mesh(gl, createCubeData(0.35, 0.43, 0.19)) : null;
        this._matrix = Mat4.create();
    }

    covers(position) {
        return this.isBuilt && Math.abs(position[0] - this.position[0]) <= 1.65
            && Math.abs(position[2] - this.position[2]) <= 1.65
            && position[1] >= this.position[1] - 0.3
            && position[1] < this.position[1] + 2.6;
    }

    draw(shader, drawMode) {
        if (!this.isBuilt) return;
        const part = (mesh, offset, scale, tilt = 0) => {
            Mat4.identity(this._matrix);
            Mat4.translate(this._matrix, this._matrix, this.position.map((v, i) => v + offset[i]));
            Mat4.rotateZ(this._matrix, this._matrix, tilt);
            Mat4.scale(this._matrix, this._matrix, scale);
            shader.setUniformMatrix4fv('uModelMatrix', this._matrix);
            mesh.draw(drawMode);
        };
        for (const x of [-1.7, 1.7]) {
            for (const z of [-1.7, 1.7]) part(this.woodMesh, [x, 1.35, z], [0.14, 2.7, 0.14]);
            part(this.woodMesh, [x, 2.65, 0], [0.18, 0.16, 3.6]);
        }
        part(this.roofMesh, [-0.9, 2.92, 0], [2.0, 0.16, 3.9], 0.22);
        part(this.roofMesh, [0.9, 2.92, 0], [2.0, 0.16, 3.9], -0.22);
        part(this.roofMesh, [0, 0.07, 0.7], [1.1, 0.12, 1.8]);
    }

    delete() {
        this.woodMesh?.delete();
        this.roofMesh?.delete();
    }
}
