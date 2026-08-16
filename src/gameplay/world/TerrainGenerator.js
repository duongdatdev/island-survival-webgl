export class TerrainGenerator {
    constructor(prng, island, size = 120, width = 100.0) {
        this.prng = prng;
        this.island = island;
        this.size = size;
        this.width = width;

        const waveCount = prng.nextInt(3, 6);
        for (let i = 0; i < waveCount; i++) {
            this.waves.push({
                freqX: prng.nextRange(0.08, 0.22),
                freqZ: prng.nextRange(0.08, 0.22),
                amp: prng.nextRange(0.12, 0.38)
            });
        }
    }

    waves = [];

    getHeight(x, z) {
        const dx = x - this.island.center[0];
        const dz = z - this.island.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);

        const beachHeight = 0.22;
        const seaFloorDepth = -1.0;

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

        const baseHeight = 3.6 * Math.exp(-0.0015 * distance * distance) - 0.2;

        let noise = 0.0;
        for (const wave of this.waves) {
            noise += Math.sin(x * wave.freqX) * Math.cos(z * wave.freqZ) * wave.amp;
        }

        const t = Math.max(0.0, Math.min(1.0, shoreDist / transitionWidth));
        const blend = t * t * (3.0 - 2.0 * t);

        const combinedBase = (1.0 - blend) * beachHeight + blend * Math.max(0.0, baseHeight);

        const finalHeight = combinedBase + blend * noise;

        return Math.max(beachHeight, finalHeight);
    }

    getNormal(x, z, step) {
        const hL = this.getHeight(x - step, z);
        const hR = this.getHeight(x + step, z);
        const hD = this.getHeight(x, z - step);
        const hU = this.getHeight(x, z + step);

        const nx = hL - hR;
        const ny = 2.0 * step;
        const nz = hD - hU;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return [nx / len, ny / len, nz / len];
    }
}
