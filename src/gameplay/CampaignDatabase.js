import { getAllRecipes } from '../systems/RecipeDatabase.js';

export const CAMPAIGN_TOOL_PROFILES = Object.freeze({
    iron_axe: Object.freeze({ id: 'iron_axe', type: 'melee', attackKind: 'arc', damage: 22, range: 2,
        cooldown: 0.48, duration: 0.48, impactTime: 0.22, halfArc: Math.PI * 0.35, toolKind: 'axe', treePower: 2 }),
    stone_pickaxe: Object.freeze({ id: 'stone_pickaxe', type: 'melee', attackKind: 'arc', damage: 10, range: 2,
        cooldown: 0.65, duration: 0.62, impactTime: 0.30, halfArc: Math.PI * 0.3, toolKind: 'pickaxe' }),
    iron_pickaxe: Object.freeze({ id: 'iron_pickaxe', type: 'melee', attackKind: 'arc', damage: 18, range: 2,
        cooldown: 0.6, duration: 0.58, impactTime: 0.28, halfArc: Math.PI * 0.3, toolKind: 'pickaxe' }),
});

const resource = (id, name, icon, options = {}) => ({
    id, name, nameEn: name, icon, stackSize: 99, pickupRadius: 2.5, spawnWeight: 0,
    color: [0.55, 0.43, 0.24], meshScale: [0.2, 0.2, 0.2], consumable: false, ...options,
});
export const CAMPAIGN_RESOURCES = Object.fromEntries([
    ['fiber', 'Sợi thực vật', '🌿'], ['iron_ore', 'Quặng sắt', '⛏️'],
    ['copper_ore', 'Quặng đồng', '⛏️'], ['iron_ingot', 'Thỏi sắt', '▰'],
    ['copper_ingot', 'Thỏi đồng', '▰'], ['charcoal', 'Than củi', '⬛'],
    ['scrap', 'Phế liệu', '⚙️'], ['copper_wire', 'Dây đồng', '🧵'],
    ['carrot_seed', 'Hạt giống thực phẩm', '🌱'], ['herb_seed', 'Hạt giống thảo dược', '🌱'],
].map(([id, name, icon]) => [id, resource(id, name, icon)]));
for (const [id, name, icon, model, hunger] of [
    ['carrot', 'Cà rốt', '🥕', 'food_carrot', 15],
    ['smoked_meal', 'Thức ăn hun khói', '🍖', 'food_meat-cooked', 55],
    ['reef_fish', 'Cá rạn', '🐟', 'survival_fish', 12],
    ['ocean_fish', 'Cá biển lớn', '🐠', 'survival_fish-large', 20],
]) CAMPAIGN_RESOURCES[id] = resource(id, name, icon, { modelId: `campaign:${model}`, consumable: true, vitalEffect: { type: 'hunger', amount: hunger } });
for (const [id, name, icon, model] of [
    ['hook', 'Móc kéo', '🪝', 'campaign_hook'], ['torch', 'Đuốc', '🔦', 'campaign_torch'],
    ['stone_pickaxe', 'Cuốc đá', '⛏️', 'survival_tool-pickaxe'],
    ['iron_pickaxe', 'Cuốc sắt', '⛏️', 'survival_tool-pickaxe-upgraded'],
    ['iron_axe', 'Rìu sắt', '🪓', 'survival_tool-axe-upgraded'],
    ['dive_kit', 'Bộ lặn', '🤿', 'campaign_dive_kit'], ['radio', 'Radio cứu hộ', '📻', 'campaign_radio'],
    ['battery', 'Pin sửa chữa', '🔋', 'campaign_battery'], ['compass', 'La bàn dẫn đường', '🧭', 'campaign_compass'],
]) CAMPAIGN_RESOURCES[id] = resource(id, name, icon, { stackSize: 1, modelId: `campaign:${model}` });
for (const [id, profile] of Object.entries(CAMPAIGN_TOOL_PROFILES)) Object.assign(CAMPAIGN_RESOURCES[id], {
    weaponType: profile.type, weaponDamage: profile.damage, weaponRange: profile.range,
});
CAMPAIGN_RESOURCES.repair_kit = resource('repair_kit', 'Bộ sửa chữa', '🛠️', { stackSize: 20 });

