/** Code-native, low-poly silhouettes for common world pickups. */
const clampColor = color => color.map(value => Math.max(0, Math.min(1, value)));

function createBuilder(baseColor) {
    const positions = [], normals = [], colors = [], texCoords = [], indices = [];
    const triangle = (a, b, c, color = baseColor) => {
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot(...n) || 1;
        const index = positions.length / 3;
        for (const p of [a, b, c]) {
            positions.push(...p); normals.push(n[0] / length, n[1] / length, n[2] / length);
            colors.push(...clampColor(color), 1); texCoords.push(p[0] + 0.5, p[2] + 0.5);
        }
        indices.push(index, index + 1, index + 2);
    };
    return { triangle, finish: () => ({
        positions: new Float32Array(positions), normals: new Float32Array(normals),
        colors: new Float32Array(colors), texCoords: new Float32Array(texCoords), indices: new Uint16Array(indices)
    }) };
}

function ellipsoid(builder, center, radius, color, detail = 1) {
    const { triangle } = builder;
    const base = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
    let faces = [[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]];
    let vertices = base;
    for (let subdivision = 0; subdivision < detail; subdivision++) {
        const next = [], cache = new Map();
        const mid = (a, b) => {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (cache.has(key)) return cache.get(key);
            const p = vertices[a].map((v, i) => v + vertices[b][i]);
            const d = Math.hypot(...p); p.forEach((v, i) => p[i] = v / d);
            const index = vertices.length + next.length; next.push(p); cache.set(key, index); return index;
        };
        const refined = [];
        for (const [a,b,c] of faces) { const ab=mid(a,b), bc=mid(b,c), ca=mid(c,a); refined.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]); }
        vertices = [...vertices, ...next]; faces = refined;
    }
    const points = vertices.map(v => [center[0] + v[0] * radius[0], center[1] + v[1] * radius[1], center[2] + v[2] * radius[2]]);
    for (const [a,b,c] of faces) {
        const pa = points[a], pb = points[b], pc = points[c];
        const ab = pb.map((v, i) => v - pa[i]), ac = pc.map((v, i) => v - pa[i]);
        const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
        const outward = normal.reduce((sum, value, i) => sum + value * ((pa[i] + pb[i] + pc[i]) / 3 - center[i]), 0);
        if (outward >= 0) triangle(pa, pb, pc, color);
        else triangle(pa, pc, pb, color);
    }
}

function leaf(builder, start, end, width, color) {
    const dir = [end[0]-start[0], end[1]-start[1], end[2]-start[2]];
    const side = [-dir[1], dir[0], 0]; const len = Math.hypot(...side) || 1;
    for (let i = 0; i < 3; i++) side[i] /= len;
    const a = start.map((v,i) => v + side[i] * width), b = start.map((v,i) => v - side[i] * width);
    builder.triangle(a, end, b, color);
    builder.triangle(b, end, a, color);
}

export function createResourceGeometry(resourceDef) {
    const builder = createBuilder(resourceDef.color || [0.55, 0.48, 0.32]);
    const id = resourceDef.id || '';
    const color = resourceDef.color || [0.55, 0.48, 0.32];
    if (id === 'stone' || id.includes('ore') || id.includes('engine_parts')) {
        ellipsoid(builder, [0, 0, 0], [.49, .43, .48], color, 1);
        if (id.includes('ore')) {
            ellipsoid(builder, [-.1,.12,.12], [.22,.22,.2], color.map(v => Math.min(1,v*1.28)), 0);
            ellipsoid(builder, [.18,-.05,-.1], [.2,.23,.18], color.map(v => Math.min(1,v*1.18)), 0);
        }
    } else if (id === 'coconut') {
        ellipsoid(builder, [0,0,0], [.47,.47,.47], color, 1);
        for (const [x,z] of [[-.13,.15],[0,.18],[.13,.15]]) ellipsoid(builder,[x,.44,z],[.045,.035,.045],[.12,.075,.04],0);
    } else if (id === 'herb' || id.includes('fiber')) {
        for (const [x,z,hue] of [[-.12,-.08,1],[0,0,1.08],[.12,.08,.9]]) {
            const stem=[x*.35,-.48,z*.35], tip=[x*.25,.3*hue,z*.25];
            const side=[.015,0,0], left=[stem[0]-side[0],stem[1],stem[2]], right=[stem[0]+side[0],stem[1],stem[2]];
            builder.triangle(left,tip,right,[.28,.39,.14]); builder.triangle(right,tip,left,[.28,.39,.14]);
            const leafColor = id.includes('fiber') ? color.map(v => Math.min(1, v * 1.12)) : [Math.min(1,color[0]*1.15),Math.min(1,color[1]*1.18),color[2]];
            leaf(builder,tip,[tip[0]+x,tip[1]-.12,tip[2]+z],.12,leafColor);
        }
    } else if (id.includes('food') || id.includes('meal') || id.includes('smoked') || id.includes('carrot')) {
        ellipsoid(builder, [0,0,0], [.47,.32,.42], color, 1);
        ellipsoid(builder, [-.12,.22,.08], [.24,.12,.2], color.map(v => Math.min(1,v*1.12)), 0);
    } else if (id.includes('fish') || id.includes('meat')) {
        ellipsoid(builder, [0,0,0], [.48,.3,.34], color, 1);
        if (id.includes('fish')) {
            builder.triangle([.35,0,0],[.5,.28,0],[.5,-.28,0],color.map(v=>Math.min(1,v*1.1)));
        }
    } else if (id === 'rope') {
        for (let i=0;i<3;i++) { const a=i*Math.PI*2/3; ellipsoid(builder,[Math.cos(a)*.19,-.22,Math.sin(a)*.19],[.19,.12,.19],color,0); }
    } else {
        // Rounded irregular pebble/supply shape keeps uncommon authored items out of cube fallback.
        ellipsoid(builder, [0,0,0], [.43,.39,.43], color, 1);
    }
    return builder.finish();
}
