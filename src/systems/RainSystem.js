import { ShaderProgram } from '../renderer/ShaderProgram.js';

/**
 * RainSystem — dedicated GPU rain renderer using GL_LINES streaks.
 *
 * Unlike the generic ParticleSystem (round point-sprites), rain must read as
 * thin, fast, near-vertical streaks slanted by wind — the look every
 * survival/open-world game uses. Drops live in a persistent pool cycling
 * inside a box that follows the player: when a drop falls below the box it
 * respawns at the top. The visible count scales with rain intensity, so
 * ramping weather smoothly thickens/thins the downpour with zero allocation
 * churn per frame.
 */
export class RainSystem {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number} [maxDrops=1400] Size of the drop pool
     */
    constructor(gl, maxDrops = 1400) {
        this.gl = gl;
        this.maxDrops = maxDrops;

        // Volume (centered on player) the rain fills.
        this.boxRadius = 26.0;   // half-extent on X/Z
        this.boxTop = 24.0;      // spawn ceiling above player
        this.boxBottom = -4.0;   // recycle floor below player
        this.streakLength = 1.1; // world-space length of each streak

        this.intensity = 0.0;    // 0..1, drives visible drop count
        this.fallSpeed = 32.0;   // base downward speed (units/sec)

        // Per-drop state (structure-of-arrays for cheap iteration).
        this._px = new Float32Array(maxDrops);
        this._py = new Float32Array(maxDrops);
        this._pz = new Float32Array(maxDrops);
        this._speed = new Float32Array(maxDrops); // per-drop speed jitter
        for (let i = 0; i < maxDrops; i++) {
            this._px[i] = (Math.random() - 0.5) * 2 * this.boxRadius;
            this._py[i] = this.boxBottom + Math.random() * (this.boxTop - this.boxBottom);
            this._pz[i] = (Math.random() - 0.5) * 2 * this.boxRadius;
            this._speed[i] = 0.75 + Math.random() * 0.5;
        }

        // Two vertices (bottom + top of streak) per drop.
        this._verts = new Float32Array(maxDrops * 2 * 3);

        this.shader = new ShaderProgram(gl, RainSystem.VS, RainSystem.FS);

        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        this._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this._verts.byteLength, gl.DYNAMIC_DRAW);
        const posLoc = this.shader.getAttribLocation('aPosition');
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        }
        gl.bindVertexArray(null);

        this._activeDrops = 0;
    }

    /**
     * Advance the rain simulation.
     * @param {number} deltaTime
     * @param {number[]} center [x,y,z] world point the rain box follows (player)
     * @param {number[]} wind   [x,y,z] wind vector (horizontal drift per second)
     */
    update(deltaTime, center, wind) {
        // How many drops are visible this frame. Cap ramps with intensity so
        // light rain is sparse and storms are dense.
        const target = Math.floor(this.intensity * this.maxDrops);
        this._activeDrops = target;
        if (target === 0) return;

        const cx = center[0];
        const cz = center[2];
        const r = this.boxRadius;
        const top = this.boxTop;
        const bottom = this.boxBottom;
        const span = top - bottom;

        const windX = wind[0];
        const windZ = wind[2];

        for (let i = 0; i < target; i++) {
            // Fall + horizontal wind drift.
            this._py[i] -= this.fallSpeed * this._speed[i] * deltaTime;
            this._px[i] += windX * deltaTime;
            this._pz[i] += windZ * deltaTime;

            // Recycle to the ceiling once below the box, or if it drifted out
            // of the horizontal box relative to the player.
            const localX = this._px[i] - cx;
            const localZ = this._pz[i] - cz;
            if (this._py[i] < center[1] + bottom ||
                localX < -r || localX > r || localZ < -r || localZ > r) {
                this._px[i] = cx + (Math.random() - 0.5) * 2 * r;
                this._pz[i] = cz + (Math.random() - 0.5) * 2 * r;
                this._py[i] = center[1] + bottom + span * (0.9 + Math.random() * 0.1);
                this._speed[i] = 0.75 + Math.random() * 0.5;
            }
        }
    }

    /**
     * @param {object} camera — Camera with viewMatrix, projectionMatrix
     */
    draw(camera) {
        const count = this._activeDrops;
        if (count === 0) return;
        const gl = this.gl;

        // Streak direction: mostly down, tilted a touch by wind for motion.
        // A fixed screen-ish slant keeps streaks crisp instead of dead vertical.
        const len = this.streakLength;
        const verts = this._verts;
        for (let i = 0; i < count; i++) {
            const x = this._px[i];
            const y = this._py[i];
            const z = this._pz[i];
            const b = i * 6;
            // Bottom vertex (leading end of the fall).
            verts[b] = x;
            verts[b + 1] = y;
            verts[b + 2] = z;
            // Top vertex (trailing streak). Slight XZ offset gives the slant.
            verts[b + 3] = x;
            verts[b + 4] = y + len;
            verts[b + 5] = z;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, count * 6));

        this.shader.use();
        this.shader.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        this.shader.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        this.shader.setUniform1f('uAlpha', 0.35 + this.intensity * 0.35);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.LINES, 0, count * 2);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    delete() {
        const gl = this.gl;
        if (this._vao) gl.deleteVertexArray(this._vao);
        if (this._vbo) gl.deleteBuffer(this._vbo);
        if (this.shader) this.shader.delete();
    }
}

RainSystem.VS = `#version 300 es
    precision highp float;
    in vec3 aPosition;
    uniform mat4 uViewMatrix;
    uniform mat4 uProjectionMatrix;
    void main() {
        gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
    }
`;

RainSystem.FS = `#version 300 es
    precision highp float;
    uniform float uAlpha;
    out vec4 fragColor;
    void main() {
        // Cool, slightly desaturated blue-grey streak.
        fragColor = vec4(0.62, 0.72, 0.86, uAlpha);
    }
`;
