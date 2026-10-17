/** Count actual submissions, including submeshes, post passes and instancing. */
export class RenderStats {
    constructor(gl) {
        this.gl = gl;
        this.originals = new Map();
        this.drawCalls = this.triangles = this.shadowDrawCalls = 0;
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            if (typeof gl[name] !== 'function') continue;
            const original = gl[name];
            this.originals.set(name, original);
            gl[name] = (...args) => {
                this.drawCalls++;
                const count = name.startsWith('drawElements') ? args[1] : args[2];
                const instances = name.endsWith('Instanced') ? args[name.startsWith('drawElements') ? 4 : 3] : 1;
                if (args[0] === gl.TRIANGLES) this.triangles += count / 3 * instances;
                return original.apply(gl, args);
            };
        }
    }
    beginFrame() { this.drawCalls = this.triangles = this.shadowDrawCalls = 0; }
    delete() { for (const [name, original] of this.originals) this.gl[name] = original; this.originals.clear(); }
}