function structure(id, name, model, size, ingredients, options = {}) {
    return { id, name, modelId: model.includes(':') ? model : `campaign:${model}`,
        size, ingredients, tier: 1, structural: false, capacity: 0, ...options };
}
export const STRUCTURE_DEFINITIONS = Object.fromEntries([
    structure('foundation', 'Móng gỗ', 'campaign_foundation', [2, 0.2, 2], { wood: 4 }, { structural: true }),
    structure('floor', 'Sàn gỗ', 'campaign_floor', [2, 0.2, 2], { wood: 3 }, { structural: true, parent: 'foundation' }),
    structure('wall', 'Tường gỗ', 'campaign_wall', [2, 2.4, 0.16], { wood: 3 }, { structural: true, parent: 'foundation', edge: true }),
    structure('doorway', 'Khung cửa', 'campaign_doorway', [2, 2.4, 0.16], { wood: 3 }, { structural: true, parent: 'foundation', edge: true }),
    structure('door', 'Cửa gỗ', 'campaign_door', [1, 2.04, 0.2], { wood: 2, rope: 1 }, { structural: true, parent: 'doorway' }),
    structure('roof', 'Mái gỗ', 'campaign_roof', [2, 0.12, 2.15], { wood: 3, fiber: 2 }, { structural: true, parent: 'foundation' }),
    structure('shelter', 'Mái trú ẩn', 'campaign_tent', [2.8, 1.65, 2.8], { wood: 6, rope: 2 }, { shelter: true }),
    structure('campfire', 'Lửa trại', 'survival:bonfire_fire', [0.9, 0.4, 0.9], { stone: 4, wood: 3 }, { fire: true }),
    structure('water_collector', 'Bồn hứng nước', 'campaign_water_tank', [1.35, 1.65, 1.05], { wood: 4, barrel: 1 }, { waterCapacity: 5 }),
    structure('bed', 'Giường nghỉ', 'survival_bedroll-frame', [1, 0.45, 1.8], { wood: 5, rope: 2, fiber: 4 }, { bed: true }),
    structure('chest', 'Rương nhỏ', 'survival_chest', [1, 0.7, 0.7], { wood: 6, rope: 1 }, { capacity: 24 }),
    structure('large_chest', 'Rương lớn', 'survival_box-large', [1.3, 0.8, 0.9], { wood: 10, iron_ingot: 2 }, { capacity: 48, tier: 2 }),
    structure('workbench', 'Bàn chế tạo', 'survival_workbench', [1.8, 1.05, 0.9], { wood: 8, stone: 3 }, { station: 'workbench' }),
    structure('smelter', 'Lò nung', 'campaign_smelter', [1.2, 1.87, 0.95], { stone: 12, wood: 4 }, { station: 'smelter', tier: 2, fire: true, capacity: 8 }),
    structure('repair_bench', 'Bàn sửa chữa', 'survival_workbench-anvil', [1.8, 1, 0.9], { wood: 8, iron_ingot: 4, scrap: 3 }, { station: 'repair_bench', tier: 3 }),
    structure('planter', 'Luống trồng', 'campaign_planter', [2.1, 0.42, 1.1], { wood: 6, fiber: 2 }, { crop: true }),
    structure('smoker', 'Giàn hun khói', 'campaign_smoker', [1.2, 1.7, 0.8], { wood: 6, rope: 2, stone: 3 }, { station: 'smoker', fire: true, capacity: 8 }),
    structure('fish_trap', 'Bẫy cá', 'campaign_fish_trap', [0.65, 0.85, 0.65], { wood: 3, rope: 2, fiber: 4 }, { waterOnly: true, capacity: 4 }),
    structure('large_water_collector', 'Bồn nước nâng cấp', 'campaign_water_tank', [1.62, 1.98, 1.26], { wood: 8, barrel: 2, iron_ingot: 2 }, { tier: 2, waterCapacity: 15 }),
].map(def => [def.id, def]));
for (const def of Object.values(STRUCTURE_DEFINITIONS)) {
    CAMPAIGN_RESOURCES[def.id] ||= resource(def.id, def.name, '🔨', { modelId: def.modelId, stackSize: 1, consumable: true });
}

