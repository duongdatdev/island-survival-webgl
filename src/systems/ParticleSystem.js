import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { ParticleShader } from '../shaders/ParticleShader.js';

/**
 * ParticleSystem — CPU-driven, GPU-rendered particle effects using GL_POINTS.
 * 
 * Usage:
 *   system.emit(worldPosition, preset)  — spawn a burst of particles
 *   system.update(deltaTime)            — advance physics
 *   system.draw(camera)                 — render all live particles
 */
export class ParticleSystem {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number} [maxParticles=512] Maximum concurrent particles
     */
    constructor(gl, maxParticles = 512) {
        this.gl = gl;
        this.maxParticles = maxParticles;

        /**
         * v1.0 — global multiplier on every preset's particle count, driven by
         * the graphics quality setting. Applied at emit time so existing call
         * sites keep passing unmodified presets.
         */
        this.density = 1.0;

        // CPU particle pool
        this.particles = [];

        // Shader
        this.shader = new ShaderProgram(gl, ParticleShader.vertex, ParticleShader.fragment);

        // GPU buffers (dynamic)
        this._positionData = new Float32Array(maxParticles * 3);
        this._colorData = new Float32Array(maxParticles * 4);
        this._sizeData = new Float32Array(maxParticles);

        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);

        // Position buffer
        this._posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._positionData.byteLength, gl.DYNAMIC_DRAW);
        const posLoc = this.shader.getAttribLocation('aPosition');
        if (posLoc >= 0) {
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        }

        // Color buffer
        this._colBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._colorData.byteLength, gl.DYNAMIC_DRAW);
        const colLoc = this.shader.getAttribLocation('aColor');
        if (colLoc >= 0) {
            gl.enableVertexAttribArray(colLoc);
            gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);
        }

        // Size buffer
        this._sizeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._sizeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._sizeData.byteLength, gl.DYNAMIC_DRAW);
        const sizeLoc = this.shader.getAttribLocation('aSize');
        if (sizeLoc >= 0) {
            gl.enableVertexAttribArray(sizeLoc);
            gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);
        }

        gl.bindVertexArray(null);
    }

    // =============================================================
    //  PRESETS
    // =============================================================

    static PRESET = {
        /** Bright sparkles when picking up a resource */
        PICKUP: {
            count: 10,
            color: [0.2, 0.9, 0.6],
            colorVariance: 0.15,
            size: 8,
            sizeVariance: 4,
            speed: 3.0,
            speedVariance: 1.5,
            lifetime: 0.6,
            lifetimeVariance: 0.3,
            gravity: -2.0,
            spread: 1.0,
            yBias: 2.0,
        },
        /** Dust puffs when walking */
        DUST: {
            count: 3,
            color: [0.65, 0.55, 0.40],
            colorVariance: 0.05,
            size: 5,
            sizeVariance: 2,
            speed: 0.8,
            speedVariance: 0.3,
            lifetime: 0.5,
            lifetimeVariance: 0.2,
            gravity: 0.5,
            spread: 0.4,
            yBias: 0.5,
        },
        /** Sparks when crafting */
        CRAFT: {
            count: 14,
            color: [1.0, 0.7, 0.1],
            colorVariance: 0.15,
            size: 6,
            sizeVariance: 3,
            speed: 4.0,
            speedVariance: 2.0,
            lifetime: 0.5,
            lifetimeVariance: 0.2,
            gravity: -5.0,
            spread: 1.2,
            yBias: 3.0,
        },
        /** Water splash */
        SPLASH: {
            count: 8,
            color: [0.4, 0.75, 0.95],
            colorVariance: 0.1,
            size: 5,
            sizeVariance: 2,
            speed: 2.5,
            speedVariance: 1.0,
            lifetime: 0.6,
            lifetimeVariance: 0.2,
            gravity: -6.0,
            spread: 0.8,
            yBias: 3.5,
        },
        /** Raft build effect */
        BUILD: {
            count: 12,
            color: [0.55, 0.35, 0.18],
            colorVariance: 0.1,
            size: 5,
            sizeVariance: 2,
            speed: 2.0,
            speedVariance: 1.0,
            lifetime: 0.7,
            lifetimeVariance: 0.3,
            gravity: -3.0,
            spread: 0.6,
            yBias: 1.5,
        },
        /** Rain drops (v0.4) */
        RAIN: {
            count: 1,
            color: [0.6, 0.75, 0.9],
            colorVariance: 0.05,
            size: 3,
            sizeVariance: 1,
            speed: 15.0,
            speedVariance: 5.0,
            lifetime: 0.6,
            lifetimeVariance: 0.2,
            gravity: -15.0,
            spread: 0.05,
            yBias: 10.0,
        },
        /** Lightning flash particles (v0.4) */
        LIGHTNING: {
            count: 5,
            color: [1.0, 1.0, 0.95],
            colorVariance: 0.05,
            size: 12,
            sizeVariance: 6,
            speed: 0.5,
            speedVariance: 0.3,
            lifetime: 0.3,
            lifetimeVariance: 0.1,
            gravity: 0.0,
            spread: 0.8,
            yBias: 1.0,
        },
    };

    /**
     * Emit a burst of particles at a world position
     * @param {number[]} position [x, y, z]
     * @param {object} preset — one of ParticleSystem.PRESET.*
     */
    emit(position, preset) {
        const p = preset;
        // Never round a burst away entirely — one particle still reads as feedback.
        const count = Math.max(1, Math.round(p.count * this.density));

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) break;

            const angle = Math.random() * Math.PI * 2;
            const elevAngle = (Math.random() - 0.3) * Math.PI * 0.5;
            const spd = p.speed + (Math.random() - 0.5) * 2 * p.speedVariance;

            const vx = Math.cos(angle) * Math.cos(elevAngle) * spd * p.spread;
            const vy = Math.sin(elevAngle) * spd * Math.max(0.3, Math.random()) + p.yBias;
            const vz = Math.sin(angle) * Math.cos(elevAngle) * spd * p.spread;

            const lt = p.lifetime + (Math.random() - 0.5) * 2 * p.lifetimeVariance;

            const cr = p.color[0] + (Math.random() - 0.5) * 2 * p.colorVariance;
            const cg = p.color[1] + (Math.random() - 0.5) * 2 * p.colorVariance;
            const cb = p.color[2] + (Math.random() - 0.5) * 2 * p.colorVariance;

            this.particles.push({
                x: position[0] + (Math.random() - 0.5) * 0.3,
                y: position[1] + (Math.random() - 0.5) * 0.3,
                z: position[2] + (Math.random() - 0.5) * 0.3,
                vx, vy, vz,
                r: Math.min(1, Math.max(0, cr)),
                g: Math.min(1, Math.max(0, cg)),
                b: Math.min(1, Math.max(0, cb)),
                size: p.size + (Math.random() - 0.5) * 2 * p.sizeVariance,
                life: lt,
                maxLife: lt,
                gravity: p.gravity,
            });
        }
    }

    /**
     * Spawn a single particle with an explicit velocity (no burst spread).
     * Use this for directional effects like rain, where drops must fall
     * straight down instead of exploding outward like emit().
     *
     * @param {number[]} position [x, y, z] spawn point
     * @param {number[]} velocity [vx, vy, vz] initial velocity (units/sec)
     * @param {object} opts { color:[r,g,b], size, lifetime, gravity }
     */
    emitDirected(position, velocity, opts) {
        if (this.particles.length >= this.maxParticles) return;

        const lt = opts.lifetime;
        this.particles.push({
            x: position[0],
            y: position[1],
            z: position[2],
            vx: velocity[0],
            vy: velocity[1],
            vz: velocity[2],
            r: opts.color[0],
            g: opts.color[1],
            b: opts.color[2],
            size: opts.size,
            life: lt,
            maxLife: lt,
            gravity: opts.gravity ?? 0,
        });
    }

    /**
     * Advance particle physics
     * @param {number} deltaTime
     */
    update(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= deltaTime;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Euler integration
            p.vy += p.gravity * deltaTime;
            p.x += p.vx * deltaTime;
            p.y += p.vy * deltaTime;
            p.z += p.vz * deltaTime;

            // Damp velocity
            p.vx *= 0.98;
            p.vz *= 0.98;
        }
    }

    /**
     * Render all live particles
     * @param {object} camera — Camera instance with viewMatrix, projectionMatrix
     */
    draw(camera) {
        const count = this.particles.length;
        if (count === 0) return;

        const gl = this.gl;

        // Fill CPU buffers
        for (let i = 0; i < count; i++) {
            const p = this.particles[i];
            const lifeRatio = p.life / p.maxLife;

            this._positionData[i * 3] = p.x;
            this._positionData[i * 3 + 1] = p.y;
            this._positionData[i * 3 + 2] = p.z;

            this._colorData[i * 4] = p.r;
            this._colorData[i * 4 + 1] = p.g;
            this._colorData[i * 4 + 2] = p.b;
            this._colorData[i * 4 + 3] = lifeRatio; // Fade out

            this._sizeData[i] = p.size * Math.max(0.2, lifeRatio);
        }

        // Upload to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._positionData.subarray(0, count * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._colorData.subarray(0, count * 4));

        gl.bindBuffer(gl.ARRAY_BUFFER, this._sizeBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sizeData.subarray(0, count));

        // Draw
        this.shader.use();
        this.shader.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        this.shader.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        this.shader.setUniform1f('uViewportHeight', gl.canvas.height);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    /**
     * Free GPU resources
     */
    delete() {
        const gl = this.gl;
        if (this._vao) gl.deleteVertexArray(this._vao);
        if (this._posBuf) gl.deleteBuffer(this._posBuf);
        if (this._colBuf) gl.deleteBuffer(this._colBuf);
        if (this._sizeBuf) gl.deleteBuffer(this._sizeBuf);
        if (this.shader) this.shader.delete();
    }
}
