import { CAMPAIGN_RECIPES, CAMPAIGN_BALANCE, STRUCTURE_DEFINITIONS } from '../gameplay/CampaignDatabase.js';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_JOURNALS, CAMPAIGN_SIDE_QUESTS } from '../gameplay/CampaignStory.js';
import { getResourceDef } from './ResourceDatabase.js';
import { getRecipeDef } from './RecipeDatabase.js';
import { assertEndingChallenge } from './EndingChallenge.js';
import { assertCircuitSnapshot } from './RepairCircuit.js';
import { assertFieldSurveySnapshot, SURVEY_STATIONS } from './FieldSurvey.js';
import { assertWreckSalvageSnapshot, WRECK_PARTS } from './WreckSalvage.js';
import { assertMineExtractionSnapshot } from './MineExtraction.js';

const fail = () => { throw new Error('Dữ liệu chiến dịch trong bản lưu không hợp lệ.'); };
const require = condition => { if (!condition) fail(); };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const range = (value, low = 0, high = 1e9) => Number.isFinite(value) && value >= low && value <= high;
const integer = (value, low = 0, high = 1e9) => Number.isSafeInteger(value) && range(value, low, high);
const text = (value, max = 128) => typeof value === 'string' && value.length <= max;
export const saveVector = (value, limit = 10000) => Array.isArray(value) && value.length === 3 && value.every(v => range(v, -limit, limit));
const item = value => object(value) && text(value.id) && getResourceDef(value.id)?.id === value.id && integer(value.count, 1, 999);
export function saveSlots(slots, size) {
    return Array.isArray(slots) && slots.length === size && slots.every(slot => slot === null || item(slot)
        && slot.count <= (getResourceDef(slot.id).stackSize || 99));
}
function list(value, check, max = 1000) {
    return Array.isArray(value) && value.length <= max && value.every(check) && new Set(value).size === value.length;
}
const recipe = id => CAMPAIGN_RECIPES[id] || getRecipeDef(id);
const sameCounts = (a, b) => object(a) && Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([id, count]) => a[id] === count);

export function assertRegistrySnapshot(saved) {
    require(object(saved) && Array.isArray(saved.structures) && saved.structures.length <= 480 && integer(saved.nextId, 1));
    const records = new Map(), jobs = new Set(); let parts = 0, functional = 0;
    for (const record of saved.structures) {
        require(object(record));
        const def = STRUCTURE_DEFINITIONS[record.type];
        require(def?.id === record.type && /^structure-[1-9]\d*$/.test(record.id) && !records.has(record.id)
            && +record.id.slice(10) < saved.nextId && saveVector(record.position, 400) && range(record.yaw, -10000, 10000)
            && Math.abs(record.yaw / (Math.PI / 2) - Math.round(record.yaw / (Math.PI / 2))) < 1e-5
            && range(record.fuelSeconds, 0, 3600) && integer(record.waterStored, 0, def.waterCapacity || 0)
            && range(record.rainProgress, 0, 45) && typeof record.allowCrafting === 'boolean' && typeof record.open === 'boolean'
            && Array.isArray(record.jobs) && record.jobs.length <= 5);
        require(def.capacity ? saveSlots(record.slots, def.capacity) : record.slots == null);
        if (record.crop != null) require(record.type === 'planter' && object(record.crop)
            && ['carrot', 'herb'].includes(record.crop.type)
            && range(record.crop.progress, 0, record.crop.type === 'carrot' ? CAMPAIGN_BALANCE.cropFoodSeconds : CAMPAIGN_BALANCE.cropHerbSeconds)
            && range(record.crop.waterSeconds, 0, 2400));
        if (record.trapProgress != null) require(record.type === 'fish_trap' && range(record.trapProgress, 0, CAMPAIGN_BALANCE.fishTrapSeconds));
        for (const job of record.jobs) {
            require(object(job)); const formula = recipe(job.recipeId);
            require(formula?.duration > 0 && formula.station === def.station && /^job-[1-9]\d*$/.test(job.id) && !jobs.has(job.id)
                && job.duration === formula.duration && range(job.progress, 0, job.duration)
                && ['queued', 'running', 'no_fuel', 'output_full'].includes(job.state)
                && sameCounts(job.ingredients, formula.ingredients) && item(job.output)
                && job.output.id === (formula.outputId || formula.id) && job.output.count === (formula.yield || 1));
            jobs.add(job.id);
        }
        records.set(record.id, record); if (def.structural) parts++; else functional++;
    }
    require(parts <= 400 && functional <= 80 && (saved.respawnBedId == null || records.get(saved.respawnBedId)?.type === 'bed'));
    for (const record of records.values()) {
        const def = STRUCTURE_DEFINITIONS[record.type], parent = records.get(record.parentId);
        require(def.parent ? parent?.type === def.parent : record.parentId == null || !def.structural && parent?.type === 'foundation');
        if (!parent) continue;
        const expected = [...parent.position];
        if (def.edge) { expected[0] += Math.sin(record.yaw); expected[2] += Math.cos(record.yaw); expected[1] += 0.2; }
        else if (record.type === 'roof') expected[1] += 2.6;
        else if (record.type === 'floor') expected[1] += 0.2;
        else if (record.type === 'door') { expected[0] -= Math.cos(parent.yaw) * 0.5; expected[2] += Math.sin(parent.yaw) * 0.5; require(Math.abs(record.yaw - parent.yaw) < 1e-5); }
        else { expected[0] = record.position[0]; expected[2] = record.position[2]; expected[1] += 0.4;
            require(Math.abs(record.position[0] - parent.position[0]) <= 0.8 && Math.abs(record.position[2] - parent.position[2]) <= 0.8); }
        require(expected.every((v, axis) => Math.abs(v - record.position[axis]) < 1e-4));
    }
}

