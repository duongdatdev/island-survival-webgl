import { Mat4 } from '../math/Mat4.js';
import { ShaderProgram } from './ShaderProgram.js';
import { BasicShader } from '../shaders/BasicShader.js';
import { Frustum } from './Frustum.js';

/** Camera-local directional shadows; no world/save state is retained. */
export class ShadowMap {
    constructor(gl) {
        this.gl = gl;
        this.size = 0;
        this.available = true;
        this.distance = 0;
        this.center = new Float32Array(3);
        this.view = Mat4.create();
        this.projection = Mat4.create();
        this.matrix = Mat4.create();
        this.frustum = new Frustum();
        this.shader = new ShaderProgram(gl, BasicShader.vertex, `#version 300 es
            precision highp float;
            void main() { }
        `);
    }

    configure(size, distance) {
        this.distance = Math.max(0, distance);
        if (!this.available || !size || this.size === size) return;
        const gl = this.gl;
        this._release();
        this.size = Math.min(size, gl.getParameter(gl.MAX_TEXTURE_SIZE));
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.size, this.size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.texture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        this.available = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (!this.available) this._release();
    }

    begin(position, lightDirection) {
        if (!this.available || !this.texture || this.distance <= 0 || lightDirection[1] < 0.035) return false;
        const gl = this.gl, r = this.distance;
        this.center.set(position);
        const length = Math.hypot(...lightDirection) || 1;
        const eye = Array.from(position, (v, i) => v + lightDirection[i] / length * 160);
        Mat4.lookAt(this.view, eye, position, Math.abs(lightDirection[1] / length) > 0.98 ? [0, 0, 1] : [0, 1, 0]);
        const texel = 2 * r / this.size;
        this.view[12] = Math.round(this.view[12] / texel) * texel;
        this.view[13] = Math.round(this.view[13] / texel) * texel;
        Mat4.identity(this.projection);
        this.projection[0] = this.projection[5] = 1 / r;
        this.projection[10] = -2 / 340;
        this.projection[14] = -342 / 340;
        Mat4.multiply(this.matrix, this.projection, this.view);
        this.frustum.update(this.projection, this.view);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.size, this.size);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.2, 2.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        this.shader.use();
        this.shader.setUniformMatrix4fv('uViewMatrix', this.view);
        this.shader.setUniformMatrix4fv('uProjectionMatrix', this.projection);
        this.shader.setUniform1f('uFirstPersonHeadCutoff', 1000000);
        return true;
    }

    end() {
        this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    bind(shader, enabled = true) {
        const gl = this.gl;
        shader.setUniformMatrix4fv('uLightViewProjection', this.matrix);
        shader.setUniform1f('uShadowEnabled', enabled && this.available && this.texture && this.distance > 0 ? 1 : 0);
        shader.setUniform1f('uShadowTexel', this.size ? 1 / this.size : 0);
        shader.setUniform3fv('uShadowCenter', this.center);
        shader.setUniform1f('uShadowDistance', this.distance);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.texture || null);
        shader.setUniform1i('uShadowMap', 7);
        gl.activeTexture(gl.TEXTURE0);
    }

    _release() {
        if (this.texture) this.gl.deleteTexture(this.texture);
        if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
        this.texture = this.framebuffer = null;
        this.size = 0;
    }

    delete() { this._release(); this.shader.delete(); }
}
