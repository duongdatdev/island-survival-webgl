import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';

export class Terrain extends Entity {
    constructor(gl, size = 60, width = 60.0, generatedData = null, generator = null) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;
        this.generator = generator;
        this.viewPosition = [0, 0, 0];
        this.viewDistance = 180;
        this.chunkMeshes = [];
        this.frustum = null;

        if (!generatedData || !generator) {
            throw new Error('Terrain: generatedData and generator are required (WorldGenerator must produce them).');
        }

        this.mesh = generatedData.chunks ? null : new Mesh(gl, generatedData);
        this._createChunks(generatedData.chunks || []);
        this.updateModelMatrix();
    }

    rebuild(generatedData, generator) {
        if (this.mesh) {
            this.mesh.delete();
        }
        this.generator = generator;
        for (const chunk of this.chunkMeshes) for (const mesh of chunk.meshes) mesh.delete();
        this.chunkMeshes = [];
        this.mesh = generatedData.chunks ? null : new Mesh(this.gl, generatedData);
        this._createChunks(generatedData.chunks || []);
    }

    _createChunks(chunks) {
        this.chunkMeshes = chunks.map(chunk => ({ ...chunk, meshes: chunk.levels.map(level => new Mesh(this.gl, level)) }));
    }

    setView(position, distance = 180) {
        this.viewPosition = position;
        this.viewDistance = distance;
    }

    getHeight(x, z) {
        return this.generator.getHeight(x, z);
    }

    draw(shaderProgram, frustum = this.frustum) {
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh?.draw();
        this.lastChunkDraws = 0;
        for (const chunk of this.chunkMeshes) {
            const distance = Math.hypot(chunk.center[0] - this.viewPosition[0], chunk.center[2] - this.viewPosition[2]);
            if (distance > this.viewDistance + chunk.radius) continue;
            if (frustum && !frustum.containsSphere(chunk.center[0], chunk.center[1], chunk.center[2], chunk.radius)) continue;
            const lod = this._selectChunkLod(chunk, distance);
            chunk.meshes[lod].draw();
            this.lastChunkDraws++;
        }
    }

    _selectChunkLod(chunk, distance) {
        // Keep the existing 80/160 m quality bands, with an 8 m dead zone to
        // prevent visible LOD flutter when the camera rests near a boundary.
        const previous = chunk.lod;
        let lod = previous ?? (distance < 80 ? 0 : distance < 160 ? 1 : 2);
        if (lod === 0 && distance > 88) lod = 1;
        else if (lod === 1 && distance < 72) lod = 0;
        else if (lod === 1 && distance > 168) lod = 2;
        else if (lod === 2 && distance < 152) lod = 1;
        chunk.lod = lod;
        return lod;
    }

    delete() {
        if (this.mesh) {
            this.mesh.delete();
            this.mesh = null;
        }
        for (const chunk of this.chunkMeshes) for (const mesh of chunk.meshes) mesh.delete();
        this.chunkMeshes = [];
    }
}