export function assertCampaignSnapshot(c, seed) {
    require(object(c) && integer(c.chapter, 1, 6) && integer(c.tier, 1, 3) && object(c.facts)
        && Object.keys(c.facts).length <= 3000 && Object.entries(c.facts).every(([key, value]) => text(key) && integer(value)));
    require(list(c.completedChapters, id => CAMPAIGN_CHAPTERS.some(ch => ch.id === id), 6)
        && list(c.completedSideQuests, id => CAMPAIGN_SIDE_QUESTS.some(q => q.id === id), 100)
        && list(c.journals, id => Object.hasOwn(CAMPAIGN_JOURNALS, id), 100)
        && list(c.blueprints, id => text(id), 100)
        && list(c.questItems, id => id === 'island_coordinates', 1)
        && text(c.lastMilestone, 300));
    require(Array.isArray(c.pendingRewards) && c.pendingRewards.length <= 100);
    const rewards = new Set();
    for (const reward of c.pendingRewards) {
        require(object(reward) && !rewards.has(reward.id));
        const chapter = CAMPAIGN_CHAPTERS.find(ch => reward.id === 'chapter-' + ch.id);
        const quest = CAMPAIGN_SIDE_QUESTS.find(q => q.id === reward.id), expected = chapter?.reward.items || quest?.reward;
        require(expected && (chapter ? c.completedChapters.includes(chapter.id) : c.completedSideQuests.includes(quest.id))
            && Array.isArray(reward.items) && reward.items.length === expected.length
            && expected.every((value, i) => reward.items[i]?.id === value.id && reward.items[i]?.count === value.count));
        rewards.add(reward.id);
    }
    assertRegistrySnapshot(c.registry);
    require(object(c.production) && integer(c.production.nextJob, 1)
        && c.registry.structures.every(s => s.jobs.every(j => +j.id.slice(4) < c.production.nextJob))
        && range(c.playSeconds) && integer(c.nextBag, 1) && integer(c.deaths) && range(c.oxygen, 0, 120)
        && (c.swimY == null || range(c.swimY, -30, 3)) && (c.pinnedRecipe == null || recipe(c.pinnedRecipe)?.id === c.pinnedRecipe));
    if (c.pinnedObjective != null) require(object(c.pinnedObjective) && integer(c.pinnedObjective.chapter, 1, 6)
        && integer(c.pinnedObjective.index, 0, CAMPAIGN_CHAPTERS[c.pinnedObjective.chapter - 1].objectives.length - 1));
    require(list(c.discovered, key => typeof key === 'string' && /^-?\d+:-?\d+$/.test(key) && key.split(':').every(v => integer(+v, -1, 16)), 324)
        && Array.isArray(c.markers) && c.markers.length <= 20 && c.markers.every(m => object(m) && saveVector(m.position, 400) && text(m.label, 64))
        && Array.isArray(c.deathBags) && c.deathBags.length <= 1024);
    const bags = new Set();
    for (const bag of c.deathBags) {
        require(object(bag) && typeof bag.id === 'string' && /^death-bag-[1-9]\d*$/.test(bag.id) && +bag.id.slice(10) < c.nextBag
            && !bags.has(bag.id) && saveVector(bag.position, 400) && saveSlots(bag.slots, 28)); bags.add(bag.id);
    }
    if (c.hookReward != null) require(item(c.hookReward));
    require(list(c.claimedCaches || [], id => ['wreck_salvage', 'depot_supplies'].includes(id), 2));
    if (c.wreckSalvage != null) {
        assertWreckSalvageSnapshot(c.wreckSalvage);
        const complete = WRECK_PARTS.every(def => c.wreckSalvage.parts[def.id].claimed);
        require(complete === (c.claimedCaches || []).includes('wreck_salvage') && complete === !!c.facts['deviceRepaired:wreck_salvage']);
    }
    if (c.torchLit != null) require(typeof c.torchLit === 'boolean');
    if (c.mineExtraction != null) assertMineExtractionSnapshot(c.mineExtraction);
    if (c.stationCircuit != null) {
        assertCircuitSnapshot(c.stationCircuit, seed);
        if (c.stationCircuit.installed) require(c.facts['deviceRepaired:station_gate'] > 0);
        if (c.stationCircuit.solved) require(c.facts['deviceRepaired:station_console'] > 0);
    }
    if (c.fieldSurvey != null) {
        assertFieldSurveySnapshot(c.fieldSurvey, seed);
        for (const station of SURVEY_STATIONS) {
            const complete = station.id === 'wind' ? c.fieldSurvey.wind.readings.length === 3 : c.fieldSurvey[station.id].complete;
            require(complete === !!c.facts['deviceRepaired:' + station.eventId]);
        }
    }
    if (c.ending != null) {
        require(object(c.ending) && typeof c.ending.towerRepaired === 'boolean' && (c.ending.pendingRoute == null || ['raft', 'rescue'].includes(c.ending.pendingRoute)));
        if (c.ending.challenge != null) assertEndingChallenge(c.ending.challenge);
    }
}

