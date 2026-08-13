import { Mat4 } from '../math/Mat4.js';
import { Mesh } from './Mesh.js';
import { Texture } from './Texture.js';

/**
 * A renderer-native model compiled from a glTF document. Geometry and textures
 * are shared by every entity using the asset; only entity transforms vary.
 */
export class ModelAsset {
    constructor(gl, drawables, textures, metadata = {}) {
        this.gl = gl;
        this.drawables = drawables;
        this.textures = textures;
        this.animationNames = metadata.animationNames || [];
        this.targetSize = metadata.targetSize || [1, 1, 1];
        this._worldMatrix = Mat4.create();
    }

    /**
     * Compile the mesh nodes, primitives and base-color textures in a glTF document.
     */
    static async fromDocument(gl, document, options = {}) {
        const targetSize = ModelAsset._validatedTargetSize(options.targetSize);
        const preserveAspect = options.preserveAspect === true;
        const yawOffset = Number.isFinite(options.yawOffset) ? options.yawOffset : 0;
        const root = document.getRoot();
        const primitiveEntries = [];

        for (const node of root.listNodes()) {
            const mesh = node.getMesh();
            if (!mesh) continue;

            const nodeMatrix = new Float32Array(node.getWorldMatrix());
            for (const primitive of mesh.listPrimitives()) {
                if (!primitive.getAttribute('POSITION')) continue;
                primitiveEntries.push({ primitive, nodeMatrix });
            }
        }

        if (primitiveEntries.length === 0) {
            throw new Error('The glTF document does not contain a renderable mesh primitive.');
        }

        const bounds = ModelAsset._computeWorldBounds(primitiveEntries);
        const normalization = ModelAsset._createNormalizationMatrix(
            bounds,
            targetSize,
            yawOffset,
            preserveAspect
        );
        const textureCache = new Map();
        const drawables = [];
        const compiledMeshes = [];

        try {
            for (const entry of primitiveEntries) {
                const primitive = entry.primitive;
                const material = primitive.getMaterial();
                const meshData = ModelAsset._createMeshData(primitive, material);
                const rendererMesh = new Mesh(gl, meshData);
                compiledMeshes.push(rendererMesh);

                let texture = null;
                if (material && material.getBaseColorTexture()) {
                    const sourceTexture = material.getBaseColorTexture();
                    const textureInfo = material.getBaseColorTextureInfo();
                    const cacheKey = sourceTexture;
                    if (!textureCache.has(cacheKey)) {
                        textureCache.set(cacheKey, await ModelAsset._createTexture(gl, sourceTexture, textureInfo));
                    }
                    texture = textureCache.get(cacheKey);
                }

                const localMatrix = Mat4.create();
                Mat4.multiply(localMatrix, normalization, entry.nodeMatrix);
                drawables.push({ mesh: rendererMesh, texture, localMatrix });
            }
        } catch (error) {
            for (const mesh of compiledMeshes) mesh.delete();
            for (const texture of textureCache.values()) {
                if (texture) texture.delete();
            }
            throw error;
        }

        const animationNames = root.listAnimations().map((animation, index) =>
            animation.getName() || `animation_${index}`
        );

        return new ModelAsset(
            gl,
            drawables,
            Array.from(textureCache.values()).filter(Boolean),
            { animationNames, targetSize }
        );
    }

    draw(shaderProgram, entityModelMatrix, drawMode) {
        for (const drawable of this.drawables) {
            Mat4.multiply(this._worldMatrix, entityModelMatrix, drawable.localMatrix);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this._worldMatrix);

            if (drawable.texture) {
                drawable.texture.bind(0);
                shaderProgram.setUniform1i('uBaseColorTexture', 0);
                shaderProgram.setUniform1i('uUseBaseColorTexture', 1);
            } else {
                shaderProgram.setUniform1i('uUseBaseColorTexture', 0);
            }

            drawable.mesh.draw(drawMode);
        }

