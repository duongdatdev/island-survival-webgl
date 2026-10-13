import { getCampaignRecipe, STRUCTURE_DEFINITIONS, CAMPAIGN_BALANCE } from '../gameplay/CampaignDatabase.js';
import { transactCraft } from './ItemContainer.js';

const RAW_FOOD = new Set(['raw_game_meat', 'raw_fish', 'raw_crab_meat', 'raw_seagull_meat', 'raw_boar_meat', 'reef_fish', 'ocean_fish', 'carrot', 'coconut']);
const CROPS = {
    carrot: { seed: 'carrot_seed', duration: CAMPAIGN_BALANCE.cropFoodSeconds, output: 'carrot', stages: 4 },
    herb: { seed: 'herb_seed', duration: CAMPAIGN_BALANCE.cropHerbSeconds, output: 'herb', stages: 3 },
};

export class ProductionSystem {
    constructor(registry, options = {}) {
        this.registry = registry;
        this.tier = options.tier || registry.level;
        this.blueprints = options.blueprints || new Set();
        this.events = options.events || registry.events;
        this.nextJob = 1;
    }

    recipe(id) { return getCampaignRecipe(id); }

    checkCraft(id, inventory, position) {
        const recipe = this.recipe(id);
        if (!recipe) return { ok: false, error: 'Công thức không tồn tại.' };
        if ((recipe.tier || 1) > this.tier()) return { ok: false, error: `Cần công nghệ cấp ${recipe.tier}.` };
        if (recipe.requiresBlueprint && !this.blueprints.has(recipe.requiresBlueprint)) return { ok: false, error: 'Chưa tìm được bản thiết kế.' };
        const station = recipe.station ? this.registry.nearby(position, 3)
            .find(record => STRUCTURE_DEFINITIONS[record.type].station === recipe.station) : null;
        if (recipe.station && !station) return { ok: false, error: 'Hãy đứng gần trạm phù hợp.' };
        if (recipe.duration && station.jobs.length >= 5) return { ok: false, error: 'Hàng đợi đã đủ 5 lượt.' };
        const sources = this.registry.craftingSources(position, inventory);
        for (const [id, count] of Object.entries(recipe.ingredients)) {
            if (sources.reduce((sum, source) => sum + source.getCount(id), 0) < count) return { ok: false, error: 'Chưa đủ nguyên liệu.' };
        }
        return { ok: true, recipe, station, sources };
    }

    craft(id, inventory, position) {
        const checked = this.checkCraft(id, inventory, position);
        if (!checked.ok) return checked;
        const { recipe, station, sources } = checked;
        const output = { id: recipe.outputId || id, count: recipe.yield || 1 };
        if (!transactCraft(sources, recipe.ingredients, recipe.duration ? [] : output, inventory)) {
            return { ok: false, error: 'Túi không đủ chỗ cho thành phẩm.' };
        }
        if (recipe.duration) {
            const job = { id: `job-${this.nextJob++}`, recipeId: id, duration: recipe.duration, progress: 0,
                ingredients: { ...recipe.ingredients }, output, state: 'queued' };
            station.jobs.push(job);
            this.events?.emit('productionQueued', { stationId: station.id, recipeId: id, jobId: job.id });
            return { ok: true, job };
        }
        this.events?.emit('crafted', { id: output.id, count: output.count });
        return { ok: true };
    }

    cancel(stationId, jobId, inventory) {
        const station = this.registry.structures.get(stationId);
        const index = station?.jobs.findIndex(job => job.id === jobId) ?? -1;
        if (index < 0) return { ok: false, error: 'Lượt sản xuất không còn tồn tại.' };
        const job = station.jobs[index];
        if (job.progress >= job.duration) return { ok: false, error: 'Lượt này đã hoàn thành.' };
        const refund = Object.entries(job.ingredients).map(([id, count]) => ({ id, count }));
        if (!transactCraft([inventory], {}, refund)) return { ok: false, error: 'Túi không đủ chỗ nhận nguyên liệu.' };
        station.jobs.splice(index, 1);
        this.events?.emit('productionCancelled', { stationId, jobId });
        return { ok: true };
    }

    addFuel(record, inventory, id = 'wood', count = 1) {
        if (!record || !STRUCTURE_DEFINITIONS[record.type]?.fire || !['wood', 'charcoal'].includes(id)
            || !Number.isInteger(count) || count < 1) return false;
        const seconds = count * (id === 'wood' ? CAMPAIGN_BALANCE.woodFuelSeconds : CAMPAIGN_BALANCE.charcoalFuelSeconds);
        if (record.fuelSeconds + seconds > 3600 || !inventory.removeItem(id, count)) return false;
        record.fuelSeconds += seconds;
        this.events?.emit('fuelAdded', { id: record.id, seconds });
        return true;
    }

    isBurning(record) {
        return !!record && record.fuelSeconds > 0 && (record.type === 'campfire'
            || STRUCTURE_DEFINITIONS[record.type]?.fire && record.jobs[0]?.state === 'running');
    }

    fireIntensity(record, rainFactor = 0) {
        if (!record || record.fuelSeconds <= 0) return 0;
        return this.registry.sheltered(record.position) ? 1 : Math.max(0.4, 1 - rainFactor * 0.6);
    }

