import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { campaignAnimalSpawns, assertWildlifeSnapshot } from '../src/systems/CampaignWildlife.js';
import { Deer, Goat, Monitor } from '../src/entities/BiomeWildlife.js';
import { CreatureState } from '../src/entities/Creature.js';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';
import { ProductionSystem } from '../src/systems/ProductionSystem.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

test('new biome patches survive seed rotation and old generation keeps its exact original surface', () => {
    for (let seed = 0; seed < 12; seed++) {
        const modern = new CampaignWorldGenerator(), legacy = new CampaignWorldGenerator(2);
        modern.generate('biomes-' + seed, {}, false, { mesh: false, props: false });
        const old = legacy.generate('biomes-' + seed, {}, false, { mesh: false, props: false });
        assert.equal(old.generatorVersion, 2);
        assert.equal(campaignAnimalSpawns(old).length, 36);
        const counts = {};
        for (let z = -260; z < 260; z += 12) for (let x = -260; x < 260; x += 12) {
            const biome = modern.getBiome(x, z);
            counts[biome] = (counts[biome] || 0) + 1;
            assert.ok(!['Savanna', 'Jungle', 'Mangrove'].includes(legacy.getBiome(x, z)));
        }
        for (const biome of ['Savanna', 'Jungle', 'Mangrove', 'Forest', 'Highland', 'RockArea', 'Beach']) {
            assert.ok(counts[biome] > 10, `${seed} missing ${biome}`);
        }
        // Local origin is outside the new terrain patches, and must remain byte stable.
        assert.equal(modern.getHeight(0, 0), legacy.getHeight(0, 0));
    }
});

test('passive wildlife flees, monitor attacks then retreats, and all three produce cookable game meat', () => {
    for (const Type of [Deer, Goat, Monitor]) {
        const animal = new Type(null, [0, 0, 0]);
        animal.update(.1, [1, 0, 0], null);
        assert.equal(animal.state, Type === Monitor ? CreatureState.CHASE : CreatureState.FLEE);
        if (Type === Monitor) { animal.takeDamage(31); assert.equal(animal.state, CreatureState.FLEE); }
        else assert.equal(animal.attackDamage, 0);
        let drops = 0;
        animal.onDeath = loot => { drops++; assert.equal(loot[0].resourceId, 'raw_game_meat'); };
        animal.takeDamage(1000); animal.takeDamage(1000);
        assert.equal(drops, 1);
    }
    assert.doesNotThrow(() => assertWildlifeSnapshot({ killed: ['deer-0', 'goat-0'], animals: [
        { id: 'monitor-0', position: [0, 1, 0], health: 20, yaw: 0 },
    ] }));
    assert.throws(() => assertWildlifeSnapshot({ killed: ['monitor-8'], animals: [] }));
});

test('new wildlife GLBs carry palette textures, one material, valid bounds and stay under triangle budgets', async () => {
    const manifest = JSON.parse(await readFile('assets/creatures/manifest.json', 'utf8'));
    const io = new NodeIO();
    for (const id of ['deer', 'goat', 'monitor']) {
        const model = manifest.models.find(m => m.id === id);
        const document = await io.read(model.path), root = document.getRoot();
        assert.equal(root.listMaterials().length, 1);
        assert.ok(root.listMaterials()[0].getBaseColorTexture());
        let triangles = 0;
        for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
            triangles += primitive.getIndices().getCount() / 3;
            assert.ok(primitive.getAttribute('NORMAL'));
            assert.ok(primitive.getAttribute('TEXCOORD_0'));
        }
        assert.equal(triangles, model.triangles);
        assert.ok(triangles <= (id === 'deer' ? 900 : 700));
    }
});

test('game meat cooks on a fuelled campfire and smokes without duplicating ingredients', () => {
    for (const type of ['campfire', 'smoker']) {
        const registry = new StructureRegistry({ level: () => 3 }), inventory = new ItemContainer(20);
        for (const id of ['wood', 'stone', 'iron_ingot', 'rope', 'fiber', 'raw_game_meat']) inventory.addItem(id, 50);
        const { structure } = registry.place(type, [0, 0, 0], 0, inventory);
        assert.ok(structure);
        const production = new ProductionSystem(registry);
        assert.equal(production.addFuel(structure, inventory), true);
        if (type === 'campfire') {
            assert.equal(production.cook(structure, 'raw_game_meat', inventory, [0, 1, 0]), true);
            assert.equal(inventory.getCount('cooked_meal'), 1);
        } else {
            assert.equal(production.craft('smoke_game', inventory, [0, 1, 0]).ok, true);
            production.update(90);
            assert.equal(structure.container.getCount('smoked_meal'), 1);
        }
        assert.equal(inventory.getCount('raw_game_meat'), 49);
    }
});
