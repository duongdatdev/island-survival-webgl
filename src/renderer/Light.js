import { Vec3 } from '../math/Vec3.js';

export class DirectionalLight {
    constructor(direction = [0.5, 1.0, 0.3], color = [1.0, 0.95, 0.85], intensity = 1.0) {
        this.direction = Vec3.create(direction[0], direction[1], direction[2]);
        Vec3.normalize(this.direction, this.direction);
        this.color = Vec3.create(color[0], color[1], color[2]);
        this.intensity = intensity;
    }

    setDirection(x, y, z) {
        Vec3.set(this.direction, x, y, z);
        Vec3.normalize(this.direction, this.direction);
    }
}

export class AmbientLight {
    constructor(color = [0.2, 0.25, 0.35], intensity = 0.3) {
        this.color = Vec3.create(color[0], color[1], color[2]);
        this.intensity = intensity;
    }
}
