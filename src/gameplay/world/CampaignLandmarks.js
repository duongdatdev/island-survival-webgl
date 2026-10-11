import { CAMPAIGN_JOURNALS } from '../CampaignStory.js';
import { SURVEY_STATIONS } from '../../systems/FieldSurvey.js';
import { wreckSalvageLayout } from '../../systems/WreckSalvage.js';
import { mineExtractionLayout } from '../../systems/MineExtraction.js';
import { journalSearchLayout } from './JournalSearch.js';

/** POI art and interactive positions share one deterministic layout. */
export function buildCampaignLandmarks(world) {
    const models = [], journals = {}, surveyStations = {}, poi = id => world.pois.find(p => p.id === id);
    const add = (id, model, position, yaw = 0, scale = [1, 1, 1], gate = null) => models.push({ id, model: 'campaign:' + model, position, yaw, scale, gate });
    for (const id of ['abandoned_camp', 'coastal_depot']) {
        const p = poi(id).position;
        add(`${id}-tent`, 'campaign_tent', [p[0] + 4, p[1], p[2] + 3]);
        add(`${id}-bench`, 'survival_workbench', [p[0] - 4, p[1], p[2]]);
        add(`${id}-cargo`, 'pirate_crate', [p[0] + 3, p[1], p[2] - 3]);
    }
    const mine = poi('mine');
    add('mine-room', 'cave_room-small', mine.position);
    // This is geometry resting on the reserved plateau, not a hole in the heightfield.
    add('mine-entrance', 'cave_gate', [mine.position[0], mine.position[1], mine.position[2] + 6]);
    const mineFaces = mineExtractionLayout(world);
    for (const face of mineFaces) add(face.modelId, 'survival_resource-stone', face.base, 0, [10, 10, 10]);
    const station = poi('weather_station').position;
    for (let x = -2; x <= 2; x += 2) for (let z = -2; z <= 2; z += 2) {
        add(`station-floor-${x}-${z}`, 'campaign_floor', [station[0] + x, station[1], station[2] + z]);
        add(`station-roof-${x}-${z}`, 'campaign_roof', [station[0] + x, station[1] + 2.6, station[2] + z]);
    }
    for (const side of [-1, 1]) for (let offset = -2; offset <= 2; offset += 2) {
        add(`station-side-${side}-${offset}`, 'campaign_wall', [station[0] + side * 3, station[1] + 0.2, station[2] + offset], Math.PI / 2);
        if (side < 0 || offset !== 0) add(`station-end-${side}-${offset}`, 'campaign_wall', [station[0] + offset, station[1] + 0.2, station[2] + side * 3]);
    }
    add('station-doorway', 'campaign_doorway', [station[0], station[1] + 0.2, station[2] + 3]);
    add('station-gate', 'campaign_door', [station[0] - 0.5, station[1] + 0.2, station[2] + 3], 0, [1, 1, 1], 'station_gate');
    add('station-console-table', 'survival_workbench', [station[0], station[1] + 0.2, station[2] - 1]);
    add('station-console', 'campaign_radio', [station[0], station[1] + 1.25, station[2] - 1]);
    const wreck = poi('offshore_wreck');
    add('wreck-hull', 'pirate_ship-wreck', wreck.position, wreck.yaw, [1.8, 1.2, 1.8]);
    const salvageNodes = wreckSalvageLayout(world);
    for (const node of salvageNodes) add(node.modelId, node.model, node.base, node.yaw, node.scale);
    const depot = poi('coastal_depot').position;
    add('depot-supply-box', 'pirate_crate', [depot[0] + 1.5, depot[1], depot[2]], 0, [0.75, 0.75, 0.75]);
    const tower = poi('signal_tower').position;
    add('tower-antenna', 'campaign_antenna', tower);
    add('tower-radio-table', 'survival_workbench', [tower[0] - 2, tower[1], tower[2] + 1]);
    add('tower-radio', 'campaign_radio', [tower[0] - 2, tower[1] + 1.05, tower[2] + 1]);
    add('tower-generator', 'survival_box-large', [tower[0] + 2, tower[1], tower[2]]);
    for (const station of SURVEY_STATIONS) {
        const p = poi(station.poi).position, base = p.map((value, axis) => value + station.offset[axis]);
        add(`survey-${station.id}`, station.model, base);
        if (station.id === 'wind') add('survey-wind-dial', 'campaign_compass', [base[0], base[1] + 1.1, base[2]], 0, [3, 3, 3]);
        if (station.id === 'water') for (let i = 0; i < 3; i++) {
            const scale = 0.7 - i * 0.1;
            add(`survey-water-bucket-${i}`, 'survival_barrel', [base[0] + (i - 1) * 0.65, base[1], base[2] + 1], 0, [scale, scale, scale]);
        }
        if (station.id === 'pressure') for (let i = 0; i < 3; i++) {
            add(`survey-pressure-gauge-${i}`, 'campaign_compass', [base[0] + (i - 1) * 0.3, base[1] + 1.06, base[2]], 0, [2, 2, 2]);
        }
        surveyStations[station.id] = { ...station, position: [base[0], base[1] + 0.8, base[2]] };
    }
    const journalSearchSites = journalSearchLayout(world);
    for (const [id, journal] of Object.entries(CAMPAIGN_JOURNALS)) {
        const p = poi(journal.poi).position;
        const position = [p[0], p[1] + 0.35, p[2] + (journal.optional ? 4 : 0)];
        if (id === 'station_coordinates') { position[2] -= 1; position[1] += 1; }
        // The normalized wreck's open hold floor is 1.385 m above its base.
        // Rest the bag on that floor, rather than inside the sealed lower hull.
        if (id === 'wreck_manifest') position[1] = p[1] + 1.7;
        if (journalSearchSites[id]) {
            position.splice(0, 3, ...journalSearchSites[id].position);
            add(`search-crate-${id}`, 'pirate_crate', journalSearchSites[id].base, 0, [.75, .75, .75]);
        }
        journals[id] = { ...journal, position };
        add(`note-${id}`, 'food_bag', [position[0], position[1] - (journalSearchSites[id] ? 0.05 : 0.3), position[2]], 0, [0.6, 0.6, 0.6]);
    }
    for (const site of Object.values(journalSearchSites)) journals[site.clueId].text += '\n\n' + site.clue;
    for (const target of world.pois.filter(p => p.id !== 'offshore_wreck')) {
        add(`sign-${target.id}`, 'survival_signpost', [target.position[0] + 8, target.position[1], target.position[2] + 7]);
    }
    return { models, journals, journalSearchSites, surveyStations, salvageNodes, mineFaces, stationGate: [station[0], station[1] + 1, station[2] + 3], towerConsole: [tower[0] - 2, tower[1] + 1.05, tower[2] + 1] };
}
