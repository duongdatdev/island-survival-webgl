import { CollisionMatrix } from './CollisionMatrix.js';
import { layerNameFromMask } from './CollisionLayers.js';

export class CollisionSystem {
    constructor() {
        this.colliders = [];
        this._debugMode = false;
    }

    register(entity) {
        if (!entity.collider) return;
        this.colliders.push({ entity, collider: entity.collider });
    }

    unregister(entity) {
        const idx = this.colliders.findIndex(e => e.entity === entity);
        if (idx !== -1) this.colliders.splice(idx, 1);
    }

    clear() {
        this.colliders.length = 0;
    }

    setDebugMode(enabled) {
        this._debugMode = enabled;
    }

    isDebugMode() {
        return this._debugMode;
    }

    getColliders() {
        return this.colliders;
    }

    /**
     * Vertical half-extent of a collider, used for the Y-overlap test.
     * Falls back to the radius so old colliders keep behaving like spheres.
     */
    static _halfHeight(collider) {
        if (collider.height) return collider.height * 0.5;
        return collider.radius || 0.45;
    }

    /**
     * Push `entity` out of every solid collider it overlaps.
     *
     * Despite the name this is used for any moving actor (player, creatures).
     * @param {object} entity
     * @param {object} terrain
     * @param {number} [ignoreLayerMask] - bitmask of layers that must never push
     *        this entity. Used so wildlife cannot shove the player around
     *        (v0.5: two-way pushing made the player drift on its own).
     */
    resolvePlayerCollisions(entity, terrain, ignoreLayerMask = 0) {
        if (!entity.collider || entity.collider.type === 'none') return;

        const selfLayer = entity.collider.layer;
        const selfRadius = entity.collider.radius || 0.45;
        const selfHalfH = CollisionSystem._halfHeight(entity.collider);
        const selfPos = entity.position;
        // Flying / swimming actors must not be snapped onto the terrain surface.
        const snapToTerrain = entity.collider.snapToTerrain !== false;

        for (const { entity: other, collider } of this.colliders) {
            if (other === entity) continue;
            if (collider.type === 'none') continue;
            if (collider.trigger) continue;
            if (ignoreLayerMask && (collider.layer & ignoreLayerMask)) continue;

            if (!CollisionMatrix.check(selfLayer, collider.layer)) continue;

            const dx = selfPos[0] - other.position[0];
            const dz = selfPos[2] - other.position[2];
            const minDist = selfRadius + collider.radius;

            if (minDist <= 0) continue;

            const distSq = dx * dx + dz * dz;
            if (distSq >= minDist * minDist) continue;

            // Vertical overlap test — without this a seagull orbiting 12 units
            // overhead still collided with (and shoved) everything below it.
            const dy = Math.abs(selfPos[1] - other.position[1]);
            if (dy >= selfHalfH + CollisionSystem._halfHeight(collider)) continue;

            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
                const nx = dx / dist;
                const nz = dz / dist;
                const overlap = minDist - dist;
                selfPos[0] += nx * overlap;
                selfPos[2] += nz * overlap;
            } else {
                selfPos[0] += 0.01;
            }

            if (terrain && snapToTerrain) {
                const h = terrain.getHeight(selfPos[0], selfPos[2]);
                selfPos[1] = h + (entity.collider.height ? entity.collider.height * 0.5 : 0.9);
            }
            entity.updateModelMatrix();
        }
    }

    isInsideTrigger(entity, layer) {
        if (!entity.collider) return false;
        const ex = entity.position[0];
        const ez = entity.position[2];
        const eRadius = entity.collider.radius || 0;

        for (const { entity, collider } of this.colliders) {
            if (collider.type === 'none') continue;
            if (!collider.trigger) continue;
            if (collider.layer !== layer) continue;

            const dx = ex - entity.position[0];
            const dz = ez - entity.position[2];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < eRadius + collider.radius) return true;
        }
        return false;
    }

    queryRadius(position, radius, layerMask) {
        const results = [];
        for (const { entity, collider } of this.colliders) {
            if (collider.type === 'none') continue;
            if (layerMask && !(collider.layer & layerMask)) continue;

            const dx = position[0] - entity.position[0];
            const dz = position[2] - entity.position[2];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist <= radius + collider.radius) {
                results.push(entity);
            }
        }
        return results;
    }

    raycast(origin, direction, maxDist, layerMask) {
        let closest = null;
        let closestDist = maxDist;

        for (const { entity, collider } of this.colliders) {
            if (collider.type === 'none') continue;
            if (collider.trigger) continue;
            if (layerMask && !(collider.layer & layerMask)) continue;

            const toTarget = [
                entity.position[0] - origin[0],
                entity.position[1] - origin[1],
                entity.position[2] - origin[2],
            ];

            const t = toTarget[0] * direction[0] + toTarget[1] * direction[1] + toTarget[2] * direction[2];
            if (t < 0 || t > closestDist) continue;

            const closestPoint = [
                origin[0] + direction[0] * t,
                origin[1] + direction[1] * t,
                origin[2] + direction[2] * t,
            ];

            const dX = closestPoint[0] - entity.position[0];
            const dZ = closestPoint[2] - entity.position[2];
            const dist = Math.sqrt(dX * dX + dZ * dZ);

            if (dist <= collider.radius) {
                closest = { entity, distance: t, point: closestPoint };
                closestDist = t;
            }
        }

        return closest;
    }

    getDebugInfo() {
        return this.colliders.map(({ entity, collider }) => ({
            position: entity.position,
            type: collider.type,
            layer: layerNameFromMask(collider.layer),
            trigger: collider.trigger,
            radius: collider.radius,
            halfExtents: collider.halfExtents,
            height: collider.height,
            bounds: {
                min: [
                    entity.position[0] - collider.radius,
                    entity.position[1] - (collider.height || collider.radius),
                    entity.position[2] - collider.radius,
                ],
                max: [
                    entity.position[0] + collider.radius,
                    entity.position[1] + (collider.height || collider.radius),
                    entity.position[2] + collider.radius,
                ],
            },
        }));
    }
}