    cook(record, rawId, inventory, position) {
        if (record?.type !== 'campfire' || record.fuelSeconds < 10 || !RAW_FOOD.has(rawId)) return false;
        if (!transactCraft(this.registry.craftingSources(position, inventory), { [rawId]: 1 }, { id: 'cooked_meal', count: 1 }, inventory)) return false;
        record.fuelSeconds -= 10;
        this.events?.emit('cooked', { id: 'cooked_meal', count: 1 });
        return true;
    }

    plant(record, type, inventory) {
        const definition = CROPS[type];
        if (record?.type !== 'planter' || record.crop || !definition || !inventory.removeItem(definition.seed, 1)) return false;
        record.crop = { type, progress: 0, waterSeconds: 0 };
        this.events?.emit('cropPlanted', { type, id: record.id });
        return true;
    }

    water(record, inventory) {
        if (!record?.crop || record.crop.waterSeconds >= 2400 || !inventory.removeItem('fresh_water', 1)) return false;
        record.crop.waterSeconds = Math.min(2400, record.crop.waterSeconds + 600);
        return true;
    }

    cropStage(record) {
        const crop = record?.crop;
        if (!crop) return 0;
        const definition = CROPS[crop.type];
        return Math.min(definition.stages, 1 + Math.floor(crop.progress / definition.duration * definition.stages));
    }

    harvest(record, inventory) {
        const definition = CROPS[record?.crop?.type];
        if (!definition || record.crop.progress < definition.duration) return false;
        if (!transactCraft([inventory], {}, [{ id: definition.output, count: 3 }, { id: definition.seed, count: 1 }])) return false;
        const type = record.crop.type;
        record.crop = null;
        this.events?.emit('cropHarvested', { type, count: 3, id: record.id });
        return true;
    }

    drawWater(record, inventory) {
        if (!record || record.waterStored < 1 || !inventory.addItem('fresh_water', 1)) return false;
        record.waterStored--;
        this.events?.emit('collected', { id: 'fresh_water', count: 1 });
        return true;
    }

    /** Simulation seconds only. No wall-clock/offline advancement. */
    update(seconds, environment = {}) {
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        const rainFactor = Math.max(0, Math.min(1, environment.rainFactor || 0));
        for (const record of this.registry.structures.values()) {
            const definition = STRUCTURE_DEFINITIONS[record.type];
            if (record.type === 'campfire') record.fuelSeconds = Math.max(0, record.fuelSeconds - seconds);
            if (definition.waterCapacity && record.waterStored < definition.waterCapacity) {
                record.rainProgress += seconds * rainFactor;
                const water = Math.min(definition.waterCapacity - record.waterStored, Math.floor(record.rainProgress / 45));
                record.waterStored += water;
                record.rainProgress = record.waterStored >= definition.waterCapacity ? 0 : record.rainProgress - water * 45;
            }
            if (record.type === 'fish_trap' && record.container.canAdd('raw_fish', 1)) {
                record.trapProgress = (record.trapProgress || 0) + seconds;
                while (record.trapProgress >= CAMPAIGN_BALANCE.fishTrapSeconds && record.container.canAdd('raw_fish', 1)) {
                    record.container.addItem('raw_fish', 1);
                    record.trapProgress -= CAMPAIGN_BALANCE.fishTrapSeconds;
                }
                if (!record.container.canAdd('raw_fish', 1)) record.trapProgress = 0;
            }
            if (record.crop) {
                const crop = record.crop;
                const duration = CROPS[crop.type].duration;
                const covered = this.registry.sheltered(record.position);
                const raining = rainFactor > 0.15 && !covered;
                const elapsed = Math.min(seconds, duration - crop.progress, raining ? seconds : crop.waterSeconds);
                crop.progress += elapsed;
                if (!raining) crop.waterSeconds -= elapsed;
            }
            if (!definition.station || !record.jobs.length) continue;
            let remaining = seconds;
            while (remaining > 0 && record.jobs.length) {
                const job = record.jobs[0];
                if (!record.container?.canAdd(job.output.id, job.output.count)) { job.state = 'output_full'; break; }
                if (record.fuelSeconds <= 0) { job.state = 'no_fuel'; break; }
                const efficiency = this.fireIntensity(record, rainFactor);
                const elapsed = Math.min(remaining, record.fuelSeconds, (job.duration - job.progress) / efficiency);
                job.progress += elapsed * efficiency;
                record.fuelSeconds = Math.max(0, record.fuelSeconds - elapsed);
                remaining -= elapsed;
                job.state = 'running';
                if (job.progress >= job.duration - 0.000001) {
                    record.container.addItem(job.output.id, job.output.count);
                    record.jobs.shift();
                    this.events?.emit('crafted', { id: job.output.id, count: job.output.count, stationId: record.id });
                    if (job.output.id === 'smoked_meal') this.events?.emit('cooked', { id: job.output.id, count: job.output.count });
                }
                if (elapsed <= 0) break;
            }
        }
    }

    snapshot() { return { nextJob: this.nextJob }; }
    restore(snapshot = {}) {
        const ids = [...this.registry.structures.values()].flatMap(record => record.jobs.map(job => Number(job.id?.replace('job-', '')) || 0));
        this.nextJob = Math.max(Number(snapshot.nextJob) || 1, 1 + Math.max(0, ...ids));
    }
}
