/** Find a dry capsule-sized space supported by terrain/floors, with real model and prop clearance. */
export function findCampaignRespawn(controller, { near } = {}) {
    const { scene, registry, collision, environmentIndex } = controller;
    const radius = scene.player.collider.radius, half = scene.player.collider.height / 2;
    const clear = (x, z) => {
        const terrain = scene.terrain.getHeight(x, z);
        if (!Number.isFinite(terrain) || terrain < 0.15) return null;
        const height = collision.groundHeight([x, terrain + half, z], terrain, 0.55, half, radius);
        for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
            const ground = scene.terrain.getHeight(x + dx, z + dz);
            if (ground < 0.15) return null;
            const support = collision.groundHeight([x + dx, height + half, z + dz], ground, 0.55, half);
            if (Math.abs(support - height) > 0.55) return null;
        }
        const position = [x, height + half, z];
        if (!collision.capsuleClear(position, radius, half * 2)) return null;
        const bounds = { min: [x - radius, height, z - radius], max: [x + radius, height + half * 2, z + radius] };
        for (const record of registry.nearby(position, 4)) {
            if (['roof', 'floor', 'foundation', 'shelter', 'doorway', 'door', 'wall'].includes(record.type)) continue;
            const occupied = registry.bounds(record);
            if (bounds.min.every((v, axis) => v < occupied.max[axis] - 0.01 && bounds.max[axis] > occupied.min[axis] + 0.01)) return null;
        }
        for (const { entity } of environmentIndex.query(bounds)) {
            if (entity.collider.type === 'none' || entity.collider.trigger || scene.removedEnvironmentObjectIds.has(entity.worldObjectId)) continue;
            const r = entity.collider.radius;
            if (Math.hypot(entity.position[0] - x, entity.position[2] - z) < r + radius) return null;
        }
        return position;
    };
    // Repair an older saved pose inside newly collidable furniture without sending the player home.
    if (near) {
        const point = clear(near[0], near[2]); if (point) return point;
        for (const distance of [0.5, 1, 1.5, 2, 3, 4]) for (let i = 0; i < 32; i++) {
            const angle = i * Math.PI / 16;
            const point = clear(near[0] + Math.cos(angle) * distance, near[2] + Math.sin(angle) * distance);
            if (point) return point;
        }
    }
    const bed = registry.structures.get(registry.respawnBedId);
    if (bed?.type === 'bed') {
        for (const distance of [1.6, 2.2, 3, 4]) for (let i = 0; i < 16; i++) {
            const angle = bed.yaw + i * Math.PI / 8;
            const point = clear(bed.position[0] + Math.cos(angle) * distance, bed.position[2] + Math.sin(angle) * distance);
            if (point) return point;
        }
    }
    const start = scene.world.spawnPosition;
    const point = clear(start[0], start[2]); if (point) return point;
    for (const distance of [2, 4, 8, 12, 20, 30]) for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16, point = clear(start[0] + Math.cos(angle) * distance, start[2] + Math.sin(angle) * distance);
        if (point) return point;
    }
    // Generated start areas are reserved and dry; this is only a recovery fallback for damaged worlds.
    return [start[0], scene.terrain.getHeight(start[0], start[2]) + half, start[2]];
}
