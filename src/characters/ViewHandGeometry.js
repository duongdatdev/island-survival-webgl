// Authored in metres: a compact fingerless survival glove, curled fingers and an
// attached thumb. Flat bevels retain the island's faceted art style without spheres.
export function createViewHandData(side = 1) {
    const positions = [], normals = [], colors = [], indices = [], texCoords = [];
    const leather = [0.23, 0.18, 0.13, 1], skin = [0.68, 0.46, 0.32, 1];
    function triangle(a, b, c, color) {
        const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...n) || 1;
        for (const point of [a, b, c]) {
            indices.push(positions.length / 3); positions.push(...point);
            normals.push(...n.map(value => value / length)); colors.push(...color); texCoords.push(0, 0);
        }
    }
    function block(center, size, color, angle = 0) {
        const [x, y, z] = size.map(value => value / 2);
        const bevel = Math.min(x, z) * 0.35;
        const ring = [[-x + bevel, -z], [x - bevel, -z], [x, -z + bevel], [x, z - bevel],
            [x - bevel, z], [-x + bevel, z], [-x, z - bevel], [-x, -z + bevel]];
        const transform = (px, py, pz) => [
            (center[0] + px * Math.cos(angle) - py * Math.sin(angle)) * side,
            center[1] + px * Math.sin(angle) + py * Math.cos(angle), center[2] + pz,
        ];
        const rings = [-y, -y + bevel, y - bevel, y].map((py, index) => ring.map(([px, pz]) =>
            transform(px * (index === 0 || index === 3 ? 0.85 : 1), py, pz * (index === 0 || index === 3 ? 0.85 : 1))));
        const face = (a, b, c) => side > 0 ? triangle(a, b, c, color) : triangle(a, c, b, color);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
            const j = (i + 1) % 8;
            face(rings[r][i], rings[r + 1][i], rings[r][j]);
            face(rings[r][j], rings[r + 1][i], rings[r + 1][j]);
        }
        for (let i = 1; i < 7; i++) {
            face(rings[0][0], rings[0][i], rings[0][i + 1]);
            face(rings[3][0], rings[3][i + 1], rings[3][i]);
        }
    }
    block([0, -0.052, 0.012], [0.078, 0.045, 0.063], leather); // snug wrist strap
    block([0, 0, 0], [0.108, 0.083, 0.072], leather); // tapered palm
    block([0, 0.004, 0.037], [0.074, 0.051, 0.012], [0.31, 0.25, 0.17, 1]); // stitched back panel
    for (let finger = 0; finger < 4; finger++) {
        const x = -0.039 + finger * 0.026;
        const height = [0.027, 0.035, 0.033, 0.025][finger];
        block([x, 0.039, -0.009], [0.023, height, 0.048], skin); // four distinct knuckles
        block([x, 0.018, -0.036], [0.022, 0.038, 0.025], skin); // curled phalanges
        block([x, -0.006, -0.031], [0.021, 0.018, 0.022], skin); // fingertips against palm
    }
    block([-0.049, -0.014, 0.003], [0.032, 0.052, 0.042], leather, -0.32);
    block([-0.047, 0.01, -0.025], [0.029, 0.048, 0.027], skin, -0.65); // thumb wraps across fingers
    return { positions: new Float32Array(positions), normals: new Float32Array(normals),
        colors: new Float32Array(colors), texCoords: new Float32Array(texCoords), indices: new Uint32Array(indices) };
}
