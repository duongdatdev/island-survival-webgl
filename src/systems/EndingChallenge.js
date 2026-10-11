import { PRNG } from '../gameplay/world/PRNG.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const oceanLane = distance => Math.sin(distance / 180) * 10 + Math.sin(distance / 70) * 5;

export function assertEndingChallenge(saved) {
    const range = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
    if (!saved || !['raft', 'rescue'].includes(saved.route) || !['active', 'completed', 'failed'].includes(saved.status)
        || !range(saved.elapsed, 0, 721) || !Number.isInteger(saved.repairs) || !range(saved.repairs, 0, 3)
        || typeof saved.reason !== 'string' || saved.reason.length > 500 || typeof saved.storm !== 'boolean') throw new Error('Bản lưu thử thách kết thúc bị hỏng.');
    if (saved.route === 'raft') {
        if (typeof saved.motor !== 'boolean' || !range(saved.along, 0, 2700) || !range(saved.across, -2700, 2700)
            || !range(saved.heading, -1.15, 1.15) || !range(saved.hull, 0, 100) || !range(saved.cooldown, 0, 2.5)
            || !Array.isArray(saved.rocks) || saved.rocks.length !== 20 || saved.rocks.some(rock => !rock
                || !range(rock.along, 100, 1700) || !range(rock.across, -30, 30) || !range(rock.radius, 1.8, 2.8))) throw new Error('Dữ liệu tuyến biển bị hỏng.');
    } else if (!range(saved.power, 0, 100) || !range(saved.tuning, 0, 100) || !range(saved.target, 20, 80)
        || !range(saved.signal, 0, 480.1) || !Number.isInteger(saved.fuel) || !range(saved.fuel, 0, 16) || saved.fuel % 2
        || !range(saved.nextStrike, 90, 850) || !range(saved.protection, 0, 35) || !range(saved.frequencyPhase, -Math.PI, Math.PI)
        || saved.strikeWarning != null && !range(saved.strikeWarning, 0, 95)
        || saved.quality != null && !range(saved.quality, 0, 1)) throw new Error('Bản lưu radio bị hỏng.');
}

