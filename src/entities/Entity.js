import { Vec3 } from '../math/Vec3.js';
import { Mat4 } from '../math/Mat4.js';

/**
 * Base Entity class representing a 3D object in the world
 */
export class Entity {
    constructor() {
        this.position = Vec3.create(0, 0, 0);
        this.rotation = Vec3.create(0, 0, 0); // Euler angles: [pitch, yaw, roll]
        this.scale = Vec3.create(1, 1, 1);
        this.modelMatrix = Mat4.create();
    }

    /**
     * Compute model matrix from current translation, rotation, and scaling
     */
    updateModelMatrix() {
        Mat4.identity(this.modelMatrix);
        
        // Translate
        Mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        
        // Rotate (Yaw -> Pitch -> Roll order)
        if (this.rotation[1] !== 0) Mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation[1]);
        if (this.rotation[0] !== 0) Mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation[0]);
        if (this.rotation[2] !== 0) Mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation[2]);
        
        // Scale
        if (this.scale[0] !== 1 || this.scale[1] !== 1 || this.scale[2] !== 1) {
            Mat4.scale(this.modelMatrix, this.modelMatrix, this.scale);
        }
    }
}
