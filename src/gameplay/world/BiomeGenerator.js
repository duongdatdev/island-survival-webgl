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
        
        // Randomize the sector orientation using seed
        this.angleOffset = prng.nextRange(0.0, Math.PI * 2.0);
        this.noiseScale = prng.nextRange(0.2, 0.5);
    }

    /**
     * Determine biome type at a specific coordinate
     */
    getBiome(x, z, height) {
        const dx = x - this.island.center[0];
        const dz = z - this.island.center[1];
        const distance = Math.sqrt(dx * dx + dz * dz);

        const outerBeach = this.island.outerBeachRadius || this.island.radius;

        // Everything past the underwater sand shelf is open ocean floor
        if (distance > outerBeach) {
            return BiomeType.OCEAN;
        }

        // Beach (including the underwater shelf that dips below sea level)
        if (distance > this.island.innerRadius || height <= 0.18) {
            return BiomeType.BEACH;
        }

        // Determine biome sector using angle distorted by a sine wave noise
        const angle = Math.atan2(dz, dx);
        const noise = Math.sin(x * 0.12) * Math.cos(z * 0.12) * this.noiseScale;
        
        // Normalize angle to [0, 2*PI]
        let normAngle = (angle + noise + this.angleOffset) % (Math.PI * 2.0);
        if (normAngle < 0) normAngle += Math.PI * 2.0;

        // Divide into 3 sectors: Forest, RockArea, Grassland
        if (normAngle < (Math.PI * 2.0) / 3.0) {
            return BiomeType.FOREST;
        } else if (normAngle < (Math.PI * 4.0) / 3.0) {
            return BiomeType.ROCK_AREA;
        } else {
            return BiomeType.GRASSLAND;
        }
    }

    /**
     * Get vertex color based on biome and height
     * @param biome Biome type
     * @param height Current node height
     * @param debugMode If true, return bright solid colors for debug visualizer
     */
    getBiomeColor(biome, height, debugMode) {
        if (debugMode) {
            switch (biome) {
                case BiomeType.OCEAN:
                    return [0.15, 0.35, 0.75]; // Bright Blue
                case BiomeType.BEACH:
                    return [0.90, 0.85, 0.30]; // Bright Yellow
                case BiomeType.GRASSLAND:
                    return [0.35, 0.85, 0.30]; // Bright Light Green
                case BiomeType.FOREST:
                    return [0.10, 0.50, 0.15]; // Bright Dark Green
                case BiomeType.ROCK_AREA:
                    return [0.55, 0.55, 0.55]; // Bright Gray
                default:
                    return [1.0, 1.0, 1.0];
            }
        }

        // Stylized RPG survival colors
        switch (biome) {
            case BiomeType.BEACH:
                return [0.90, 0.83, 0.65]; // Sand beach color

            case BiomeType.FOREST: {
                // Forest Biome - Deep moss green
                const factor = Math.min(height / 3.0, 1.0);
                return [
                    this.mix(0.12, 0.08, factor),
                    this.mix(0.38, 0.28, factor),
                    this.mix(0.15, 0.10, factor)
                ];
            }

            case BiomeType.ROCK_AREA: {
                // Rocky Biome - Charcoal dark grey
                const factor = Math.min((height - 0.5) / 3.0, 1.0);
                return [
                    this.mix(0.32, 0.45, factor),
                    this.mix(0.32, 0.45, factor),
                    this.mix(0.35, 0.48, factor)
                ];
            }

            case BiomeType.GRASSLAND: {
                // Lush green grass color with slight height variance
                const factor = Math.min(height / 1.8, 1.0);
                return [
                    this.mix(0.24, 0.18, factor),
                    this.mix(0.55, 0.42, factor),
                    this.mix(0.26, 0.20, factor)
                ];
            }

            case BiomeType.OCEAN:
            default:
                return [0.08, 0.20, 0.40]; // Deep water terrain color
        }
    }

    mix(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }
}
