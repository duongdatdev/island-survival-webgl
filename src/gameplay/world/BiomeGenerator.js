export const BiomeType = {
    OCEAN: 'Ocean',
    BEACH: 'Beach',
    GRASSLAND: 'Grassland',
    FOREST: 'Forest',
    ROCK_AREA: 'RockArea'
};

export class BiomeGenerator {
    constructor(prng, island) {
        this.prng = prng;
        this.island = island;
        
        this.angleOffset = prng.nextRange(0.0, Math.PI * 2.0);
        this.noiseScale = prng.nextRange(0.2, 0.5);
    }

    getBiome(x, z, height) {
        const dx = x - this.island.center[0];
        const dz = z - this.island.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);

        const outerBeach = this.island.outerBeachRadius || this.island.radius;

        if (distance > outerBeach) {
            return BiomeType.OCEAN;
        }

        if (distance > this.island.innerRadius || height <= 0.18) {
            return BiomeType.BEACH;
        }

        const angle = Math.atan2(dz, dx);
        const noise = Math.sin(x * 0.12) * Math.cos(z * 0.12) * this.noiseScale;
        
        let normAngle = (angle + noise + this.angleOffset) % (Math.PI * 2.0);
        if (normAngle < 0) normAngle += Math.PI * 2.0;

        if (normAngle < (Math.PI * 2.0) / 3.0) {
            return BiomeType.FOREST;
        } else if (normAngle < (Math.PI * 4.0) / 3.0) {
            return BiomeType.ROCK_AREA;
        } else {
            return BiomeType.GRASSLAND;
        }
    }

    getBiomeColor(biome, height, debugMode) {
        if (debugMode) {
            switch (biome) {
                case BiomeType.OCEAN:
                    return [0.15, 0.35, 0.75];
                case BiomeType.BEACH:
                    return [0.90, 0.85, 0.30];
                case BiomeType.GRASSLAND:
                    return [0.35, 0.85, 0.30];
                case BiomeType.FOREST:
                    return [0.10, 0.50, 0.15];
                case BiomeType.ROCK_AREA:
                    return [0.55, 0.55, 0.55];
                default:
                    return [1.0, 1.0, 1.0];
            }
        }

        switch (biome) {
            case BiomeType.BEACH:
                return [0.90, 0.83, 0.65];

            case BiomeType.FOREST: {
                const factor = Math.min(height / 3.0, 1.0);
                return [
                    this.mix(0.12, 0.08, factor),
                    this.mix(0.38, 0.28, factor),
                    this.mix(0.15, 0.10, factor)
                ];
            }

            case BiomeType.ROCK_AREA: {
                const factor = Math.min((height - 0.5) / 3.0, 1.0);
                return [
                    this.mix(0.32, 0.45, factor),
                    this.mix(0.32, 0.45, factor),
                    this.mix(0.35, 0.48, factor)
                ];
            }

            case BiomeType.GRASSLAND: {
                const factor = Math.min(height / 1.8, 1.0);
                return [
                    this.mix(0.24, 0.18, factor),
                    this.mix(0.55, 0.42, factor),
                    this.mix(0.26, 0.20, factor)
                ];
            }

            case BiomeType.OCEAN:
            default:
                return [0.08, 0.20, 0.40];
        }
    }

    mix(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }
}
