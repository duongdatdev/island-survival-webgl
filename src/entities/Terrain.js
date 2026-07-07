import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';

/**
 * Procedural Island Terrain Grid
 *
 * All height/color/normal data comes from WorldGenerator + TerrainGenerator
 * (`generatedData` and `generator` are required). The terrain rebuild path is
 * used by the debug biome-color toggle in GameScene.
 */
export class Terrain extends Entity {
    constructor(gl, size = 60, width = 60.0, generatedData = null, generator = null) {
        super();
        this.gl = gl;
        this.size = size;
        this.width = width;
        this.generator = generator;

        if (!generatedData || !generator) {
            throw new Error('Terrain: generatedData and generator are required (WorldGenerator must produce them).');
        }

        this.mesh = new Mesh(gl, generatedData);
        this.updateModelMatrix();
    }

    /**
     * Rebuild the terrain mesh with procedurally generated data
     */
    rebuild(generatedData, generator) {
        if (this.mesh) {
            this.mesh.delete();
        }
        this.generator = generator;
        this.mesh = new Mesh(this.gl, generatedData);
    }

    getHeight(x, z) {
        return this.generator.getHeight(x, z);
    }

    draw(shaderProgram) {
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw();
    }

    delete() {
        if (this.mesh) {
            this.mesh.delete();
            this.mesh = null;
        }
    }
}
