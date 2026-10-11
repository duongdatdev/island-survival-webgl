import { CollisionMatrix } from './CollisionMatrix.js';
import { layerNameFromMask } from './CollisionLayers.js';
import { SpatialGrid } from './SpatialGrid.js';

export class CollisionSystem {
    constructor({ indexed = false } = {}) {
        this.colliders = [];
        this.index = indexed ? new SpatialGrid(8) : null;
        this.entries = new Map();
        this.dynamic = new Set();
        this._debugMode = false;
    }

    register(entity, dynamic = false) {
        if (!entity.collider) return;
        const entry = { entity, collider: entity.collider };
        this.colliders.push(entry);
        if (this.index) { this.entries.set(entity, entry); this.refresh(entity); }
        if (dynamic) this.dynamic.add(entity);
    }

    refresh(entity) {
        const entry = this.entries.get(entity);
        if (!this.index || !entry) return;
        const radius = entity.collider.radius || 0, half = CollisionSystem._halfHeight(entity.collider), p = entity.position;
        this.index.insert(entity, { min: [p[0] - radius, p[1] - half, p[2] - radius], max: [p[0] + radius, p[1] + half, p[2] + radius] }, entry);
    }

    refreshDynamic() { for (const entity of this.dynamic) this.refresh(entity); }

    _nearby(position, radius, halfHeight = Infinity) {
        return this.index ? this.index.query({ min: [position[0] - radius, position[1] - halfHeight, position[2] - radius],
            max: [position[0] + radius, position[1] + halfHeight, position[2] + radius] }) : this.colliders;
    }

    unregister(entity) {
        const idx = this.colliders.findIndex(e => e.entity === entity);
        if (idx !== -1) this.colliders.splice(idx, 1);
        this.index?.remove(entity); this.entries.delete(entity); this.dynamic.delete(entity);
    }

    clear() {
        this.colliders.length = 0;
        this.index?.clear(); this.entries.clear(); this.dynamic.clear();
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

    static _halfHeight(collider) {
        if (collider.height) return collider.height * 0.5;
        return collider.radius || 0.45;
    }

    resolvePlayerCollisions(entity, terrain, ignoreLayerMask = 0) {
        if (!entity.collider || entity.collider.type === 'none') return;

        const selfLayer = entity.collider.layer;
        const selfRadius = entity.collider.radius || 0.45;
        const selfHalfH = CollisionSystem._halfHeight(entity.collider);
        const selfPos = entity.position;
        const snapToTerrain = entity.collider.snapToTerrain !== false;

        for (const { entity: other, collider } of this._nearby(selfPos, selfRadius + 2, selfHalfH + 2)) {
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
        this.refresh(entity);
    }

    isInsideTrigger(entity, layer) {
        if (!entity.collider) return false;
        const ex = entity.position[0];
        const ez = entity.position[2];
        const eRadius = entity.collider.radius || 0;

        for (const { entity, collider } of this._nearby([ex, 0, ez], eRadius)) {
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
        for (const { entity, collider } of this._nearby(position, radius)) {
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

    sphereCast(origin, direction, radius, maxDist, layerMask) {
        const directionLength = Math.hypot(direction[0], direction[1], direction[2]);
        if (directionLength <= 0.0001 || maxDist <= 0) return null;
        const castDirection = [
            direction[0] / directionLength,
            direction[1] / directionLength,
            direction[2] / directionLength,
        ];
        let closest = null;
        let closestDist = maxDist;

        for (const { entity, collider } of this.colliders) {
            if (collider.type === 'none' || collider.trigger) continue;
            if (layerMask && !(collider.layer & layerMask)) continue;

            const expandedRadius = Math.max(0, collider.radius || 0) + radius;
            const offsetX = origin[0] - entity.position[0];
            const offsetY = origin[1] - entity.position[1];
            const offsetZ = origin[2] - entity.position[2];
            const projection = offsetX * castDirection[0]
                + offsetY * castDirection[1]
                + offsetZ * castDirection[2];
            const offsetLengthSq = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
            const discriminant = projection * projection - (offsetLengthSq - expandedRadius * expandedRadius);
            if (discriminant < 0) continue;

            const startsInside = offsetLengthSq <= expandedRadius * expandedRadius;
            const distance = startsInside ? 0 : -projection - Math.sqrt(discriminant);
            if (distance < 0) continue;
            if (distance > closestDist) continue;

            closestDist = distance;
            closest = {
                entity,
                distance,
                point: [
                    origin[0] + castDirection[0] * distance,
                    origin[1] + castDirection[1] * distance,
                    origin[2] + castDirection[2] * distance,
                ],
            };
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
