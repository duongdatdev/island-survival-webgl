import { PRNG } from '../gameplay/world/PRNG.js';

export const SURVEY_STATIONS = Object.freeze([
    { id: 'wind', eventId: 'survey_wind', title: 'Cột đo hướng gió', poi: 'signal_tower', place: 'Tháp tín hiệu', offset: [-7, 0, -3], model: 'pirate_mast-ropes' },
    { id: 'water', eventId: 'survey_water', title: 'Bộ cân lưu lượng', poi: 'waterfall', place: 'Thác nước', offset: [-7, 0, -2], model: 'campaign_water_tank' },
    { id: 'pressure', eventId: 'survey_pressure', title: 'Bàn hiệu chỉnh áp suất', poi: 'abandoned_camp', place: 'Trại bỏ hoang', offset: [-7, 0, -3], model: 'survival_workbench-grind' },
]);
export const SURVEY_CAPACITIES = [8, 5, 3];
const wrap = angle => (angle % 360 + 360) % 360;
const error = (a, b) => Math.abs((a - b + 540) % 360 - 180);
export const pressureReadings = ([a, b, c]) => [2 * a + b, 2 * b + c, a + 2 * c];
export function pourSurveyWater(levels, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 2 || to < 0 || to > 2 || from === to) return null;
    const amount = Math.min(levels[from], SURVEY_CAPACITIES[to] - levels[to]);
    if (!amount) return null;
    const next = [...levels]; next[from] -= amount; next[to] += amount; return next;
}

/** Reachable, nontrivial water targets; no puzzle depends on random-only loot or elapsed days. */
export function waterSurveyStates() {
    const nodes = [{ levels: [8, 0, 0], route: [] }], seen = new Set(['8,0,0']);
    for (let cursor = 0; cursor < nodes.length; cursor++) {
        const node = nodes[cursor];
        for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) {
            const levels = pourSurveyWater(node.levels, from, to);
            if (!levels || seen.has(levels.join(','))) continue;
            seen.add(levels.join(',')); nodes.push({ levels, route: [...node.route, [from, to]] });
        }
    }
    return nodes;
}
const waterTargets = waterSurveyStates().filter(node => node.route.length >= 6);
export function makeSurveyLayout(seed) {
    const random = new PRNG('field-survey-v1:' + seed), wind = [];
    while (wind.length < 3) {
        const angle = random.nextInt(0, 72) * 5;
        if (wind.every(previous => error(previous, angle) >= 45)) wind.push(angle);
    }
    const water = random.choose(waterTargets), pressure = Array.from({ length: 3 }, () => random.nextInt(2, 8));
    return { wind, water: [...water.levels], waterMinimumMoves: water.route.length, pressure: pressureReadings(pressure) };
}

