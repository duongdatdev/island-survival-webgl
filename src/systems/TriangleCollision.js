import { SpatialGrid } from './SpatialGrid.js';

const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const addScaled = (a, b, scale) => a.map((v, i) => v + b[i] * scale);
const clamp = value => Math.max(0, Math.min(1, value));

export function closestSegmentPair(p0, p1, q0, q1) {
    const u = subtract(p1, p0), v = subtract(q1, q0), w = subtract(p0, q0);
    const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
    let s = 0, t = 0;
    if (a < 1e-12) t = c < 1e-12 ? 0 : clamp(e / c);
    else if (c < 1e-12) s = clamp(-d / a);
    else {
        const denominator = a * c - b * b;
        s = denominator > 1e-12 * a * c ? clamp((b * e - c * d) / denominator) : 0;
        t = (e + b * s) / c;
        if (t < 0) { t = 0; s = clamp(-d / a); }
        else if (t > 1) { t = 1; s = clamp((b - d) / a); }
    }
    return { segment: addScaled(p0, u, s), triangle: addScaled(q0, v, t) };
}

/** Closest pair for the entire capsule axis, including triangle interiors and edges. */
export function closestSegmentTriangle(p0, p1, triangle) {
    const { a, b, c, normal } = triangle, direction = subtract(p1, p0), denominator = dot(direction, normal);
    if (Math.abs(denominator) > 1e-12) {
        const t = dot(subtract(a, p0), normal) / denominator;
        if (t >= 0 && t <= 1) {
            const point = addScaled(p0, direction, t), closest = closestTrianglePoint(point, a, b, c);
            if (Math.hypot(...subtract(point, closest)) < 1e-8) return { segment: point, triangle: closest, distance: 0 };
        }
    }
    let best = null;
    for (const pair of [{ segment: p0, triangle: closestTrianglePoint(p0, a, b, c) },
        { segment: p1, triangle: closestTrianglePoint(p1, a, b, c) },
        closestSegmentPair(p0, p1, a, b), closestSegmentPair(p0, p1, b, c), closestSegmentPair(p0, p1, c, a)]) {
        const distance = Math.hypot(...subtract(pair.segment, pair.triangle));
        if (!best || distance < best.distance) best = { ...pair, distance };
    }
    return best;
}

