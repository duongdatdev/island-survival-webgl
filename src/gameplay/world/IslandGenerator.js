export class IslandGenerator {
    constructor(prng) {
        this.radius = prng.nextRange(44.0, 47.0);
        this.innerRadius = this.radius - prng.nextRange(8.0, 10.0);
        this.underwaterBeachExtent = 2.5;
        this.outerBeachRadius = this.radius + this.underwaterBeachExtent;
        this.center = [0.0, 0.0];
    }

    isLand(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance <= this.radius;
    }

    isBeach(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.innerRadius && distance <= this.radius;
    }

    isOcean(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.radius;
    }
}