export class FieldSurvey {
    constructor(seed) { this.layout = makeSurveyLayout(seed); this.restore(null); }
    complete(id) { return id === 'wind' ? this.wind.readings.length === 3 : !!this[id]?.complete; }
    allComplete() { return SURVEY_STATIONS.every(station => this.complete(station.id)); }
    act(id, command, argument) {
        if (!SURVEY_STATIONS.some(station => station.id === id)) return { ok: false, error: 'Thiết bị không tồn tại.' };
        if (this.complete(id)) return { ok: false, error: 'Thiết bị này đã hiệu chỉnh xong.' };
        if (command === 'reset') {
            if (id === 'wind') { this.wind.angle = 0; this.wind.readings = []; }
            if (id === 'water') this.water.levels = [8, 0, 0];
            if (id === 'pressure') this.pressure.valves = [0, 0, 0];
            this[id].moves++; return { ok: true, message: 'Đã đặt lại thiết bị.' };
        }
        if (id === 'wind') {
            if (command === 'turn' && [-5, 5].includes(argument)) this.wind.angle = wrap(this.wind.angle + argument);
            else if (command === 'angle' && Number.isInteger(argument) && argument >= 0 && argument <= 355 && argument % 5 === 0) this.wind.angle = argument;
            else if (command === 'measure') {
                if (error(this.wind.angle, this.layout.wind[this.wind.readings.length]) > 2) return { ok: false, error: 'Kim chưa trùng hướng của cờ gió. Hãy căn lại rồi ghi mẫu.' };
                this.wind.readings.push(this.wind.angle);
            } else return { ok: false, error: 'Thao tác không hợp lệ.' };
        } else if (id === 'water') {
            if (command === 'pour' && Array.isArray(argument)) {
                const next = pourSurveyWater(this.water.levels, ...argument);
                if (!next) return { ok: false, error: 'Bình nguồn rỗng hoặc bình nhận đã đầy.' };
                this.water.levels = next;
            } else if (command === 'test') {
                if (!this.water.levels.every((v, i) => v === this.layout.water[i])) return { ok: false, error: 'Lượng nước chưa khớp bộ chuẩn.' };
                this.water.complete = true;
            } else return { ok: false, error: 'Thao tác không hợp lệ.' };
        } else {
            if (command === 'turn' && Array.isArray(argument) && [0, 1, 2].includes(argument[0]) && [-1, 1].includes(argument[1])) {
                const [index, amount] = argument, value = this.pressure.valves[index] + amount;
                if (value < 0 || value > 9) return { ok: false, error: 'Van chỉ chỉnh từ 0 đến 9.' };
                this.pressure.valves[index] = value;
            } else if (command === 'test') {
                if (!pressureReadings(this.pressure.valves).every((v, i) => v === this.layout.pressure[i])) return { ok: false, error: 'Ba đồng hồ chưa cùng khớp áp suất chuẩn.' };
                this.pressure.complete = true;
            } else return { ok: false, error: 'Thao tác không hợp lệ.' };
        }
        this[id].moves++;
        return { ok: true, completed: this.complete(id), message: this.complete(id) ? 'Đã hiệu chỉnh thiết bị và lưu bản đo.' : id === 'wind' && command === 'measure' ? `Đã ghi ${this.wind.readings.length}/3 mẫu gió.` : '' };
    }
    snapshot() { return structuredClone({ version: 1, wind: this.wind, water: this.water, pressure: this.pressure }); }
    restore(saved) {
        if (saved == null) {
            this.wind = { angle: 0, readings: [], moves: 0 };
            this.water = { levels: [8, 0, 0], complete: false, moves: 0 };
            this.pressure = { valves: [0, 0, 0], complete: false, moves: 0 }; return;
        }
        assertFieldSurveySnapshot(saved, this.layout);
        const copy = structuredClone(saved); this.wind = copy.wind; this.water = copy.water; this.pressure = copy.pressure;
    }
}

export function assertFieldSurveySnapshot(saved, seedOrLayout) {
    const layout = typeof seedOrLayout === 'object' ? seedOrLayout : makeSurveyLayout(seedOrLayout);
    const integer = (value, high) => Number.isSafeInteger(value) && value >= 0 && value <= high;
    const angle = value => integer(value, 355) && value % 5 === 0;
    const list = (values, length, predicate) => Array.isArray(values) && values.length === length && values.every(predicate);
    const { wind, water, pressure } = saved || {};
    if (saved?.version !== 1 || !wind || !water || !pressure
        || ![wind, water, pressure].every(s => integer(s.moves, Number.MAX_SAFE_INTEGER))
        || !angle(wind.angle) || !Array.isArray(wind.readings) || wind.readings.length > 3
        || !wind.readings.every((value, i) => angle(value) && error(value, layout.wind[i]) <= 2)
        || wind.moves < wind.readings.length
        || wind.readings.length === 3 && wind.angle !== wind.readings[2]
        || !list(water.levels, 3, (value, i) => integer(value, SURVEY_CAPACITIES[i])) || water.levels.reduce((sum, v) => sum + v, 0) !== 8
        || typeof water.complete !== 'boolean' || !waterSurveyStates().some(node => node.levels.every((v, i) => v === water.levels[i]))
        || !list(pressure.valves, 3, value => integer(value, 9)) || typeof pressure.complete !== 'boolean'
        || water.complete && (!water.levels.every((v, i) => v === layout.water[i]) || water.moves <= layout.waterMinimumMoves)
        || pressure.complete && (!pressureReadings(pressure.valves).every((v, i) => v === layout.pressure[i]) || pressure.moves <= pressure.valves.reduce((sum, v) => sum + v, 0))) throw new Error('Bản lưu khảo sát hiện trường không hợp lệ.');
}