        // BasicShader is shared by the whole opaque pass. Restore the default
        // so subsequent procedural meshes never sample a stale creature texture.
        shaderProgram.setUniform1i('uUseBaseColorTexture', 0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    delete() {
        for (const drawable of this.drawables) drawable.mesh.delete();
        for (const texture of this.textures) texture.delete();
        this.drawables = [];
        this.textures = [];
    }

    static _validatedTargetSize(targetSize) {
        if (!Array.isArray(targetSize) || targetSize.length !== 3
            || targetSize.some(value => !Number.isFinite(value) || value <= 0)) {
            throw new Error('A glTF model requires a positive targetSize [x, y, z].');
        }
        return targetSize.slice();
    }

    static _computeWorldBounds(entries) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        const position = [];

        for (const { primitive, nodeMatrix } of entries) {
            const accessor = primitive.getAttribute('POSITION');
            for (let i = 0; i < accessor.getCount(); i++) {
                accessor.getElement(i, position);
                const x = position[0], y = position[1], z = position[2];
                const wx = nodeMatrix[0] * x + nodeMatrix[4] * y + nodeMatrix[8] * z + nodeMatrix[12];
                const wy = nodeMatrix[1] * x + nodeMatrix[5] * y + nodeMatrix[9] * z + nodeMatrix[13];
                const wz = nodeMatrix[2] * x + nodeMatrix[6] * y + nodeMatrix[10] * z + nodeMatrix[14];
                if (wx < min[0]) min[0] = wx;
                if (wx > max[0]) max[0] = wx;
                if (wy < min[1]) min[1] = wy;
                if (wy > max[1]) max[1] = wy;
                if (wz < min[2]) min[2] = wz;
                if (wz > max[2]) max[2] = wz;
            }
        }

        if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
            throw new Error('Unable to calculate finite bounds for the glTF model.');
        }
        return { min, max };
    }

    static _createNormalizationMatrix(bounds, targetSize, yawOffset, preserveAspect = false) {
        const extent = [
            Math.max(bounds.max[0] - bounds.min[0], 1e-6),
            Math.max(bounds.max[1] - bounds.min[1], 1e-6),
            Math.max(bounds.max[2] - bounds.min[2], 1e-6),
        ];
        const center = [
            (bounds.min[0] + bounds.max[0]) * 0.5,
            (bounds.min[1] + bounds.max[1]) * 0.5,
            (bounds.min[2] + bounds.max[2]) * 0.5,
        ];

        const fitted = Mat4.create();
        let sx = targetSize[0] / extent[0];
        let sy = targetSize[1] / extent[1];
        let sz = targetSize[2] / extent[2];
        if (preserveAspect) {
            // Creature dimensions are authored around their height. Apply the
            // same factor to all axes so the source silhouette cannot stretch.
            sx = sy;
            sz = sy;
        }
        fitted[0] = sx;
        fitted[5] = sy;
        fitted[10] = sz;
        fitted[12] = -center[0] * sx;
        fitted[13] = -center[1] * sy;
        fitted[14] = -center[2] * sz;

        if (yawOffset === 0) return fitted;

        const yaw = Mat4.create();
        Mat4.rotateY(yaw, yaw, yawOffset);
        const normalized = Mat4.create();
        Mat4.multiply(normalized, yaw, fitted);
        return normalized;
    }

    static _createMeshData(primitive, material) {
        const positionAccessor = primitive.getAttribute('POSITION');
        const normalAccessor = primitive.getAttribute('NORMAL');
        const colorAccessor = primitive.getAttribute('COLOR_0');
        const textureInfo = material ? material.getBaseColorTextureInfo() : null;
        const uvSet = textureInfo ? textureInfo.getTexCoord() : 0;
        const texCoordAccessor = primitive.getAttribute(`TEXCOORD_${uvSet}`);
        const factor = material ? material.getBaseColorFactor() : [1, 1, 1, 1];
        const vertexCount = positionAccessor.getCount();

        const positions = ModelAsset._readFloatAccessor(positionAccessor, 3);
        const normals = normalAccessor ? ModelAsset._readFloatAccessor(normalAccessor, 3) : null;
        const texCoords = texCoordAccessor ? ModelAsset._readFloatAccessor(texCoordAccessor, 2) : null;
        const colors = new Float32Array(vertexCount * 4);
        const sourceColor = [];

        for (let i = 0; i < vertexCount; i++) {
            if (colorAccessor) colorAccessor.getElement(i, sourceColor);
            colors[i * 4] = (colorAccessor ? sourceColor[0] : 1) * factor[0];
            colors[i * 4 + 1] = (colorAccessor ? sourceColor[1] : 1) * factor[1];
            colors[i * 4 + 2] = (colorAccessor ? sourceColor[2] : 1) * factor[2];
            colors[i * 4 + 3] = (colorAccessor && sourceColor.length > 3 ? sourceColor[3] : 1) * factor[3];
        }

        const indexAccessor = primitive.getIndices();
        let indices = null;
        if (indexAccessor && indexAccessor.getArray()) {
            const sourceIndices = indexAccessor.getArray();
            indices = sourceIndices instanceof Uint32Array
                ? new Uint32Array(sourceIndices)
                : new Uint16Array(sourceIndices);
        }

        return { positions, normals, colors, texCoords, indices };
    }

    static _readFloatAccessor(accessor, expectedSize) {
        const output = new Float32Array(accessor.getCount() * expectedSize);
        const value = [];
        for (let i = 0; i < accessor.getCount(); i++) {
            accessor.getElement(i, value);
            for (let component = 0; component < expectedSize; component++) {
                output[i * expectedSize + component] = value[component] ?? 0;
            }
        }
        return output;
    }

    static async _createTexture(gl, sourceTexture, textureInfo) {
        const encodedImage = sourceTexture.getImage();
        if (!encodedImage) return null;

        const imageBitmap = await createImageBitmap(new Blob(
            [encodedImage],
            { type: sourceTexture.getMimeType() || 'image/png' }
        ));
        const texture = new Texture(gl, {
            wrapS: textureInfo ? textureInfo.getWrapS() : gl.REPEAT,
            wrapT: textureInfo ? textureInfo.getWrapT() : gl.REPEAT,
            minFilter: textureInfo && textureInfo.getMinFilter()
                ? textureInfo.getMinFilter()
                : gl.LINEAR_MIPMAP_LINEAR,
            magFilter: textureInfo && textureInfo.getMagFilter()
                ? textureInfo.getMagFilter()
                : gl.LINEAR,
        });

        try {
            texture.setImage(imageBitmap);
        } finally {
            imageBitmap.close();
        }
        return texture;
    }
}