/** Validate the fields applied by GameSaveController before an import can enter a scene. */
export function assertSceneSnapshot(s) {
    require(saveVector(s.player.position) && saveSlots(s.inventory.slots, 28) && object(s.raft)
        && ['framePlaced', 'floatsPlaced', 'paddlePlaced', 'sailPlaced', 'motorPlaced'].every(key => typeof s.raft[key] === 'boolean')
        && object(s.structures));
    for (const key of ['campfire', 'waterCollector']) require(object(s.structures[key]) && typeof s.structures[key].isBuilt === 'boolean' && saveVector(s.structures[key].position));
    if (s.structures.shelter != null) require(object(s.structures.shelter) && typeof s.structures.shelter.isBuilt === 'boolean' && saveVector(s.structures.shelter.position));
    require(range(s.structures.waterCollector.waterStored, 0, 5) && range(s.structures.waterCollector.rainProgress ?? 0, 0, 45)
        && list(s.blueprints, id => text(id), 100) && Array.isArray(s.resources) && s.resources.length <= 10000
        && s.resources.every(r => object(r) && getResourceDef(r.id)?.id === r.id && saveVector(r.position)
            && (r.amount == null || integer(r.amount, 1, 99)) && (r.worldNodeId == null || text(r.worldNodeId))
            && (r.rewardType == null || text(r.rewardType))));
    if (s.exposure != null) require(object(s.exposure) && range(s.exposure.warmth, 0, 100) && range(s.exposure.wetness, 0, 100));
    if (s.environment != null) require(object(s.environment) && range(s.environment.timeOfDay, 0, 1)
        && ['clear', 'cloudy', 'rain', 'storm'].includes(s.environment.weather) && range(s.environment.cloudCover, 0, 1)
        && range(s.environment.windSpeed, 0, 10) && range(s.environment.rainIntensity, 0, 1)
        && list(s.environment.removedObjectIds || [], id => typeof id === 'string' || Number.isInteger(id), 10000));
    if (s.stats != null) require(object(s.stats) && Object.values(s.stats).every(v => range(v)));
    if (s.ui != null) require(object(s.ui) && (s.ui.pinnedRecipeId == null || recipe(s.ui.pinnedRecipeId)?.id === s.ui.pinnedRecipeId));
    if (s.playSeconds != null) require(range(s.playSeconds));
}
