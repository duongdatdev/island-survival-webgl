const FISH = ['raw_fish', 'reef_fish', 'ocean_fish'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** A bite window followed by a reel/release tension challenge. No inventory mutation until landed. */
export class FishingSystem {
    constructor({ random = Math.random, onCaught = () => {}, onMessage = () => {} } = {}) {
        this.random = random;
        this.onCaught = onCaught;
        this.onMessage = onMessage;
        this.state = null;
    }

    cast(position, waterDepth, shoal = null) {
        if (this.state || !Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || waterDepth < 0.5) return false;
        const roll = this.random();
        const group = waterDepth > 3 ? (roll < 0.4 ? 1 : 2) : (roll < 0.65 ? 0 : 1);
        this.state = { phase: 'waiting', position: [...position], fish: FISH[group],
            timer: (shoal ? 1.5 : 2.5) + this.random() * 3, time: 0, tension: 0.25, progress: 0, group,
            yield: shoal ? 2 : 1, shoalId: shoal?.id || null };
        return true;
    }

    update(seconds, { strike = false, reel = false } = {}, inventory) {
        if (!this.state || !Number.isFinite(seconds) || seconds <= 0) return;
        const state = this.state;
        if (state.phase === 'landed') { this.claim(inventory); return; }
        if (state.phase === 'waiting' && strike) { this.cancel('Giật cần quá sớm, cá đã lẩn đi.'); return; }
        if (state.phase === 'bite' && strike) { state.phase = 'reeling'; state.time = 0; }
        let remaining = seconds;
        while (remaining > 0.000001 && this.state && state.phase !== 'landed') {
            const step = Math.min(0.05, remaining);
            remaining -= step;
            if (state.phase === 'waiting' || state.phase === 'bite') {
                state.timer -= step;
                if (state.timer <= 0) {
                    if (state.phase === 'waiting') { state.phase = 'bite'; state.timer += 2; }
                    else { this.cancel('Cá đã nhả mồi. Hãy giật cần khi phao báo cắn câu.'); break; }
                }
            } else {
                state.time += step;
                const surge = Math.sin(state.time * (1.4 + state.group * 0.3)) > 0.25;
                const pull = (surge ? 0.31 : 0.13) + state.group * 0.025;
                state.tension = clamp(state.tension + (reel ? pull : -0.42) * step, 0, 1);
                state.progress = clamp(state.progress + (reel ? 0.095 - state.group * 0.009 : -0.016) * step, 0, 1);
                if (state.tension >= 1) { this.cancel('Dây đã đứt. Thả nút kéo khi dây căng cao.'); break; }
                if (state.time > 4 && state.tension <= 0) { this.cancel('Dây bị chùng quá lâu, cá đã thoát.'); break; }
                if (state.progress >= 1) { state.phase = 'landed'; this.claim(inventory); break; }
            }
        }
    }

    claim(inventory) {
        const state = this.state;
        if (state?.phase !== 'landed' || !inventory?.addItem(state.fish, state.yield || 1)) return false;
        this.state = null;
        this.onCaught(state.fish, state.yield || 1, state.shoalId);
        return true;
    }

    cancel(message = '') {
        // A landed catch is retained even if the bag is full or the world is closed.
        if (this.state?.phase === 'landed') return false;
        this.state = null;
        if (message) this.onMessage(message);
        return true;
    }

    snapshot() { return this.state ? structuredClone(this.state) : null; }
    restore(saved) {
        this.state = null;
        if (!saved) return;
        if (!['waiting', 'bite', 'reeling', 'landed'].includes(saved.phase) || !FISH.includes(saved.fish)
            || !Array.isArray(saved.position) || saved.position.length !== 3 || !saved.position.every(Number.isFinite)
            || ![saved.timer, saved.time, saved.tension, saved.progress].every(Number.isFinite)
            || !Number.isInteger(saved.group) || saved.group < 0 || saved.group > 2
            || saved.yield != null && ![1, 2].includes(saved.yield)
            || saved.shoalId != null && (typeof saved.shoalId !== 'string' || !/^fish-shoal-\d+$/.test(saved.shoalId))) throw new Error('Bản lưu câu cá không hợp lệ.');
        this.state = { ...structuredClone(saved), tension: clamp(saved.tension, 0, 1), progress: clamp(saved.progress, 0, 1) };
    }
}
