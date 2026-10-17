import { ShaderProgram } from './ShaderProgram.js';
import { Mat4 } from '../math/Mat4.js';
import { createBasicShader } from '../shaders/BasicShader.js';

const IDENTITY = Mat4.create();
const INSTANCE_FLOATS = 16;
const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

const vertexDeclarations = `
    layout(location = 4) in vec4 aInstanceMatrix0;
    layout(location = 5) in vec4 aInstanceMatrix1;
    layout(location = 6) in vec4 aInstanceMatrix2;
    layout(location = 7) in vec4 aInstanceMatrix3;
`;

const vertexTransform = `
    mat4 instanceMatrix = mat4(aInstanceMatrix0, aInstanceMatrix1, aInstanceMatrix2, aInstanceMatrix3);
    vec4 instancePosition = instanceMatrix * vec4(localPosition, 1.0);
    localPosition = instancePosition.xyz;
    localNormal = transpose(inverse(mat3(instanceMatrix))) * localNormal;
`;
const depthFragment = `#version 300 es
    precision highp float;
    void main() { }
`;

/**
 * Batches static environment entities that share the same source mesh. The
 * source mesh's GPU buffers are referenced by per-batch VAOs, never copied.
 */
export class EnvironmentBatch {
    constructor(gl, entities = []) {
        this.gl = gl;
        this.entities = entities;
        this.groups = new Map();
        this.disposed = false;
        this.lastDrawnInstances = 0;
        this.program = null;
        this._buildGroups();
    }

    _buildGroups() {
        const gl = this.gl;
        for (const entity of this.entities) {
            const mesh = entity?.mesh;
            if (!mesh || !mesh.positionsBuffer || !entity.modelMatrix) continue;
            let group = this.groups.get(mesh);
            if (!group) {
                group = { mesh, entities: [], vao: null, instanceBuffer: null, instanceCount: 0 };
                this.groups.set(mesh, group);
            }
            group.entities.push(entity);
        }

        for (const group of this.groups.values()) this._createBatchGeometry(group);
        const shader = createBasicShader({ vertexDeclarations, vertexTransform });
        this.program = new ShaderProgram(gl, shader.vertex, shader.fragment);
        this.depthProgram = new ShaderProgram(gl, shader.vertex, depthFragment);
    }

    _createBatchGeometry(group) {
        const gl = this.gl;
        const mesh = group.mesh;
        const vao = gl.createVertexArray();
        const instanceBuffer = gl.createBuffer();
        gl.bindVertexArray(vao);

        this._bindMeshAttribute(mesh.positionsBuffer, 0, 3);
        if (mesh.normalsBuffer) this._bindMeshAttribute(mesh.normalsBuffer, 1, 3);
        else {
            gl.disableVertexAttribArray(1);
            gl.vertexAttrib3f(1, 0, 1, 0);
        }
        if (mesh.colorsBuffer) this._bindMeshAttribute(mesh.colorsBuffer, 2, 4);
        else {
            gl.disableVertexAttribArray(2);
            gl.vertexAttrib4f(2, 1, 1, 1, 1);
        }
        if (mesh.texCoordsBuffer) this._bindMeshAttribute(mesh.texCoordsBuffer, 3, 2);
        else {
            gl.disableVertexAttribArray(3);
            gl.vertexAttrib2f(3, 0, 0);
        }
        if (mesh.hasIndices && mesh.indexBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        for (let column = 0; column < 4; column++) {
            const location = 4 + column;
            gl.vertexAttribPointer(location, 4, gl.FLOAT, false, INSTANCE_STRIDE, column * 4 * Float32Array.BYTES_PER_ELEMENT);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribDivisor(location, 1);
        }
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        group.vao = vao;
        group.instanceBuffer = instanceBuffer;
    }

    _bindMeshAttribute(buffer, location, size) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(location);
    }

    /** Draw visible static instances; falling trees remain owned by GameScene. */
    draw(camera, frustum = null, options = {}) {
        if (this.disposed || !camera?.viewMatrix || !camera?.projectionMatrix) return 0;
        const gl = this.gl;
        const program = options.depthOnly ? this.depthProgram : this.program;
        const liveEntities = new Set(this.entities);
        const cameraPosition = camera.position || [0, 0, 0];
        const viewDistance = Math.max(0, Number(options.viewDistance ?? 0));
        program.use();
        program.setUniformMatrix4fv('uModelMatrix', IDENTITY);
        program.setUniformMatrix4fv('uViewMatrix', camera.viewMatrix);
        program.setUniformMatrix4fv('uProjectionMatrix', camera.projectionMatrix);
        program.setUniform3fv('uViewPosition', cameraPosition);
        if (typeof options.applyLighting === 'function') options.applyLighting(program);
        program.setUniform1f('uFirstPersonHeadCutoff', 1000000.0);
        program.setUniform1i('uUseBaseColorTexture', 0);

        this.lastDrawnInstances = 0;
        for (const group of this.groups.values()) {
            const instances = [];
            for (const entity of group.entities) {
                if (!liveEntities.has(entity) || entity.treeState === 'falling') continue;
                const center = entity.cullingCenter || entity.position;
                const radius = entity.cullingRadius || 1;
                if (viewDistance > 0) {
                    const dx = center[0] - cameraPosition[0], dy = center[1] - cameraPosition[1], dz = center[2] - cameraPosition[2];
                    if (dx * dx + dy * dy + dz * dz > (viewDistance + radius) ** 2) continue;
                }
                if (frustum && !frustum.containsSphere(center[0], center[1], center[2], radius)) continue;
                instances.push(entity.modelMatrix);
            }
            if (!instances.length) {
                group.instanceCount = 0;
                continue;
            }

            const matrices = new Float32Array(instances.length * INSTANCE_FLOATS);
            for (let i = 0; i < instances.length; i++) matrices.set(instances[i], i * INSTANCE_FLOATS);
            gl.bindBuffer(gl.ARRAY_BUFFER, group.instanceBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            group.instanceCount = instances.length;

            gl.bindVertexArray(group.vao);
            if (group.mesh.hasIndices) {
                gl.drawElementsInstanced(gl.TRIANGLES, group.mesh.indexCount, group.mesh.indexType, 0, group.instanceCount);
            } else {
                gl.drawArraysInstanced(gl.TRIANGLES, 0, group.mesh.vertexCount, group.instanceCount);
            }
            gl.bindVertexArray(null);
            this.lastDrawnInstances += group.instanceCount;
        }
        return this.lastDrawnInstances;
    }

    /** Rebuild batches when a restore replaces the environment entity set. */
    setEntities(entities) {
        if (this.disposed) return;
        this._deleteGroups();
        this.program?.delete();
        this.depthProgram?.delete();
        this.entities = entities;
        this._buildGroups();
    }

    _deleteGroups() {
        for (const group of this.groups.values()) {
            this.gl.deleteBuffer(group.instanceBuffer);
            this.gl.deleteVertexArray(group.vao);
        }
        this.groups.clear();
    }

    delete() {
        if (this.disposed) return;
        this.disposed = true;
        this._deleteGroups();
        this.program?.delete();
        this.depthProgram?.delete();
        this.program = null;
        this.depthProgram = null;
        this.lastDrawnInstances = 0;
    }
}
