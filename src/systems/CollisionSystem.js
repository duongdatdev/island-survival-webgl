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

    resolvePlayerCollisions(player, terrain) {
        if (!player.collider || player.collider.type === 'none') return;

        const playerLayer = player.collider.layer;
        const playerRadius = player.collider.radius || 0.45;
        const playerPos = player.position;

        for (const { entity, collider } of this.colliders) {
            if (entity === player) continue;
            if (collider.type === 'none') continue;
            if (collider.trigger) continue;

            if (!CollisionMatrix.check(playerLayer, collider.layer)) continue;

            const dx = playerPos[0] - entity.position[0];
            const dz = playerPos[2] - entity.position[2];
            const minDist = playerRadius + collider.radius;

            if (minDist <= 0) continue;

            const distSq = dx * dx + dz * dz;
            if (distSq >= minDist * minDist) continue;

            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
                const nx = dx / dist;
                const nz = dz / dist;
                const overlap = minDist - dist;
                playerPos[0] += nx * overlap;
                playerPos[2] += nz * overlap;
            } else {
                playerPos[0] += 0.01;
            }

            if (terrain) {
                const h = terrain.getHeight(playerPos[0], playerPos[2]);
                playerPos[1] = h + 0.9;
            }
            player.updateModelMatrix();
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
