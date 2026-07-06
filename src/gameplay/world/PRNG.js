/**
 * Deterministic seedable pseudo-random number generator (Mulberry32)
 */
export class PRNG {
    constructor(seed) {
        this.seedState = this.hashSeed(seed);
    }

    /**
     * Generate a 32-bit hash from a string or number seed
     */
    hashSeed(seed) {
        if (typeof seed === 'number') {
            return seed | 0;
        }
        let hash = 0;
        const str = String(seed);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    /**
     * Returns a pseudo-random float between 0 (inclusive) and 1 (exclusive)
     */
    next() {
        let t = (this.seedState += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Returns a float in the range [min, max)
     */
    nextRange(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Returns an integer in the range [min, max)
     */
    nextInt(min, max) {
        return Math.floor(this.nextRange(min, max));
    }

    /**
     * Returns a random element from an array
     */
    choose(arr) {
        return arr[this.nextInt(0, arr.length)];
    }
}
