export class IslandGenerator {
    constructor(prng) {
        // Initialize island configuration deterministically
        this.radius = prng.nextRange(44.0, 47.0); // Approx 46 units radius
        this.innerRadius = this.radius - prng.nextRange(8.0, 10.0); // Beach width of 12-15 units
        // Underwater sand shelf — the shore slopes down beneath the water for this
        // extra distance before becoming ocean floor.
        this.underwaterBeachExtent = 2.5;
        this.outerBeachRadius = this.radius + this.underwaterBeachExtent;
        this.center = [0.0, 0.0];
    }

    /**
     * Check if a position is on the island (land including beach)
     */
    isLand(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance <= this.radius;
    }

    /**
     * Check if a position is on the beach (outer sand ring)
     */
    isBeach(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.innerRadius && distance <= this.radius;
    }

    /**
     * Check if a position is in the ocean
     */
    isOcean(x, z) {
        const dx = x - this.center[0];
        const dz = z - this.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.radius;
    }
}
