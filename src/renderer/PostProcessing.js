import { ShaderProgram } from './ShaderProgram.js';
import { PostShader } from '../shaders/PostShader.js';

export class PostProcessing {
    constructor(gl) {
        this.gl = gl;
        this.enabled = true;
        this.available = true;

        this.width = 0;
        this.height = 0;
        this.bloomScale = 0.5;

        this._floatExt = gl.getExtension('EXT_color_buffer_float');
        this._linearFloatExt = gl.getExtension('OES_texture_float_linear');
        this._useFloat = !!this._floatExt;

        this._sceneFbo = null;
        this._sceneColor = null;
        this._sceneDepth = null;

        this._bloomFbo = [null, null];
        this._bloomTex = [null, null];
        this._bloomWidth = 0;
        this._bloomHeight = 0;

        try {
            this._brightProgram = new ShaderProgram(gl, PostShader.vertex, PostShader.brightPass);
            this._blurProgram = new ShaderProgram(gl, PostShader.vertex, PostShader.blur);
            this._compositeProgram = new ShaderProgram(gl, PostShader.vertex, PostShader.composite);
        } catch (e) {
            console.error('PostProcessing: shader compilation failed, disabling effects.', e);
            this.available = false;
            this.enabled = false;
        }

        this._emptyVao = gl.createVertexArray();
    }

    resize(width, height) {
        if (!this.available) return;

        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        if (width === this.width && height === this.height) return;

        this.width = width;
        this.height = height;
        this._bloomWidth = Math.max(1, Math.floor(width * this.bloomScale));
        this._bloomHeight = Math.max(1, Math.floor(height * this.bloomScale));

        this._releaseTargets();
        this._createTargets();
    }

    beginScene() {
        const gl = this.gl;
        if (!this._isActive()) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            return false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneFbo);
        gl.viewport(0, 0, this.width, this.height);
        return true;
    }

    composite(options = {}) {
        if (!this._isActive()) return;

        const gl = this.gl;
        const {
            bloom = true,
            bloomIntensity = 0.75,
            bloomThreshold = 0.85,
            vignette = 0.35,
            exposure = 1.0,
            tint = [1.0, 1.0, 1.0],
            iterations = 2,
        } = options;

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this._emptyVao);

        let bloomTexture = this._bloomTex[0];

        if (bloom) {
            this._renderBloom(bloomThreshold, iterations);
            bloomTexture = this._bloomTex[0];
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFbo[0]);
            gl.viewport(0, 0, this._bloomWidth, this._bloomHeight);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        this._compositeProgram.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneColor);
        this._compositeProgram.setUniform1i('uScene', 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
        this._compositeProgram.setUniform1i('uBloom', 1);

        this._compositeProgram.setUniform1f('uBloomIntensity', bloom ? bloomIntensity : 0.0);
        this._compositeProgram.setUniform1f('uVignette', vignette);
        this._compositeProgram.setUniform1f('uExposure', exposure);
        this._compositeProgram.setUniform3fv('uTint', tint);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
    }

    delete() {
        const gl = this.gl;
        this._releaseTargets();
        if (this._brightProgram) this._brightProgram.delete();
        if (this._blurProgram) this._blurProgram.delete();
        if (this._compositeProgram) this._compositeProgram.delete();
        if (this._emptyVao) {
            gl.deleteVertexArray(this._emptyVao);
            this._emptyVao = null;
        }
    }


    _isActive() {
        return this.available && this.enabled && this._sceneFbo !== null;
    }

    _renderBloom(threshold, iterations) {
        const gl = this.gl;
        const w = this._bloomWidth;
        const h = this._bloomHeight;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFbo[0]);
        gl.viewport(0, 0, w, h);
        this._brightProgram.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneColor);
        this._brightProgram.setUniform1i('uScene', 0);
        this._brightProgram.setUniform1f('uThreshold', threshold);
        this._brightProgram.setUniform1f('uSoftKnee', 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        this._blurProgram.use();
        this._blurProgram.setUniform1i('uSource', 0);

        const passes = Math.max(1, iterations) * 2;
        for (let i = 0; i < passes; i++) {
            const src = i % 2;
            const dst = 1 - src;

            gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFbo[dst]);
            gl.viewport(0, 0, w, h);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._bloomTex[src]);

            if (i % 2 === 0) {
                this._blurProgram.setUniform2f('uDirection', 1.0 / w, 0.0);
            } else {
                this._blurProgram.setUniform2f('uDirection', 0.0, 1.0 / h);
            }

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
    }

    _createTargets() {
        const gl = this.gl;

        const colorType = this._useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
        const colorFormat = this._useFloat ? gl.RGBA16F : gl.RGBA8;
        const filter = (!this._useFloat || this._linearFloatExt) ? gl.LINEAR : gl.NEAREST;

        this._sceneColor = this._createTexture(this.width, this.height, colorFormat, colorType, filter);
        this._sceneDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this._sceneDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);

        this._sceneFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._sceneColor, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._sceneDepth);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            if (this._useFloat) {
                console.warn('PostProcessing: float render target incomplete, retrying with RGBA8.');
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                this._releaseTargets();
                this._useFloat = false;
                this._createTargets();
                return;
            }
            console.error('PostProcessing: framebuffer incomplete, disabling effects.');
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this._releaseTargets();
            this.available = false;
            this.enabled = false;
            return;
        }

        for (let i = 0; i < 2; i++) {
            this._bloomTex[i] = this._createTexture(this._bloomWidth, this._bloomHeight, colorFormat, colorType, filter);
            this._bloomFbo[i] = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFbo[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._bloomTex[i], 0);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _createTexture(width, height, internalFormat, type, filter) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    _releaseTargets() {
        const gl = this.gl;
        if (this._sceneFbo) { gl.deleteFramebuffer(this._sceneFbo); this._sceneFbo = null; }
        if (this._sceneColor) { gl.deleteTexture(this._sceneColor); this._sceneColor = null; }
        if (this._sceneDepth) { gl.deleteRenderbuffer(this._sceneDepth); this._sceneDepth = null; }

        for (let i = 0; i < 2; i++) {
            if (this._bloomFbo[i]) { gl.deleteFramebuffer(this._bloomFbo[i]); this._bloomFbo[i] = null; }
            if (this._bloomTex[i]) { gl.deleteTexture(this._bloomTex[i]); this._bloomTex[i] = null; }
        }
    }
}
