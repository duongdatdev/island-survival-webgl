import { PRNG } from '../gameplay/world/PRNG.js';

export const CIRCUIT_SIZE = 5;
export const CIRCUIT_DIRECTIONS = [{ bit: 1, dx: 0, dy: -1, name: 'Bắc' }, { bit: 2, dx: 1, dy: 0, name: 'Đông' },
    { bit: 4, dx: 0, dy: 1, name: 'Nam' }, { bit: 8, dx: -1, dy: 0, name: 'Tây' }];
const START = 10, END = 14;
const opposite = bit => bit === 1 ? 4 : bit === 2 ? 8 : bit === 4 ? 1 : 2;
export const rotateCircuitMask = (mask, turns) => { for (let i = 0; i < turns; i++) mask = ((mask << 1) | (mask >> 3)) & 15; return mask; };
function adjacent(index, direction) {
    const x = index % 5 + direction.dx, y = Math.floor(index / 5) + direction.dy;
    return x < 0 || x >= 5 || y < 0 || y >= 5 ? -1 : y * 5 + x;
}
function directionBetween(a, b) { return CIRCUIT_DIRECTIONS.find(d => adjacent(a, d) === b).bit; }

export function makeCircuitLayout(seed) {
    const random = new PRNG('station-circuit-v1:' + seed); let budget = 8000;
    const search = (path, visited) => {
        const index = path.at(-1);
        if (index === END) return path.length >= 15 ? path : null;
        if (--budget <= 0) return null;
        const neighbors = CIRCUIT_DIRECTIONS.map(d => adjacent(index, d)).filter(n => n >= 0 && !(visited & (1 << n)));
        for (let i = neighbors.length - 1; i > 0; i--) { const j = random.nextInt(0, i + 1); [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]]; }
        for (const next of neighbors) { const found = search([...path, next], visited | (1 << next)); if (found) return found; }
        return null;
    };
    const path = search([START], 1 << START) || [10, 5, 0, 1, 2, 3, 4, 9, 8, 7, 6, 11, 16, 15, 20, 21, 22, 17, 12, 13, 18, 23, 24, 19, 14];
    const masks = Array.from({ length: 25 }, () => random.choose([3, 5, 6, 9, 10, 12]));
    path.forEach((index, i) => { masks[index] = (i ? directionBetween(index, path[i - 1]) : 8)
        | (i < path.length - 1 ? directionBetween(index, path[i + 1]) : 2); });
    const sensors = [0.25, 0.5, 0.75].map(fraction => path[Math.floor((path.length - 1) * fraction)]);
    const rotations = masks.map(() => random.nextInt(0, 4));
    // A new board is never already solved, even for an unusual random seed.
    rotations[START] = masks[START] === 3 ? 0 : masks[START] === 9 ? 1 : 3;
    while (rotateCircuitMask(masks[START], rotations[START]) & 8) rotations[START] = (rotations[START] + 1) % 4;
    return { masks, sensors, path, initialRotations: rotations };
}

/** Installed materials remain in the station. Closing/resetting the puzzle never charges them again. */
export class RepairCircuit {
    constructor(seed) {
        this.layout = makeCircuitLayout(seed); this.rotations = [...this.layout.initialRotations];
        this.installed = false; this.solved = false; this.attempts = 0; this.moves = 0;
    }
    mask(index) { return rotateCircuitMask(this.layout.masks[index], this.rotations[index]); }
    rotate(index) {
        if (this.solved || !Number.isInteger(index) || index < 0 || index >= 25) return false;
        this.rotations[index] = (this.rotations[index] + 1) % 4; this.moves++; return true;
    }
    reset() { if (this.solved) return false; this.rotations = [...this.layout.initialRotations]; this.moves++; return true; }
    status() {
        const powered = new Set(), leaks = [];
        if (this.mask(START) & 8) {
            const pending = [START]; powered.add(START);
            while (pending.length) {
                const index = pending.shift(), mask = this.mask(index);
                for (const direction of CIRCUIT_DIRECTIONS) {
                    if (!(mask & direction.bit)) continue;
                    if (index === START && direction.bit === 8 || index === END && direction.bit === 2) continue;
                    const next = adjacent(index, direction);
                    if (next < 0 || !(this.mask(next) & opposite(direction.bit))) { leaks.push({ index, direction: direction.bit }); continue; }
                    if (!powered.has(next)) { powered.add(next); pending.push(next); }
                }
            }
        }
        const sensors = this.layout.sensors.filter(index => powered.has(index));
        return { powered, leaks, sensors, sourceConnected: !!(this.mask(START) & 8),
            complete: powered.has(END) && !!(this.mask(END) & 2) && sensors.length === 3 && leaks.length === 0 };
    }
    test() {
        if (!this.installed || this.solved) return { ok: false, alreadySolved: this.solved };
        this.attempts++; const status = this.status();
        if (!status.complete) return { ok: false, error: `Chưa nối đủ mạch: ${status.sensors.length}/3 cảm biến, ${status.leaks.length} đầu nối hở.` };
        this.solved = true; return { ok: true };
    }
    snapshot() { return { version: 1, rotations: [...this.rotations], installed: this.installed, solved: this.solved, attempts: this.attempts, moves: this.moves }; }
    restore(saved) {
        if (saved == null) { this.rotations = [...this.layout.initialRotations]; this.installed = this.solved = false; this.attempts = this.moves = 0; return; }
        assertCircuitSnapshot(saved, this.layout);
        Object.assign(this, { ...saved, rotations: [...saved.rotations] });
    }
}

export function assertCircuitSnapshot(saved, seedOrLayout) {
    if (!saved || saved.version !== 1 || !Array.isArray(saved.rotations) || saved.rotations.length !== 25
        || saved.rotations.some(r => !Number.isInteger(r) || r < 0 || r > 3)
        || typeof saved.installed !== 'boolean' || typeof saved.solved !== 'boolean'
        || !Number.isSafeInteger(saved.attempts) || saved.attempts < 0 || !Number.isSafeInteger(saved.moves) || saved.moves < 0) throw new Error('Bản lưu mạch điện bị hỏng.');
    if (saved.solved) {
        const circuit = Object.create(RepairCircuit.prototype);
        circuit.layout = typeof seedOrLayout === 'object' ? seedOrLayout : makeCircuitLayout(seedOrLayout);
        circuit.rotations = saved.rotations;
        if (!saved.installed || saved.attempts < 1 || !circuit.status().complete) throw new Error('Mạch điện trong bản lưu chưa thực sự hoàn thành.');
    }
}
