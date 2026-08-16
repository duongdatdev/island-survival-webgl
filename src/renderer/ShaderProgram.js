export class ShaderProgram {
    constructor(gl, vsSource, fsSource) {
        this.gl = gl;
        
        const vertexShader = this._compileShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(this.program);
            gl.deleteProgram(this.program);
            throw new Error(`Unable to link shader program: ${log}`);
        }
        
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        this.uniformLocations = new Map();
        this.attribLocations = new Map();
    }

    use() {
        this.gl.useProgram(this.program);
    }

    getAttribLocation(name) {
        if (!this.attribLocations.has(name)) {
            const loc = this.gl.getAttribLocation(this.program, name);
            this.attribLocations.set(name, loc);
        }
        return this.attribLocations.get(name);
    }

    getUniformLocation(name) {
        if (!this.uniformLocations.has(name)) {
            const loc = this.gl.getUniformLocation(this.program, name);
            this.uniformLocations.set(name, loc);
        }
        return this.uniformLocations.get(name);
    }

    setUniformMatrix4fv(name, mat) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniformMatrix4fv(loc, false, mat);
        }
    }

    setUniform3fv(name, vec) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniform3fv(loc, vec);
        }
    }

    setUniform2f(name, x, y) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniform2f(loc, x, y);
        }
    }

    setUniform1f(name, val) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniform1f(loc, val);
        }
    }

    setUniform1i(name, val) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniform1i(loc, val);
        }
    }

    delete() {
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            const typeStr = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
            throw new Error(`Failed to compile ${typeStr} shader: ${log}\nSource:\n${source}`);
        }
        return shader;
    }
}
