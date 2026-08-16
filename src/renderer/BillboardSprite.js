import { Mesh } from './Mesh.js';

export class BillboardSprite {
    constructor(gl, color = [1.0, 0.9, 0.6], size = 1.0, glowColor = null) {
        this.gl = gl;
        this.color = color;
        this.size = size;
        this.glowColor = glowColor || color.slice();

        this.position = [0, 30, 0];
        this.visible = true;

        this._buildMesh(gl);
        this._buildGlowMesh(gl);
    }

    _buildMesh(gl) {
        const half = this.size * 0.5;
        const positions = new Float32Array([
            -half, -half, 0,
             half, -half, 0,
             half,  half, 0,
            -half,  half, 0,
        ]);
        const colors = new Float32Array([
            ...this.color, 1.0,
            ...this.color, 1.0,
            ...this.color, 1.0,
            ...this.color, 1.0,
        ]);
        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1,
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.mesh = new Mesh(gl, {
            positions,
            normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
            colors,
            texCoords,
            indices,
        });
    }

    _buildGlowMesh(gl) {
        const half = this.size * 1.8;
        const positions = new Float32Array([
            -half, -half, 0,
             half, -half, 0,
             half,  half, 0,
            -half,  half, 0,
        ]);
        const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
        const r = this.glowColor[0], g = this.glowColor[1], b = this.glowColor[2];
        const colors = new Float32Array([
            r, g, b, 0.3,
            r, g, b, 0.3,
            r, g, b, 0.3,
            r, g, b, 0.3,
        ]);
        const texCoords = new Float32Array([
            0, 0, 1, 0, 1, 1, 0, 1,
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.glowMesh = new Mesh(gl, {
            positions,
            normals,
            colors,
            texCoords,
            indices,
        });
    }

    setColor(r, g, b, glowR, glowG, glowB) {
        this.color = [r, g, b];
        this.glowColor = [glowR || r, glowG || g, glowB || b];
        this._rebuildColors();
    }

    _rebuildColors() {
        const gl = this.gl;
        const [r, g, b] = this.color;
        const [gr, gg, gb] = this.glowColor;

        this._updateMeshColors(this.mesh, r, g, b, 1.0);
        this._updateMeshColors(this.glowMesh, gr, gg, gb, 0.25);
    }

    _updateMeshColors(mesh, r, g, b, a) {
        const gl = this.gl;
        const colors = new Float32Array([
            r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a,
        ]);
        mesh.updateColors(colors);
    }

    draw(shader, viewMatrix, projectionMatrix, cameraPosition, tempMatrix) {
        if (!this.visible) return;

        const gl = this.gl;

        const up = [0, 1, 0];
        const forward = [
            cameraPosition[0] - this.position[0],
            cameraPosition[1] - this.position[1],
            cameraPosition[2] - this.position[2],
        ];
        const len = Math.sqrt(forward[0] * forward[0] + forward[1] * forward[1] + forward[2] * forward[2]);
        if (len < 0.001) return;
        forward[0] /= len; forward[1] /= len; forward[2] /= len;

        const right = [
            up[1] * forward[2] - up[2] * forward[1],
            up[2] * forward[0] - up[0] * forward[2],
            up[0] * forward[1] - up[1] * forward[0],
        ];
        const rlen = Math.sqrt(right[0] * right[0] + right[1] * right[1] + right[2] * right[2]);
        if (rlen < 0.001) return;
        right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

        const newUp = [
            forward[1] * right[2] - forward[2] * right[1],
            forward[2] * right[0] - forward[0] * right[2],
            forward[0] * right[1] - forward[1] * right[0],
        ];

        const modelMatrix = [
            right[0],     right[1],     right[2],     0,
            newUp[0],     newUp[1],     newUp[2],     0,
            forward[0],   forward[1],   forward[2],   0,
            this.position[0], this.position[1], this.position[2], 1,
        ];

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);

        shader.setUniformMatrix4fv('uViewMatrix', viewMatrix);
        shader.setUniformMatrix4fv('uProjectionMatrix', projectionMatrix);

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        shader.setUniformMatrix4fv('uModelMatrix', modelMatrix);
        this.glowMesh.draw();

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        shader.setUniformMatrix4fv('uModelMatrix', modelMatrix);
        this.mesh.draw();

        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    delete() {
        if (this.mesh) this.mesh.delete();
        if (this.glowMesh) this.glowMesh.delete();
        this.mesh = null;
        this.glowMesh = null;
    }
}
