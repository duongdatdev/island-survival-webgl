import { PRNG } from './PRNG.js';

export class IslandGenerator {
    public radius: number;
    public innerRadius: number;
    public center: [number, number];

    public underwaterBeachExtent: number;
    public outerBeachRadius: number;

    constructor(prng: PRNG) {
        // Initialize island configuration deterministically
        this.radius = prng.nextRange(44.0, 47.0); // Approx 46 units radius
        this.innerRadius = this.radius - prng.nextRange(12.0, 15.0); // Beach width of 12-15 units
        // Underwater sand shelf — the shore slopes down beneath the water for this
        // extra distance before becoming ocean floor.
        this.underwaterBeachExtent = 2.5;
        this.outerBeachRadius = this.radius + this.underwaterBeachExtent;
        this.center = [0.0, 0.0];
    }

    /**
     * Check if a position is on the island (land including beach)
     */
    public isLand(x: number, z: number): boolean {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance <= this.radius;
    }

    /**
     * Check if a position is on the beach (outer sand ring)
     */
    public isBeach(x: number, z: number): boolean {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.innerRadius && distance <= this.radius;
    }

    /**
     * Check if a position is in the ocean
     */
    public isOcean(x: number, z: number): boolean {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.radius;
    }
}
