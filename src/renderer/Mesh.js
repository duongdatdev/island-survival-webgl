/**
 * WebGL 2 Mesh Wrapper using Vertex Array Objects (VAO)
 */
export class Mesh {
    constructor(gl, data) {
        this.gl = gl;
        this.vertexCount = 0;
        this.indexCount = 0;
        this.hasIndices = false;

        // Local-space bounds are retained so tall meshes (especially trees)
        // can be culled using their visual extent instead of a trunk collider.
        this.bounds = this._computeBounds(data.positions);

        // Create VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.buffers = [];

        // 1. Position Buffer (Location = 0)
        if (data.positions) {
            this.positionsBuffer = this._createBuffer(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(0);
            this.vertexCount = data.positions.length / 3;
        }

        // 2. Normal Buffer (Location = 1)
        if (data.normals) {
            this.normalsBuffer = this._createBuffer(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(1);
        } else if (data.positions) {
            // Disable if not present to avoid reading garbage values
            gl.disableVertexAttribArray(1);
        }

        // 3. Color Buffer (Location = 2)
        if (data.colors) {
            this.colorsBuffer = this._createBuffer(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(2);
        } else if (data.positions) {
            // Provide a default color (white) if no color buffer exists
            gl.disableVertexAttribArray(2);
            gl.vertexAttrib4f(2, 1.0, 1.0, 1.0, 1.0);
        }

        // 4. TexCoord Buffer (Location = 3)
        if (data.texCoords) {
            this.texCoordsBuffer = this._createBuffer(gl.ARRAY_BUFFER, data.texCoords, gl.STATIC_DRAW);
            gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(3);
        } else if (data.positions) {
            gl.disableVertexAttribArray(3);
            gl.vertexAttrib2f(3, 0.0, 0.0);
        }

        // 5. Index Buffer
        if (data.indices) {
            this.indexBuffer = this._createBuffer(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
            this.indexCount = data.indices.length;
            this.hasIndices = true;
            this.indexType = data.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        }

        // Unbind VAO and buffers
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        if (this.hasIndices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
    }

    _createBuffer(target, data, usage) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage);
        this.buffers.push(buffer);
        return buffer;
    }

    _computeBounds(positions) {
        if (!positions || positions.length < 3) {
            return {
                center: [0, 0, 0], radius: 0,
                min: [0, 0, 0], max: [0, 0, 0],
            };
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const center = [
            (minX + maxX) * 0.5,
            (minY + maxY) * 0.5,
            (minZ + maxZ) * 0.5,
        ];
        let radiusSq = 0;
        for (let i = 0; i < positions.length; i += 3) {
            const dx = positions[i] - center[0];
            const dy = positions[i + 1] - center[1];
            const dz = positions[i + 2] - center[2];
            radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
        }

        return {
            center,
            radius: Math.sqrt(radiusSq),
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
        };
    }

    draw(drawMode = this.gl.TRIANGLES) {
        const gl = this.gl;
        gl.bindVertexArray(this.vao);

        if (this.hasIndices) {
            gl.drawElements(drawMode, this.indexCount, this.indexType, 0);
        } else {
            gl.drawArrays(drawMode, 0, this.vertexCount);
        }

        gl.bindVertexArray(null);
    }

    updateColors(colors) {
        const gl = this.gl;
        if (this.colorsBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorsBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
    }

    delete() {
        const gl = this.gl;
        for (const buffer of this.buffers) {
            gl.deleteBuffer(buffer);
        }
        if (this.vao) {
            gl.deleteVertexArray(this.vao);
            this.vao = null;
        }
        this.buffers = [];
    }
}
