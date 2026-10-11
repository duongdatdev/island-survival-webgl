// Search straight swimming approaches from outside the actual hull, retaining all target prop collisions.
export function findWreckApproach(node, collision, terrain, accept = () => true) {
    const ignoreInstances = new Set([node.modelId]);
    for (const height of [0.4, 0.9, 1.4, 2.1, 2.8]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        const dx = Math.sin(angle), dz = Math.cos(angle), x = node.position[0] + dx * 12, z = node.position[2] + dz * 12;
        let current = [x, Math.max(terrain.getHeight(x, z) + 0.9, node.base[1] + height), z];
        if (current[1] >= -0.8) continue;
        for (let step = 0; step < 60; step++) {
            const candidate = [current[0] - dx * 0.2, current[1], current[2] - dz * 0.2];
            collision.resolve(candidate, current, 0.28, 1.8, { vertical: true, floorHeight: (x, z) => terrain.getHeight(x, z) + 0.9 });
            current = candidate;
            if (Math.hypot(...current.map((v, i) => v - node.position[i])) < 2.35 && current[1] < -0.8
                && !collision.segmentBlocked(current, node.position, { ignoreInstances }) && accept(current)) return current;
        }
    }
    return null;
}
