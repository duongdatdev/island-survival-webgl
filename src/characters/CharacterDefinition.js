export class CharacterDefinition {
    constructor({ id, displayName, obj, mtl, scale = 1, rotation = [0, 0, 0], offset = [0, 0, 0] }) {
        this.id = id;
        this.displayName = displayName;
        this.obj = obj;
        this.mtl = mtl;
        this.scale = scale;
        this.rotation = rotation;
        this.offset = offset;
    }
}
