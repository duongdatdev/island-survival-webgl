import { PRNG } from './PRNG.js';

const ROUTES = [
    ['optional_1', 'waterfall', 'abandoned_camp', 'waterfall_log'],
    ['optional_2', 'abandoned_camp', 'mine', 'camp_log'],
    ['optional_3', 'mine', 'weather_station', 'mine_log'],
    ['optional_4', 'weather_station', 'signal_tower', 'station_coordinates'],
    ['optional_5', 'coastal_depot', 'waterfall', 'depot_log'],
    ['optional_6', 'signal_tower', 'coastal_depot', 'tower_log'],
];

/** Search sites stay inside the existing clear trail corridor, independently of prop loading. */
export function journalSearchLayout(world) {
    const random = new PRNG('journal-search:' + world.seed);
    return Object.fromEntries(ROUTES.map(([id, originId, destinationId, clueId], index) => {
        const origin = world.pois.find(poi => poi.id === originId), destination = world.pois.find(poi => poi.id === destinationId);
        const a = origin.position, b = destination.position;
        const length = Math.hypot(b[0] - a[0], b[2] - a[2]), fraction = random.nextRange(.35, .65);
        const offset = random.next() < .5 ? -2.5 : 2.5;
        const x = a[0] + (b[0] - a[0]) * fraction - (b[2] - a[2]) / length * offset;
        const z = a[2] + (b[2] - a[2]) * fraction + (b[0] - a[0]) / length * offset;
        const base = [x, world.terrainGenerator.getHeight(x, z), z];
        return [id, { id, originId, destinationId, clueId, base, position: [x, base[1] + .65, z],
            title: `Thùng hồ sơ ${index + 1}`, distance: Math.round(length * fraction),
            clue: `Dấu vết người đi trước: từ ${origin.name}, theo đường tới ${destination.name} khoảng ${Math.round(length * fraction)} m. Tìm một thùng gỗ nhỏ ở mép đường, bên trên có túi hồ sơ. Nhật ký này không bắt buộc để thoát đảo.` }];
    }));
}