const recipe = (id, name, ingredients, options = {}) => ({
    id, name, icon: CAMPAIGN_RESOURCES[id]?.icon || '🔨', ingredients, tier: 1, station: null,
    duration: 0, yield: 1, outputId: id, category: 'tool', ...options,
});
export const CAMPAIGN_RECIPES = Object.fromEntries([
    recipe('rope', 'Dây thừng', { fiber: 3 }),
    recipe('unravel_rope', 'Tách sợi dây thừng', { rope: 1 }, { outputId: 'fiber', yield: 3, category: 'material', icon: '🌿',
        description: 'Tháo một dây thừng thành 3 sợi thực vật. Dây kéo được từ vật trôi biển giúp bổ sung sợi khi trên đảo đã hết.' }),
    recipe('barrel', 'Thùng gỗ', { wood: 8, rope: 1, iron_ingot: 1 }, { tier: 2, station: 'workbench' }),
    recipe('hook', 'Móc kéo', { wood: 2, stone: 2, rope: 2 }),
    recipe('torch', 'Đuốc', { wood: 2, fiber: 2 }),
    recipe('stone_pickaxe', 'Cuốc đá', { wood: 3, stone: 4, rope: 1 }),
    recipe('iron_axe', 'Rìu sắt', { iron_ingot: 3, wood: 3, rope: 1 }, { tier: 2, station: 'workbench' }),
    recipe('iron_pickaxe', 'Cuốc sắt', { iron_ingot: 3, wood: 3, rope: 1 }, { tier: 2, station: 'workbench' }),
    recipe('iron_ingot', 'Nung sắt', { iron_ore: 2 }, { tier: 2, station: 'smelter', duration: 45, category: 'material' }),
    recipe('copper_ingot', 'Nung đồng', { copper_ore: 2 }, { tier: 2, station: 'smelter', duration: 50, category: 'material' }),
    recipe('charcoal', 'Than củi', { wood: 3 }, { tier: 2, station: 'smelter', duration: 30, yield: 2, category: 'material' }),
    recipe('copper_wire', 'Dây đồng', { copper_ingot: 1 }, { tier: 3, station: 'repair_bench', yield: 3, category: 'material' }),
    recipe('battery', 'Pin sửa chữa', { scrap: 3, copper_ingot: 2, iron_ingot: 1 }, { tier: 3, station: 'repair_bench' }),
    recipe('dive_kit', 'Bộ lặn', { iron_ingot: 4, scrap: 4, rope: 2 }, { tier: 3, station: 'repair_bench' }),
    recipe('radio', 'Radio cứu hộ', { scrap: 6, copper_wire: 4, battery: 1 }, { tier: 3, station: 'repair_bench' }),
    recipe('compass', 'La bàn dẫn đường', { iron_ingot: 2, copper_ingot: 1 }, { tier: 3, station: 'repair_bench' }),
    recipe('repair_kit', 'Bộ sửa chữa', { wood: 3, fiber: 2, scrap: 1 }, { tier: 3, station: 'repair_bench' }),
    recipe('smoked_meal', 'Thức ăn hun khói', { raw_fish: 1 }, { station: 'smoker', duration: 90, category: 'food' }),
    recipe('smoke_boar', 'Hun khói thịt lợn', { raw_boar_meat: 1 }, { station: 'smoker', duration: 90, outputId: 'smoked_meal', category: 'food' }),
    recipe('smoke_reef', 'Hun khói cá rạn', { reef_fish: 1 }, { station: 'smoker', duration: 90, outputId: 'smoked_meal', category: 'food' }),
    recipe('smoke_ocean', 'Hun khói cá lớn', { ocean_fish: 1 }, { station: 'smoker', duration: 120, outputId: 'smoked_meal', yield: 2, category: 'food' }),
    ...Object.values(STRUCTURE_DEFINITIONS).filter(def => !def.structural).map(def =>
        recipe(def.id, def.name, def.ingredients, { tier: def.tier, category: 'structure' })),
].map(def => [def.id, def]));

// Every effective Campaign recipe exposes the same metadata, including inherited
// Classic recipes. Fuel is a nominal minimum at full fire intensity; rain can
// extend the burn time. Production still consumes the station's actual fuel.
const EFFECTIVE_CAMPAIGN_RECIPES = Object.fromEntries(
    [...getAllRecipes(), ...Object.values(CAMPAIGN_RECIPES)].map(def => [def.id, {
        tier: 1, station: null, duration: 0, yield: 1, outputId: def.id,
        requiresBlueprint: null, ...def,
        fuel: def.duration ? { minimumSeconds: def.duration, items: ['wood', 'charcoal'] } : null,
    }])
);
export function getCampaignRecipe(id) { return EFFECTIVE_CAMPAIGN_RECIPES[id] || null; }
export function getCampaignRecipes() { return Object.values(EFFECTIVE_CAMPAIGN_RECIPES); }

export const CAMPAIGN_DIFFICULTY = {
    relaxed: { name: 'Thư giãn', metabolism: 0.6, damage: 0.6, dropBackpack: false, dropHotbar: false },
    standard: { name: 'Tiêu chuẩn', metabolism: 1, damage: 1, dropBackpack: true, dropHotbar: false },
    harsh: { name: 'Khắc nghiệt', metabolism: 1.4, damage: 1.4, dropBackpack: true, dropHotbar: true },
};
export const CAMPAIGN_BALANCE = Object.freeze({
    daySeconds: 1800, hungerDrainPerSecond: 100 / 1500, thirstDrainPerSecond: 100 / 1080,
    gridSize: 2, maximumParts: 400, maximumStructures: 80,
    maximumSlope: 0.6, craftingRadius: 5, woodFuelSeconds: 120, charcoalFuelSeconds: 300,
    cropFoodSeconds: 1800, cropHerbSeconds: 1200, fishTrapSeconds: 300,
    basicOxygenSeconds: 45, equippedOxygenSeconds: 120, hookRange: 20,
});
