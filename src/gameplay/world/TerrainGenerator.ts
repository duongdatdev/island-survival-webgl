import { PRNG } from './PRNG.js';
import { IslandGenerator } from './IslandGenerator.js';

interface Wave {
    freqX: number;
    freqZ: number;
    amp: number;
}

export class TerrainGenerator {
    private prng: PRNG;
    private island: IslandGenerator;
    public size: number;
    public width: number;
    private waves: Wave[] = [];

    constructor(prng: PRNG, island: IslandGenerator, size: number = 120, width: number = 100.0) {
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

    /**
     * Compute height at a given (x, z) world coordinate
     */
    public getHeight(x: number, z: number): number {
        const dx = x - this.island.center[0];
        const dz = z - this.island.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);

        const beachHeight = 0.22;
        const seaFloorDepth = -1.0;

        // Underwater sand shelf — beach continues past the land radius, sloping
        // gently down from the waterline before reaching ocean floor. Nothing is
        // cut flat at the shoreline, so the beach looks like it wades into the sea.
        const underwaterExtent = this.island.underwaterBeachExtent || 2.5;
        if (distance > this.island.radius) {
            const over = distance - this.island.radius;
            if (over >= underwaterExtent) return seaFloorDepth;
            const t = over / underwaterExtent;
            const eased = t * t;
            return beachHeight * (1.0 - t) + seaFloorDepth * eased;
        }

        const transitionWidth = this.island.radius - this.island.innerRadius;
        const shoreDist = this.island.radius - distance;

        // Base land height from the bell curve
        const baseHeight = 3.6 * Math.exp(-0.0015 * distance * distance) - 0.2;

        // Wave noise for rolling hills
        let noise = 0.0;
        for (const wave of this.waves) {
            noise += Math.sin(x * wave.freqX) * Math.cos(z * wave.freqZ) * wave.amp;
        }

        // Transition from beachHeight (shoreline) to (baseHeight + noise) (inland)
        // t = 0 at distance = radius (shoreline)
        // t = 1 at distance = innerRadius (inland boundary)
        const t = Math.max(0.0, Math.min(1.0, shoreDist / transitionWidth));
        const blend = t * t * (3.0 - 2.0 * t); // smoothstep blend factor

        // Combine base height and beach plateau to keep it smooth
        const combinedBase = (1.0 - blend) * beachHeight + blend * Math.max(0.0, baseHeight);

        // Scale the noise by the blend factor so that noise is 0 at the shoreline,
        // preventing it from punching holes/depressions in the beach.
        const finalHeight = combinedBase + blend * noise;

        // Prevent any land point on the island (distance <= radius) from dipping below
        // water level (0.0). We clamp to a dry minimum of beachHeight (0.22) to avoid water intrusion.
        return Math.max(beachHeight, finalHeight);
    }

    /**
     * Generate normal vectors from heights slopes
     */
    public getNormal(x: number, z: number, step: number): [number, number, number] {
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
