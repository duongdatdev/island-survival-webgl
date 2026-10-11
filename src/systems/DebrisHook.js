/** Hook operates only on drifting debris definitions, never creatures or arbitrary entities. */
export class DebrisHook {
    constructor({ range = 20, speed = 8, onCollected = () => {} } = {}) {
        this.range = range;
        this.speed = speed;
        this.onCollected = onCollected;
        this.state = null;
        this.pending = null;
    }

    cast(origin, direction, debris) {
        if (this.state || this.pending) return false;
        const length = Math.hypot(direction[0], direction[2]);
        if (length < 0.001) return false;
        const forward = [direction[0] / length, direction[2] / length];
        const targets = debris.filter(target => target.debrisDef?.gives && !target.isCollected && !target.isExpired && !target.isHooked)
            .map(target => {
                const dx = target.position[0] - origin[0], dz = target.position[2] - origin[2];
                return { target, along: dx * forward[0] + dz * forward[1], across: Math.abs(dx * forward[1] - dz * forward[0]) };
            }).filter(hit => hit.along > 0 && hit.along <= this.range && hit.across <= 1.3)
            .sort((a, b) => a.along - b.along);
        if (!targets.length) return false;
        const target = targets[0].target;
        target.isHooked = true;
        this.state = { phase: 'flying', target, origin: [...origin], position: [...origin], time: 0 };
        return true;
    }

    update(seconds, player, inventory) {
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        if (this.pending) { this.claim(inventory); return; }
        const state = this.state;
        if (!state) return;
        if (state.target.isCollected || state.target.isExpired) { this.cancel(); return; }
        let remaining = seconds;
        if (state.phase === 'flying') {
            const step = Math.min(remaining, 0.6 - state.time);
            state.time += step;
            remaining -= step;
            const fraction = Math.min(1, state.time / 0.6);
            state.position = state.origin.map((value, axis) => value + (state.target.position[axis] - value) * fraction);
            state.position[1] += Math.sin(fraction * Math.PI) * 1.2;
            if (state.time >= 0.6) state.phase = 'pulling';
        }
        if (state.phase === 'pulling') {
            const dx = player[0] - state.target.position[0], dz = player[2] - state.target.position[2];
            const distance = Math.hypot(dx, dz);
            const fraction = Math.min(1, remaining * this.speed / Math.max(0.001, distance));
            state.target.position[0] += dx * fraction;
            state.target.position[2] += dz * fraction;
            state.target.updateModelMatrix?.();
            state.position = Array.from(state.target.position);
            if (distance - remaining * this.speed <= 1.4) {
                const reward = state.target.debrisDef.gives;
                this.pending = { id: reward.resourceId, count: reward.amount };
                state.target.collect();
                this.cancel();
                this.claim(inventory);
            }
        }
    }

    claim(inventory) {
        if (!this.pending || !inventory?.addItem(this.pending.id, this.pending.count)) return false;
        const reward = this.pending;
        this.pending = null;
        this.onCollected(reward);
        return true;
    }
    cancel() { if (this.state) this.state.target.isHooked = false; this.state = null; }
    snapshot() { return this.pending ? { ...this.pending } : null; }
    restore(saved) {
        this.cancel();
        this.pending = null;
        if (!saved) return;
        if (typeof saved.id !== 'string' || !saved.id || !Number.isInteger(saved.count) || saved.count < 1 || saved.count > 999) throw new Error('Bản lưu móc kéo không hợp lệ.');
        this.pending = { id: saved.id, count: saved.count };
    }
}
