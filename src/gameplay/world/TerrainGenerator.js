export class TerrainGenerator {
    constructor(prng, island, size = 120, width = 100.0) {
        this.prng = prng;
        this.island = island;
        this.size = size;
        this.width = width;

        // Generate deterministic noise waves for rolling hills
        const waveCount = prng.nextInt(3, 6);
        for (let i = 0; i < waveCount; i++) {
            this.waves.push({
                freqX: prng.nextRange(0.08, 0.22),
                freqZ: prng.nextRange(0.08, 0.22),
                amp: prng.nextRange(0.12, 0.38)
            });
        }
    }

    // Initialize waves property inside constructor
    waves = [];

    /**
     * Compute height at a given (x, z) world coordinate
     */
    getHeight(x, z) {
        const dx = x - this.island.center[0];
        const dz = z - this.island.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);

        const beachHeight = 0.22;
        const seaFloorDepth = -1.0;

        // Underwater sand shelf — beach continues past the land radius, sloping
        // gently down from the waterline before reaching ocean floor. Nothing is
        // cut flat at the shoreline, so the beach looks like it wades into the sea.
        const underwaterExtent = this.island.underwaterBeachExtent || 2.5;
        const outerBeachRadius = this.island.radius + underwaterExtent;
        if (distance > this.island.radius) {
            const over = distance - this.island.radius;
            if (over >= underwaterExtent) return seaFloorDepth;
            const t = over / underwaterExtent;
            // easeInQuad — starts nearly flat at the waterline then dives faster
            const eased = t * t;
            return beachHeight * (1.0 - t) + seaFloorDepth * eased;
        }

        const transitionWidth = this.island.radius - this.island.innerRadius;
        const shoreDist = this.island.radius - distance;

        // Beach plateau — flat sand ~0.22 above water so noise can't punch water
        // holes through the sand. Blends into the inland bell curve.
        if (shoreDist < transitionWidth) {
            const t = Math.max(0.0, Math.min(1.0, shoreDist / transitionWidth));
            const shoreLift = t * t * (3.0 - 2.0 * t); // 0 at waterline, 1 at beach/land seam

            // Sand keeps its full plateau height right up to the waterline, then
            // the underwater shelf above continues the descent past r=radius.
            let sand = beachHeight;

            // Inland side of the beach blends into the land bell curve
            const baseHeight = 3.6 * Math.exp(-0.0015 * distance * distance) - 0.2;
            const inlandBlend = shoreLift * shoreLift;
            sand = Math.max(sand, baseHeight * inlandBlend);

            return sand;
        }

        // Inland: bell curve + wave noise
        const baseHeight = 3.6 * Math.exp(-0.0015 * distance * distance) - 0.2;
        let height = Math.max(0.0, baseHeight);

        if (height > 0.001) {
            let noise = 0.0;
            for (const wave of this.waves) {
                noise += Math.sin(x * wave.freqX) * Math.cos(z * wave.freqZ) * wave.amp;
            }
            height += noise;
        }

        return height;
    }

    /**
     * Generate normal vectors from heights slopes
     */
    getNormal(x, z, step) {
        const hL = this.getHeight(x - step, z);
        const hR = this.getHeight(x + step, z);
        const hD = this.getHeight(x, z - step);
        const hU = this.getHeight(x, z + step);

        // Calculate gradient normal vector
        const nx = hL - hR;
        const ny = 2.0 * step;
        const nz = hD - hU;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return [nx / len, ny / len, nz / len];
    }
}
