import { ShaderProgram } from './ShaderProgram.js';
import { ColorSpaceGLSL } from '../shaders/ColorSpace.js';

/** One bounded draw of soft ground contacts, including low quality/night scenes. */
export class ContactShadows {
    constructor(gl) {
        this.gl = gl;
        this.data = new Float32Array(64 * 6 * 5);
        this.vao = gl.createVertexArray();
        this.buffer = gl.createBuffer();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
        gl.bindVertexArray(null);
        this.shader = new ShaderProgram(gl, `#version 300 es
            layout(location=0) in vec3 aPosition;
            layout(location=1) in vec2 aUV;
            uniform mat4 uViewMatrix; uniform mat4 uProjectionMatrix;
            out vec2 vUV;
            void main(){vUV=aUV;gl_Position=uProjectionMatrix*uViewMatrix*vec4(aPosition,1.0);}
        `, `#version 300 es
            precision highp float; in vec2 vUV; out vec4 fragColor;
            ${ColorSpaceGLSL}
            void main(){float r=length(vUV);if(r>1.0)discard;fragColor=vec4(sceneOutput(vec3(0.015,0.025,0.025)),(1.0-smoothstep(0.05,1.0,r))*0.30);}
        `);
    }

    draw(camera, terrain, contacts, outputLinear = false) {
        const gl = this.gl;
        let offset = 0;
        const corners = [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
        for (const { position, radius = 0.5 } of contacts.slice(0, 64)) {
            const h = terrain.getHeight(position[0], position[2]);
            if (h < -0.04 || position[1] - h > 8) continue;
            for (const [u,v] of corners) {
                const x = position[0] + u * radius, z = position[2] + v * radius;
                this.data.set([x, terrain.getHeight(x,z)+0.025, z, u,v], offset); offset += 5;
            }
        }
        if (!offset) return;
        this.shader.use();
        this.shader.setUniform1i('uOutputLinear', outputLinear ? 1 : 0);
        this.shader.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        this.shader.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, offset));
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE); gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, offset / 5);
        gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }

    delete() { this.gl.deleteBuffer(this.buffer); this.gl.deleteVertexArray(this.vao); this.shader.delete(); }
}