/** Both endings run on active simulation time; input, course, damage and resources are saved. */
export class EndingChallenge {
    constructor() { this.state = null; }
    start(route, { seed = '', motor = false, repairs = 3 } = {}) {
        if (!['raft', 'rescue'].includes(route)) throw new Error('Tuyến kết thúc không hợp lệ.');
        const random = new PRNG(`ending:${route}:${seed}`);
        const common = { route, status: 'active', elapsed: 0, repairs, reason: '', storm: false };
        this.state = route === 'raft' ? { ...common, motor, along: 0, across: 0, heading: 0, hull: 100, cooldown: 0,
            rocks: Array.from({ length: 20 }, (_, i) => {
                const along = 120 + i * 82 + random.nextRange(-12, 12);
                return { along, across: oceanLane(along) + random.nextRange(-9, 9), radius: random.nextRange(1.8, 2.8) };
            }) } : { ...common, power: 100, tuning: 50, target: 50, signal: 0, fuel: 16,
            nextStrike: 90, protection: 0, strikeWarning: 90, frequencyPhase: random.nextRange(-Math.PI, Math.PI) };
        return this.state;
    }
    update(seconds, input = {}) {
        const state = this.state;
        if (!state || state.status !== 'active' || !Number.isFinite(seconds) || seconds <= 0) return;
        if (input.repair && state.repairs > 0) {
            if (state.route === 'raft' && state.hull < 90) { state.repairs--; state.hull = Math.min(100, state.hull + 35); }
            if (state.route === 'rescue' && state.protection <= 0) { state.repairs--; state.protection = 35; }
        }
        if (state.route === 'rescue' && input.refuel && state.fuel >= 2 && state.power < 85) { state.fuel -= 2; state.power = Math.min(100, state.power + 30); }
        let remaining = seconds;
        while (remaining > 0.000001 && state.status === 'active') {
            const step = Math.min(0.05, remaining); remaining -= step; state.elapsed += step;
            const lightningPhase = ((state.elapsed - 90) % 95 + 95) % 95;
            state.storm = state.route === 'rescue' ? lightningPhase > 65 || lightningPhase < 10 : Math.sin(state.elapsed / 27) > 0.35;
            if (state.route === 'raft') this._raft(step, input);
            else this._rescue(step, input);
            if (state.elapsed >= 720 && state.status === 'active') this.fail('Đã bỏ lỡ cửa sổ thời tiết. Hãy thử lại từ lúc chuẩn bị.');
        }
    }
    _raft(seconds, input) {
        const s = this.state;
        const steer = clamp(Number(input.steer) || 0, -1, 1);
        s.heading = clamp(s.heading + steer * seconds * (s.motor ? 0.62 : 0.54), -1.15, 1.15);
        const wind = Math.sin(s.elapsed / 19) * (s.storm ? 0.27 : 0.14);
        const speed = clamp((input.slow ? 1.9 : input.throttle ? 3.15 : 2.95) + (s.motor ? 0.25 : 0) + wind, 1.5, 3.7);
        s.along += Math.cos(s.heading) * speed * seconds;
        s.across += Math.sin(s.heading) * speed * seconds + Math.sin(s.elapsed / 31) * seconds * (s.storm ? 0.16 : 0.07);
        s.cooldown = Math.max(0, s.cooldown - seconds);
        if (s.cooldown <= 0 && s.rocks.some(rock => Math.hypot(rock.along - s.along, rock.across - s.across) < rock.radius + 0.8)) {
            s.hull -= s.motor ? 18 : 22; s.cooldown = 2.5;
        }
        if (Math.abs(s.across - oceanLane(s.along)) > 38) s.hull -= seconds * 2;
        if (s.hull < 40) s.hull -= seconds * 0.035;
        s.hull = Math.max(0, s.hull);
        if (!s.hull) this.fail('Bè đã hỏng giữa rạn đá. Có thể thử lại từ checkpoint, căn cứ vẫn được giữ.');
        else if (s.along >= 1800 && Math.abs(s.across - oceanLane(1800)) < 24) s.status = 'completed';
    }
    _rescue(seconds, input) {
        const s = this.state;
        s.tuning = clamp(s.tuning + clamp(Number(input.tune) || 0, -1, 1) * seconds * 12, 0, 100);
        s.target = 50 + Math.sin(s.elapsed / 33 + s.frequencyPhase) * 17 + (s.storm ? Math.sin(s.elapsed / 7) * 4 : 0);
        s.power = Math.max(0, s.power - seconds * (s.storm ? 0.15 : 0.1));
        s.protection = Math.max(0, s.protection - seconds);
        s.strikeWarning = Math.max(0, s.nextStrike - s.elapsed);
        if (s.elapsed >= s.nextStrike) {
            if (!s.protection) s.power = Math.max(0, s.power - 22);
            s.nextStrike += 95;
        }
        const quality = clamp(1 - Math.abs(s.tuning - s.target) / 10, 0, 1);
        s.quality = quality;
        if (input.transmit && s.power > 10 && quality >= 0.65) s.signal += seconds;
        else s.signal = Math.max(0, s.signal - seconds * 0.06);
        if (s.power <= 0 && s.fuel < 2) this.fail('Máy phát hết điện và nhiên liệu. Hãy thử lại từ checkpoint.');
        else if (s.signal >= 480) s.status = 'completed';
    }
    fail(reason) { if (this.state?.status === 'active') { this.state.status = 'failed'; this.state.reason = reason; } }
    snapshot() { return this.state ? structuredClone(this.state) : null; }
    restore(saved) {
        if (!saved) { this.state = null; return; }
        assertEndingChallenge(saved);
        if (!['raft', 'rescue'].includes(saved.route) || !['active', 'completed', 'failed'].includes(saved.status)
            || !Number.isFinite(saved.elapsed) || saved.elapsed < 0 || saved.elapsed > 721
            || !Number.isInteger(saved.repairs) || saved.repairs < 0 || saved.repairs > 3) throw new Error('Bản lưu thử thách kết thúc bị hỏng.');
        const fields = saved.route === 'raft' ? ['along', 'across', 'heading', 'hull', 'cooldown']
            : ['power', 'tuning', 'target', 'signal', 'fuel', 'nextStrike', 'protection', 'frequencyPhase'];
        if (!fields.every(key => Number.isFinite(saved[key]))) throw new Error('Bản lưu thử thách thiếu dữ liệu.');
        if (saved.route === 'raft' && (!Array.isArray(saved.rocks) || saved.rocks.length !== 20
            || saved.rocks.some(rock => ![rock.along, rock.across, rock.radius].every(Number.isFinite) || rock.radius <= 0))) throw new Error('Dữ liệu tuyến biển bị hỏng.');
        this.state = structuredClone(saved);
    }
}
