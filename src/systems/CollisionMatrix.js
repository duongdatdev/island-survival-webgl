import { CollisionLayers } from './CollisionLayers.js';

const L = CollisionLayers;

export const CollisionMatrix = (() => {
    const matrix = new Map();

    function set(layerA, layerB, collides) {
        if (!matrix.has(layerA)) matrix.set(layerA, new Map());
        matrix.get(layerA).set(layerB, collides);
        if (!matrix.has(layerB)) matrix.set(layerB, new Map());
        matrix.get(layerB).set(layerA, collides);
    }

    function check(layerA, layerB) {
        const row = matrix.get(layerA);
        if (!row) return false;
        const result = row.get(layerB);
        return result !== undefined ? result : false;
    }

    set(L.Player, L.Terrain, true);
    set(L.Player, L.Environment, true);
    set(L.Player, L.Resource, true);
    set(L.Player, L.Debris, true);

    set(L.Environment, L.Environment, true);
    set(L.Resource, L.Terrain, true);
    set(L.Debris, L.Terrain, true);
    set(L.Debris, L.Debris, true);

    // v0.5: Creature collisions. Creature-vs-Creature keeps a herd of boars
    // from stacking into a single silhouette.
    set(L.Player, L.Creature, true);
    set(L.Creature, L.Environment, true);
    set(L.Creature, L.Terrain, true);
    set(L.Creature, L.Creature, true);

    return { check, set, matrix };
})();
