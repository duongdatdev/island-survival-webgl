/** Broad-phase index; callers do precise collision tests on returned candidates. */
export class SpatialGrid {
    constructor(cellSize = 8) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid spatial cell size');
        this.cellSize = cellSize;
        this.cells = new Map();
        this.entries = new Map();
    }

    _keys(bounds) {
        const keys = [];
        for (let x = Math.floor(bounds.min[0] / this.cellSize); x <= Math.floor(bounds.max[0] / this.cellSize); x++) {
            for (let z = Math.floor(bounds.min[2] / this.cellSize); z <= Math.floor(bounds.max[2] / this.cellSize); z++) keys.push(`${x}:${z}`);
        }
        return keys;
    }

    insert(id, bounds, value) {
        this.remove(id);
        const keys = this._keys(bounds);
        this.entries.set(id, { bounds, value, keys });
        for (const key of keys) {
            if (!this.cells.has(key)) this.cells.set(key, new Set());
            this.cells.get(key).add(id);
        }
    }

    remove(id) {
        const entry = this.entries.get(id);
        if (!entry) return;
        for (const key of entry.keys) {
            const cell = this.cells.get(key);
            cell.delete(id);
            if (!cell.size) this.cells.delete(key);
        }
        this.entries.delete(id);
    }

    query(bounds) {
        const ids = new Set();
        for (const key of this._keys(bounds)) for (const id of this.cells.get(key) || []) ids.add(id);
        return [...ids].map(id => this.entries.get(id)).filter(entry => entry.bounds.min.every((low, axis) =>
            low <= bounds.max[axis] && entry.bounds.max[axis] >= bounds.min[axis])).map(entry => entry.value);
    }

    queryRadius(position, radius) {
        return this.query({ min: position.map(v => v - radius), max: position.map(v => v + radius) });
    }

    clear() { this.cells.clear(); this.entries.clear(); }
}
