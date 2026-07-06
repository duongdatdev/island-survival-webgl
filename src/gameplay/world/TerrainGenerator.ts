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

        // Ocean boundary check
        if (distance > this.island.radius) {
            return 0.0;
        }

        // Circular Gaussian bell curve peaking at center (height = 3.6)
        const baseHeight = 3.6 * Math.exp(-0.0015 * distance * distance) - 0.2;
        let height = Math.max(0.0, baseHeight);

        // Apply noise inside the land mass
        if (height > 0.05) {
            let noise = 0.0;
            for (const wave of this.waves) {
                noise += Math.sin(x * wave.freqX) * Math.cos(z * wave.freqZ) * wave.amp;
            }
            height += noise;

            // Roll off heights smooth near the shore
            const shoreDist = this.island.radius - distance;
            const transitionWidth = this.island.radius - this.island.innerRadius;
            if (shoreDist < transitionWidth) {
                const factor = shoreDist / transitionWidth;
                height = height * factor;
            }
        }

        return Math.max(0.0, height);
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