export function closestTrianglePoint(p, a, b, c) {
    const ab = subtract(b, a), ac = subtract(c, a), ap = subtract(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = subtract(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return addScaled(a, ab, d1 / (d1 - d3));
    const cp = subtract(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return addScaled(a, ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return addScaled(b, subtract(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    const inverse = 1 / (va + vb + vc);
    return addScaled(addScaled(a, ab, vb * inverse), ac, vc * inverse);
}

/** Static model triangles in a spatial index, including real door openings and cave interiors. */
export class TriangleCollision {
    constructor() { this.index = new SpatialGrid(4); this.instances = new Map(); }
    remove(id) {
        for (const key of this.instances.get(id) || []) this.index.remove(key);
        this.instances.delete(id);
    }
    add(id, geometry, position, yaw = 0, scale = [1, 1, 1]) {
        this.remove(id);
        if (!geometry) return;
        const cos = Math.cos(yaw), sin = Math.sin(yaw), keys = [];
        for (let offset = 0; offset < geometry.length; offset += 9) {
            const points = [];
            for (let vertex = 0; vertex < 3; vertex++) {
                const i = offset + vertex * 3, x = geometry[i] * scale[0], z = geometry[i + 2] * scale[2];
                points.push([position[0] + x * cos + z * sin, position[1] + geometry[i + 1] * scale[1], position[2] - x * sin + z * cos]);
            }
            const [a, b, c] = points, ab = subtract(b, a), ac = subtract(c, a);
            const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
            const length = Math.hypot(...normal);
            if (length < 0.00001) continue;
            const bounds = { min: a.map((_, axis) => Math.min(...points.map(p => p[axis])) - 0.001),
                max: a.map((_, axis) => Math.max(...points.map(p => p[axis])) + 0.001) };
            const key = `${id}:${offset}`;
            this.index.insert(key, bounds, { a, b, c, bounds, instanceId: id, normal: normal.map(v => v / length) });
            keys.push(key);
        }
        this.instances.set(id, keys);
    }
    groundHeight(position, initialHeight, stepHeight = 0.55, halfHeight = 0.9, footprint = 0) {
        let height = initialHeight;
        for (const triangle of this.index.queryRadius(Array.from(position), 3)) {
            if (triangle.normal[1] < 0.65) continue;
            const { a, b, c } = triangle;
            const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
            if (Math.abs(denominator) < 0.00001) continue;
            const u = ((b[2] - c[2]) * (position[0] - c[0]) + (c[0] - b[0]) * (position[2] - c[2])) / denominator;
            const v = ((c[2] - a[2]) * (position[0] - c[0]) + (a[0] - c[0]) * (position[2] - c[2])) / denominator;
            const planeHeight = u * a[1] + v * b[1] + (1 - u - v) * c[1];
            let y = planeHeight;
            if (footprint) {
                // Use the entire circular footprint: fixed cross samples miss plank seams at floor edges.
                const nearest = closestTrianglePoint([position[0], planeHeight, position[2]], a, b, c);
                if (Math.hypot(nearest[0] - position[0], nearest[2] - position[2]) > footprint + 0.001) continue;
                y = nearest[1];
            } else if (u < -0.001 || v < -0.001 || u + v > 1.001) continue;
            if (y >= height && y <= position[1] - halfHeight + stepHeight) height = y;
        }
        return height;
    }
    stepUp(position, previous, terrain, radius = 0.28, height = 1.8, stepHeight = 0.55) {
        const ground = terrain.getHeight(position[0], position[2]), half = height / 2;
        let support = this.groundHeight(position, ground, stepHeight, half, radius);
        const dx = position[0] - previous[0], dz = position[2] - previous[2], motion = Math.hypot(dx, dz);
        if (motion > 0.00001) {
            // Probe beyond thin doorway thresholds before the capsule reaches their vertical lip.
            const reach = radius + 0.2;
            const probe = [position[0] + dx / motion * reach, previous[1], position[2] + dz / motion * reach];
            support = Math.max(support, this.groundHeight(probe, ground, stepHeight, half, radius));
        }
        const raised = Array.from(previous);
        if (support > ground && support <= previous[1] - half + stepHeight + 0.001) {
            const candidate = [position[0], Math.max(position[1], support + half), position[2]];
            const start = [previous[0], Math.max(previous[1], support + half), previous[2]];
            if (this.capsuleClear(candidate, radius, height) && this.capsuleClear(start, radius, height)) {
                position[1] = candidate[1]; raised[1] = start[1];
            }
        }
        return raised;
    }

    capsuleClear(position, radius = 0.28, height = 1.8) {
        const extent = Math.max(0, height / 2 - radius);
        const triangles = this.index.query({ min: [position[0] - radius, position[1] - height / 2, position[2] - radius],
            max: [position[0] + radius, position[1] + height / 2, position[2] + radius] });
        return !triangles.some(triangle => closestSegmentTriangle([position[0], position[1] - extent, position[2]],
            [position[0], position[1] + extent, position[2]], triangle).distance < radius - 1e-6);
    }

    resolve(position, previous, radius = 0.28, height = 1.8, options = {}) {
        if (options.vertical || options.grounded) return this.resolveVolume(position, previous, radius, height, options);
        const destination = Array.from(position);
        const steps = Math.max(1, Math.ceil(Math.hypot(destination[0] - previous[0], destination[2] - previous[2]) / (radius * 0.5)));
        const motion = destination.map((value, axis) => (value - previous[axis]) / steps);
        const point = Array.from(previous);
        for (let step = 0; step < steps; step++) {
            point[0] += motion[0]; point[1] += motion[1]; point[2] += motion[2];
            for (let iteration = 0; iteration < 3; iteration++) {
                for (const triangle of this.index.queryRadius(point, height / 2 + radius)) {
                    if (Math.abs(triangle.normal[1]) > 0.65) continue;
                    for (const offset of [-height / 2 + radius, 0, height / 2 - radius]) {
                        const sample = [point[0], point[1] + offset, point[2]];
                        const closest = closestTrianglePoint(sample, triangle.a, triangle.b, triangle.c);
                        const delta = subtract(sample, closest), length = Math.hypot(...delta);
                        if (length >= radius) continue;
                        let nx = delta[0], nz = delta[2], horizontal = Math.hypot(nx, nz);
                        if (horizontal < 0.00001) {
                            const side = dot(subtract(previous, triangle.a), triangle.normal) < 0 ? -1 : 1;
                            nx = triangle.normal[0] * side; nz = triangle.normal[2] * side; horizontal = Math.hypot(nx, nz);
                        }
                        if (horizontal < 0.00001) continue;
                        point[0] += nx / horizontal * (radius - length + 0.001);
                        point[2] += nz / horizontal * (radius - length + 0.001);
                    }
                }
            }
        }
        position[0] = point[0]; position[2] = point[2];
        return position;
    }
    resolveVolume(position, previous, radius = 0.28, height = 1.8, options = {}) {
        const destination = Array.from(position), distance = Math.hypot(...destination.map((v, axis) => v - previous[axis]));
        const steps = Math.max(1, Math.ceil(distance / (radius * 0.5)));
        const motion = destination.map((v, axis) => (v - previous[axis]) / steps), point = Array.from(previous);
        const extent = Math.max(0, height / 2 - radius);
        const candidates = point => {
            const reach = radius + 0.001;
            return this.index.query({ min: [point[0] - reach, point[1] - extent - reach, point[2] - reach],
                max: [point[0] + reach, point[1] + extent + reach, point[2] + reach] });
        };
        const contactAt = (point, triangle) => closestSegmentTriangle([point[0], point[1] - extent, point[2]], [point[0], point[1] + extent, point[2]], triangle);
        for (let step = 0; step < steps; step++) {
            const from = [...point];
            for (let axis = 0; axis < 3; axis++) point[axis] += motion[axis];
            for (let iteration = 0; iteration < 4; iteration++) {
                let corrected = false;
                const floor = options.floorHeight?.(point[0], point[2]);
                if (floor !== undefined && point[1] < floor) { point[1] = floor; corrected = true; }
                for (const triangle of candidates(point)) {
                    const contact = contactAt(point, triangle);
                    if (contact.distance >= radius - 1e-6) continue;
                    let direction = subtract(contact.segment, contact.triangle), length = contact.distance;
                    if (length < 1e-8) {
                        const side = dot(subtract(from, triangle.a), triangle.normal) < 0 ? -1 : 1;
                        direction = triangle.normal.map(v => v * side); length = 1;
                    }
                    if (options.grounded) {
                        direction[1] = 0; length = Math.hypot(direction[0], direction[2]);
                        // Standing actors cannot squeeze vertically between terrain and furniture/ceilings.
                        if (length < 1e-8) { for (let axis = 0; axis < 3; axis++) point[axis] = from[axis]; break; }
                    }
                    const push = (radius - contact.distance + 0.001) / length;
                    for (let axis = 0; axis < 3; axis++) point[axis] += direction[axis] * push;
                    corrected = true;
                }
                if (!corrected) break;
            }
            // Reject a space too short for the capsule instead of pushing it through the seabed.
            const floor = options.floorHeight?.(point[0], point[2]);
            if (floor !== undefined && point[1] < floor - 1e-6 || candidates(point).some(triangle => contactAt(point, triangle).distance < radius - 1e-6)) {
                for (let axis = 0; axis < 3; axis++) point[axis] = from[axis];
            }
        }
        for (let axis = 0; axis < 3; axis++) position[axis] = point[axis];
        return position;
    }
    segmentHit(start, end, { ignoreInstances } = {}) {
        const direction = subtract(end, start);
        let nearest = null;
        const bounds = { min: start.map((v, i) => Math.min(v, end[i])), max: start.map((v, i) => Math.max(v, end[i])) };
        for (const { a, b, c, instanceId } of this.index.query(bounds)) {
            if (ignoreInstances?.has(instanceId)) continue;
            const edge1 = subtract(b, a), edge2 = subtract(c, a);
            const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const p = cross(direction, edge2), determinant = dot(edge1, p);
            if (Math.abs(determinant) < 0.000001) continue;
            const inverse = 1 / determinant, t = subtract(start, a), u = dot(t, p) * inverse;
            if (u < 0 || u > 1) continue;
            const q = cross(t, edge1), v = dot(direction, q) * inverse;
            if (v < 0 || u + v > 1) continue;
            const distance = dot(edge2, q) * inverse;
            if (distance > 0.000001 && distance <= 1 && (nearest === null || distance < nearest)) nearest = distance;
        }
        return nearest === null ? null : { entity: null, point: addScaled(start, direction, nearest), distance: Math.hypot(...direction) * nearest };
    }
    segmentBlocked(start, end, options) { return this.segmentHit(start, end, options) !== null; }
    clear() { this.index.clear(); this.instances.clear(); }
}
