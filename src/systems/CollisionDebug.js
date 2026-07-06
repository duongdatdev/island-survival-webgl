import { Mesh } from '../renderer/Mesh.js';
import { Mat4 } from '../math/Mat4.js';

const LAYER_COLORS = {
    1: { r: 0.2, g: 0.6, b: 1.0 },
    2: { r: 0.5, g: 0.4, b: 0.2 },
    4: { r: 1.0, g: 0.3, b: 0.2 },
    8: { r: 1.0, g: 0.8, b: 0.0 },
    16: { r: 0.8, g: 0.4, b: 0.0 },
    32: { r: 0.0, g: 0.8, b: 0.6 },
    64: { r: 0.2, g: 1.0, b: 0.2 },
    128: { r: 0.6, g: 0.6, b: 0.6 },
};

function _buildBoxEdges(halfExtents) {
    const [hx, hy, hz] = halfExtents;
    const verts = [
        [-hx, -hy, -hz], [ hx, -hy, -hz], [ hx, -hy,  hz], [-hx, -hy,  hz],
        [-hx,  hy, -hz], [ hx,  hy, -hz], [ hx,  hy,  hz], [-hx,  hy,  hz],
    ];
    const edges = [
        0,1, 1,2, 2,3, 3,0,
        4,5, 5,6, 6,7, 7,4,
        0,4, 1,5, 2,6, 3,7,
    ];
    const positions = [];
    for (const idx of edges) {
        positions.push(verts[idx][0], verts[idx][1], verts[idx][2]);
    }
    return new Float32Array(positions);
}

function _buildCircle(radius, segments) {
    const positions = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
    return new Float32Array(positions);
}

function _buildCapsule(radius, height, segments) {
    const halfH = Math.max(height * 0.5 - radius, 0);
    const ring = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        ring.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    const positions = [];

    for (let i = 0; i < ring.length; i += 2) {
        const rx = ring[i];
        const rz = ring[i + 1];
        positions.push(rx, -halfH, rz);
    }
    for (let i = 0; i < ring.length; i += 2) {
        const rx = ring[i];
        const rz = ring[i + 1];
        positions.push(rx, halfH, rz);
    }

    positions.push(-radius, -halfH, 0, -radius, halfH, 0);
    positions.push(radius, -halfH, 0, radius, halfH, 0);
    positions.push(0, -halfH, -radius, 0, halfH, -radius);
    positions.push(0, -halfH, radius, 0, halfH, radius);

    return new Float32Array(positions);
}

export class CollisionDebug {
    constructor(gl) {
        this.gl = gl;
        this._meshCache = {};
        this._enabled = false;
    }

    setEnabled(enabled) {
        this._enabled = enabled;
    }

    isEnabled() {
        return this._enabled;
    }

    _getBoxMesh(halfExtents) {
        const key = `box_${halfExtents.join('_')}`;
        if (!this._meshCache[key]) {
            const data = { positions: _buildBoxEdges(halfExtents), normals: new Float32Array(), colors: new Float32Array(), texCoords: new Float32Array() };
            this._meshCache[key] = new Mesh(this.gl, data);
        }
        return this._meshCache[key];
    }

    _getSphereMesh(radius) {
        const key = `sphere_${radius.toFixed(3)}`;
        if (!this._meshCache[key]) {
            const segs = Math.max(12, Math.floor(radius * 20));
            const positions = _buildCircle(radius, segs);
            const pos2 = [];
            for (let i = 0; i <= segs; i++) {
                const angle = (i / segs) * Math.PI * 2;
                pos2.push(0, Math.cos(angle) * radius, Math.sin(angle) * radius);
            }
            const combined = new Float32Array(positions.length + pos2.length);
            combined.set(positions);
            combined.set(pos2, positions.length);
            const data = { positions: combined, normals: new Float32Array(), colors: new Float32Array(), texCoords: new Float32Array() };
            this._meshCache[key] = new Mesh(this.gl, data);
        }
        return this._meshCache[key];
    }

    _getCapsuleMesh(radius, height) {
        const key = `capsule_${radius.toFixed(3)}_${height.toFixed(3)}`;
        if (!this._meshCache[key]) {
            const segs = Math.max(12, Math.floor(radius * 20));
            const data = { positions: _buildCapsule(radius, height, segs), normals: new Float32Array(), colors: new Float32Array(), texCoords: new Float32Array() };
            this._meshCache[key] = new Mesh(this.gl, data);
        }
        return this._meshCache[key];
    }

    draw(shader, viewMatrix, projectionMatrix, colliders) {
        if (!this._enabled) return;

        const gl = this.gl;
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        shader.use();
        shader.setUniformMatrix4fv('uViewMatrix', viewMatrix);
        shader.setUniformMatrix4fv('uProjectionMatrix', projectionMatrix);
        shader.setUniform3fv('uLightDirection', [0, 1, 0]);
        shader.setUniform3fv('uLightColor', [1, 1, 1]);
        shader.setUniform1f('uLightIntensity', 0.5);
        shader.setUniform3fv('uAmbientColor', [1, 1, 1]);
        shader.setUniform1f('uAmbientIntensity', 1.0);
        shader.setUniform3fv('uViewPosition', [0, 0, 0]);

        const tempMat = Mat4.create();

        for (const { entity, collider } of colliders) {
            if (collider.type === 'none') continue;

            const color = LAYER_COLORS[collider.layer] || { r: 1, g: 1, b: 1 };
            shader.setUniform3fv('uLightColor', [color.r, color.g, color.b]);

            Mat4.identity(tempMat);
            Mat4.translate(tempMat, tempMat, entity.position);

            let mesh = null;

            switch (collider.type) {
                case 'box':
                    if (collider.halfExtents) {
                        mesh = this._getBoxMesh(collider.halfExtents);
                    }
                    break;
                case 'sphere':
                    mesh = this._getSphereMesh(collider.radius);
                    break;
                case 'capsule':
                    mesh = this._getCapsuleMesh(collider.radius, collider.height);
                    break;
            }

            if (mesh) {
                shader.setUniformMatrix4fv('uModelMatrix', tempMat);
                mesh.draw(gl.LINES);
            }
        }

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
    }

    delete() {
        for (const key in this._meshCache) {
            this._meshCache[key].delete();
        }
        this._meshCache = {};
    }
}
