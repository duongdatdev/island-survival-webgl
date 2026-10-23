/** Project a world anchor into CSS pixels, rejecting points outside the camera. */
export function projectWorldPoint(camera, position, viewport, height = 0) {
    const view = camera.viewMatrix, projection = camera.projectionMatrix;
    const x = position[0], y = position[1] + height, z = position[2];
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
    const vw = view[3] * x + view[7] * y + view[11] * z + view[15];
    const w = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15] * vw;
    if (w <= 0) return null;
    const nx = (projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12] * vw) / w;
    const ny = (projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13] * vw) / w;
    const nz = (projection[2] * vx + projection[6] * vy + projection[10] * vz + projection[14] * vw) / w;
    if (![nx, ny, nz].every(Number.isFinite) || Math.abs(nx) > 1 || Math.abs(ny) > 1 || Math.abs(nz) > 1) return null;
    return {
        x: viewport.left + (nx + 1) * viewport.width / 2,
        y: viewport.top + (1 - ny) * viewport.height / 2,
    };
}
