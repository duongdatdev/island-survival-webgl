export const MINE_FACES = Object.freeze([
    { id: 'iron', resourceId: 'iron_ore', name: 'Vỉa sắt sâu', offset: [-3, 0, -3] },
    { id: 'copper', resourceId: 'copper_ore', name: 'Vỉa đồng sâu', offset: [3, 0, -3] },
]);
export const MINE_WORK_SECONDS = 6;
export const MINE_BATCH_SIZE = 2;

export function mineExtractionLayout(world) {
    const mine = world.pois.find(poi => poi.id === 'mine');
    return MINE_FACES.map(face => {
        const base = face.offset.map((value, axis) => mine.position[axis] + value);
        base[1] = world.terrainGenerator.getHeight(base[0], base[2]);
        return { ...face, base, position: [base[0], base[1] + .5, base[2]], modelId: `mine-face-${face.id}` };
    });
}

/** Repeatable player work, never offline generation or a real-time unlock. */
export class MineExtraction {
    constructor() { this.restore(null); }
    pause() { this.active = null; }
    toolRate(inventory) { return inventory.hasItem('iron_pickaxe') ? 1 : inventory.hasItem('stone_pickaxe') ? .6 : 0; }
    start(id, inventory) {
        const state = Object.hasOwn(this.faces, id) ? this.faces[id] : null;
        if (!state) return { ok: false, error: 'Không có vỉa quặng này.' };
        if (state.progress === MINE_WORK_SECONDS) return this.claim(id, inventory);
        if (!this.toolRate(inventory)) return { ok: false, error: 'Cần cuốc đá hoặc cuốc sắt để đào tiếp vỉa quặng.' };
        this.active = id;
        return { ok: true, message: 'Giữ phím tương tác để đào. Thả phím hoặc rời vị trí sẽ giữ phần việc đã làm.' };
    }
    claim(id, inventory) {
        const definition = MINE_FACES.find(face => face.id === id), state = this.faces[id];
        if (!definition || state.progress !== MINE_WORK_SECONDS) return { ok: false, error: 'Chưa đào xong lớp quặng.' };
        if (!inventory.addItem(definition.resourceId, MINE_BATCH_SIZE)) {
            this.pause(); return { ok: false, waiting: true, error: 'Túi đầy. Quặng đã đào vẫn ở vỉa; cất đồ rồi quay lại lấy.' };
        }
        state.progress = 0; state.batches = Math.min(Number.MAX_SAFE_INTEGER, state.batches + 1);
        return { ok: true, claimed: id, resourceId: definition.resourceId, count: MINE_BATCH_SIZE,
            message: `Đã khai thác ${MINE_BATCH_SIZE} quặng ${id === 'iron' ? 'sắt' : 'đồng'}. Có thể tiếp tục đào lớp mới.` };
    }
    update(seconds, inventory, { held = false, eligible = false } = {}) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Thời gian khai thác không hợp lệ.');
        if (!this.active) return null;
        if (!held || !eligible || !this.toolRate(inventory)) { this.pause(); return { paused: true }; }
        const id = this.active, state = this.faces[id];
        state.progress = Math.min(MINE_WORK_SECONDS, state.progress + seconds * this.toolRate(inventory));
        return state.progress === MINE_WORK_SECONDS ? this.claim(id, inventory) : { working: true, id };
    }
    activity() {
        const definition = MINE_FACES.find(face => face.id === this.active);
        return definition ? { name: definition.name, progress: this.faces[definition.id].progress / MINE_WORK_SECONDS } : null;
    }
    snapshot() { return { version: 1, faces: structuredClone(this.faces) }; }
    restore(saved) {
        if (saved == null) this.faces = Object.fromEntries(MINE_FACES.map(face => [face.id, { progress: 0, batches: 0 }]));
        else { assertMineExtractionSnapshot(saved); this.faces = structuredClone(saved.faces); }
        this.active = null;
    }
}

export function assertMineExtractionSnapshot(saved) {
    if (!saved || saved.version !== 1 || !saved.faces || Array.isArray(saved.faces)
        || Object.keys(saved.faces).length !== MINE_FACES.length || !MINE_FACES.every(face => {
            const state = saved.faces[face.id];
            return state && Number.isFinite(state.progress) && state.progress >= 0 && state.progress <= MINE_WORK_SECONDS
                && Number.isSafeInteger(state.batches) && state.batches >= 0;
        })) throw new Error('Bản lưu khai thác mỏ không hợp lệ.');
}
