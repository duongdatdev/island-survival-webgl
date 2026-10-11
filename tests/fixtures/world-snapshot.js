import { CampaignProgression } from '../../src/systems/CampaignProgression.js';
import { GameEvents } from '../../src/systems/GameEvents.js';
import { StructureRegistry } from '../../src/systems/StructureRegistry.js';
import { ProductionSystem } from '../../src/systems/ProductionSystem.js';
import { ItemContainer } from '../../src/systems/ItemContainer.js';

export function worldSnapshot(world, seconds = 10, chestWood = 4) {
    const events = new GameEvents(), progress = new CampaignProgression(events);
    for (const [eventType, payload] of [['drank', { id: 'fresh_water' }], ['journalRead', { id: 'wreck_log' }],
        ['structurePlaced', { type: 'shelter' }], ['structurePlaced', { type: 'campfire' }]]) events.emit(eventType, payload);
    const registry = new StructureRegistry(), production = new ProductionSystem(registry), supplies = new ItemContainer(3);
    supplies.addItem('wood', 6); supplies.addItem('rope', 1);
    const { structure } = registry.place('chest', [0, 0, 0], 0, supplies); structure.container.addItem('wood', chestWood);
    const legacyStructure = { isBuilt: false, position: [0, 0, 0] };
    return { version: 2, mode: world.mode, generatorVersion: world.generatorVersion, worldSeed: world.seed,
        savedAt: Date.now(), survivalSeconds: seconds, player: { position: [1, 2, 3], yaw: 0 },
        vitals: { health: 100, hunger: 80, thirst: 70, stamina: 90 },
        inventory: { slots: Array(28).fill(null), selectedHotbarIndex: 0 },
        raft: { framePlaced: false, floatsPlaced: false, paddlePlaced: false, sailPlaced: false, motorPlaced: false },
        structures: { shelter: structuredClone(legacyStructure), campfire: structuredClone(legacyStructure),
            waterCollector: { ...structuredClone(legacyStructure), waterStored: 0, rainProgress: 0 } },
        resources: [], blueprints: [],
        campaign: world.mode === 'campaign' ? { ...progress.snapshot(), registry: registry.snapshot(), production: production.snapshot(),
            playSeconds: seconds, markers: [], discovered: [], pinnedRecipe: null, deathBags: [], nextBag: 1,
            fishing: null, hookReward: null, oxygen: 45, swimY: null, deaths: 0,
            ending: { challenge: null, towerRepaired: false, pendingRoute: null }, claimedCaches: [], torchLit: true } : null };
}
