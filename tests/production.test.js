import test from 'node:test';
import assert from 'node:assert/strict';
import { StructureRegistry } from '../src/systems/StructureRegistry.js';
import { ProductionSystem } from '../src/systems/ProductionSystem.js';
import { ItemContainer } from '../src/systems/ItemContainer.js';

function fixture(type = 'smelter') {
    const registry = new StructureRegistry({ level: () => 3 });
    const inventory = new ItemContainer(20);
    for (const id of ['wood', 'stone', 'rope', 'fiber', 'iron_ore', 'carrot_seed', 'herb_seed', 'fresh_water']) inventory.addItem(id, 50);
    const { structure } = registry.place(type, [0, 0, 0], 0, inventory);
    return { registry, inventory, structure, production: new ProductionSystem(registry) };
}

test('recovered rope supplies fiber without amplification and over-capacity conversion rolls back', () => {
    const registry = new StructureRegistry({ level: () => 1 });
    const production = new ProductionSystem(registry);
    const inventory = new ItemContainer(2);
    inventory.addItem('rope', 2);
    inventory.addItem('wood', 99);
    const before = inventory.snapshot();
    assert.equal(production.craft('unravel_rope', inventory, [0, 0, 0]).ok, false);
    assert.deepEqual(inventory.snapshot(), before);
    inventory.removeItem('wood', 99);
    for (let i = 0; i < 20; i++) {
        assert.equal(production.craft('unravel_rope', inventory, [0, 0, 0]).ok, true);
        assert.equal(inventory.getCount('fiber'), 3);
        assert.equal(production.craft('rope', inventory, [0, 0, 0]).ok, true);
        assert.equal(inventory.getCount('rope'), 2);
        assert.equal(inventory.getCount('fiber'), 0);
    }
    inventory.removeItem('rope', 1);
    inventory.addItem('wood', 99);
    assert.equal(production.craft('unravel_rope', inventory, [0, 0, 0]).ok, true);
    assert.equal(inventory.getCount('fiber'), 3);
    assert.equal(inventory.getCount('rope'), 0);
});

test('production reserves inputs, pauses for fuel, then produces once', () => {
    const { production, inventory, structure } = fixture();
    assert.equal(production.craft('iron_ingot', inventory, [0, 1, 0]).ok, true);
    assert.equal(inventory.getCount('iron_ore'), 48);
    production.update(90);
    assert.equal(structure.jobs[0].progress, 0);
    assert.equal(structure.jobs[0].state, 'no_fuel');
    production.addFuel(structure, inventory);
    production.update(45);
    assert.equal(structure.container.getCount('iron_ingot'), 1);
    assert.equal(structure.jobs.length, 0);
    production.update(45);
    assert.equal(structure.container.getCount('iron_ingot'), 1);
});

test('full output consumes neither fuel nor processing progress', () => {
    const { production, inventory, structure } = fixture();
    production.craft('iron_ingot', inventory, [0, 1, 0]);
    production.addFuel(structure, inventory);
    structure.container.addItem('wood', 99 * 8);
    production.update(30);
    assert.equal(structure.fuelSeconds, 120);
    assert.equal(structure.jobs[0].progress, 0);
    structure.container.removeItem('wood', 99);
    production.update(45);
    assert.equal(structure.container.getCount('iron_ingot'), 1);
});

test('queue cancellation refunds unfinished inputs but cannot repeat', () => {
    const { production, inventory, structure } = fixture();
    const { job } = production.craft('iron_ingot', inventory, [0, 1, 0]);
    production.addFuel(structure, inventory);
    production.update(20);
    assert.equal(production.cancel(structure.id, job.id, inventory).ok, true);
    assert.equal(inventory.getCount('iron_ore'), 50);
    assert.equal(structure.fuelSeconds, 100);
    assert.equal(production.cancel(structure.id, job.id, inventory).ok, false);
});

test('large and small simulation steps produce identical output and fuel', () => {
    const a = fixture();
    const b = fixture();
    for (const f of [a, b]) {
        f.production.addFuel(f.structure, f.inventory, 'wood', 3);
        for (let i = 0; i < 5; i++) f.production.craft('iron_ingot', f.inventory, [0, 1, 0]);
        assert.equal(f.production.craft('iron_ingot', f.inventory, [0, 1, 0]).ok, false);
    }
    a.production.update(300, { rainFactor: 0.5 });
    for (let i = 0; i < 30; i++) b.production.update(10, { rainFactor: 0.5 });
    assert.deepEqual(a.structure.container.snapshot(), b.structure.container.snapshot());
    assert.ok(Math.abs(a.structure.fuelSeconds - b.structure.fuelSeconds) < 0.00001);
    assert.ok(Math.abs(a.structure.jobs[0].progress - b.structure.jobs[0].progress) < 0.00001);
});

test('production resumes after serializing registry and queue state', () => {
    const { production, inventory, structure, registry } = fixture();
    production.addFuel(structure, inventory);
    production.craft('iron_ingot', inventory, [0, 1, 0]);
    production.update(20);
    const restored = new StructureRegistry({ level: () => 3 });
    restored.restore(registry.snapshot());
    const resumed = new ProductionSystem(restored);
    resumed.restore(production.snapshot());
    resumed.update(25);
    assert.equal(restored.structures.get(structure.id).container.getCount('iron_ingot'), 1);
});

test('crops stop without water, grow while watered and harvest atomically', () => {
    const { production, inventory, structure } = fixture('planter');
    assert.equal(production.plant(structure, 'carrot', inventory), true);
    production.update(1800);
    assert.equal(structure.crop.progress, 0);
    for (let i = 0; i < 3; i++) production.water(structure, inventory);
    production.update(1800);
    assert.equal(production.cropStage(structure), 4);
    const full = new ItemContainer(1);
    full.addItem('wood', 99);
    assert.equal(production.harvest(structure, full), false);
    assert.ok(structure.crop);
    assert.equal(production.harvest(structure, inventory), true);
    assert.equal(inventory.getCount('carrot'), 3);
    assert.equal(inventory.getCount('carrot_seed'), 50);
    assert.equal(structure.crop, null);
});
