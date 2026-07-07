import { Mat4 } from '../math/Mat4.js';
import { characterLoader } from './CharacterLoader.js';

export class CharacterRenderer {
    constructor(characterDef) {
        this.characterDef = characterDef;
        this.mesh = null;
        this._tempMatrix = Mat4.create();
    }

    async load(gl, assetManager) {
        this.mesh = await characterLoader.load(gl, assetManager, this.characterDef);
        return this.mesh;
    }

    draw(shader, parentMatrix, drawMode) {
        if (!this.mesh) return;

        const def = this.characterDef;
        const m = this._tempMatrix;

        Mat4.copy(m, parentMatrix);

        Mat4.translate(m, m, def.offset);

        if (def.rotation[0] !== 0) Mat4.rotateX(m, m, def.rotation[0] * Math.PI / 180);
        if (def.rotation[1] !== 0) Mat4.rotateY(m, m, def.rotation[1] * Math.PI / 180);
        if (def.rotation[2] !== 0) Mat4.rotateZ(m, m, def.rotation[2] * Math.PI / 180);

        if (def.scale !== 1) {
            Mat4.scale(m, m, [def.scale, def.scale, def.scale]);
        }

        shader.setUniformMatrix4fv('uModelMatrix', m);
        this.mesh.draw(drawMode);
    }

    delete() {
        this.mesh = null;
    }
}
