import { Mat4 } from '../math/Mat4.js';
import { Mesh } from './Mesh.js';
import { Texture } from './Texture.js';

export class ModelAsset {
    constructor(gl, drawables, textures, metadata = {}) {
        this.gl = gl;
        this.drawables = drawables;
        this.textures = textures;
        this.animationNames = metadata.animationNames || [];
        this.targetSize = metadata.targetSize || [1, 1, 1];
        this.bounds = metadata.bounds || null;
        this.collisionGeometry = metadata.collisionGeometry || null;
        this._worldMatrix = Mat4.create();
    }

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
        const normalization = options.nativeScale ? Mat4.create() : ModelAsset._createNormalizationMatrix(
            bounds,
            targetSize,
            yawOffset,
            preserveAspect
        );
        if (options.grounded && !options.nativeScale) normalization[13] += targetSize[1] * 0.5;
        const textureCache = new Map();
        const drawables = [];
        const compiledMeshes = [];
        const collisionGeometry = [];

        try {
            for (const entry of primitiveEntries) {
                const primitive = entry.primitive;
                const material = primitive.getMaterial();
                const meshData = ModelAsset._createMeshData(primitive, material);
                const rendererMesh = new Mesh(gl, meshData);
                compiledMeshes.push(rendererMesh);

                const baseInfo = ModelAsset._materialValue(material, 'getBaseColorTextureInfo', null);
                const baseUV = ModelAsset._textureCoord(baseInfo);
                const bindTexture = async (slot, colorSpace) => {
                    const source = ModelAsset._materialValue(material, `get${slot}Texture`, null);
                    if (!source) return null;
                    const info = ModelAsset._materialValue(material, `get${slot}TextureInfo`, null);
                    if (info && ModelAsset._textureCoord(info) !== baseUV) {
                        unsupportedTextureCoordinates.push(slot.replace('Texture', '').toLowerCase());
                        return null;
                    }
                    let variants = textureCache.get(source);
                    if (!variants) { variants = new Map(); textureCache.set(source, variants); }
                    if (!variants.has(colorSpace)) {
                        variants.set(colorSpace, await ModelAsset._createTexture(gl, source, info, colorSpace));
                    }
                    return variants.get(colorSpace);
                };
                const unsupportedTextureCoordinates = [];
                const texture = await bindTexture('BaseColor', 'srgb');
                const normalTexture = await bindTexture('Normal', 'linear');
                const aoTexture = await bindTexture('Occlusion', 'linear');
                const emissiveTexture = await bindTexture('Emissive', 'srgb');
                const metallicRoughnessTexture = await bindTexture('MetallicRoughness', 'linear');
                const materialParameters = ModelAsset._extractMaterialParameters(material);
                const localBounds = rendererMesh.bounds;

                const localMatrix = Mat4.create();
                Mat4.multiply(localMatrix, normalization, entry.nodeMatrix);
                drawables.push({
                    mesh: rendererMesh, texture, normalTexture, aoTexture, emissiveTexture,
                    metallicRoughnessTexture, localMatrix, ...materialParameters,
                    unsupportedTextureCoordinates,
                    motionBoundsMin: localBounds.min.slice(), motionBoundsMax: localBounds.max.slice()
                });
                if (options.retainGeometry) {
                    const indices = meshData.indices || Array.from({ length: meshData.positions.length / 3 }, (_, index) => index);
                    for (const index of indices) {
                        const x = meshData.positions[index * 3], y = meshData.positions[index * 3 + 1], z = meshData.positions[index * 3 + 2];
                        collisionGeometry.push(localMatrix[0] * x + localMatrix[4] * y + localMatrix[8] * z + localMatrix[12],
                            localMatrix[1] * x + localMatrix[5] * y + localMatrix[9] * z + localMatrix[13],
                            localMatrix[2] * x + localMatrix[6] * y + localMatrix[10] * z + localMatrix[14]);
                    }
                }
            }
        } catch (error) {
            for (const mesh of compiledMeshes) mesh.delete();
            for (const variants of textureCache.values()) for (const texture of variants.values()) if (texture) texture.delete();
            throw error;
        }

        const animationNames = root.listAnimations().map((animation, index) =>
            animation.getName() || `animation_${index}`
        );

        return new ModelAsset(
            gl,
            drawables,
            Array.from(textureCache.values()).flatMap(variants => Array.from(variants.values())).filter(Boolean),
            { animationNames, collisionGeometry: options.retainGeometry ? new Float32Array(collisionGeometry) : null, targetSize: options.nativeScale
                ? bounds.max.map((value, axis) => value - bounds.min[axis]) : targetSize, bounds }
        );
    }

    draw(shaderProgram, entityModelMatrix, drawMode) {
        for (const drawable of this.drawables) {
            Mat4.multiply(this._worldMatrix, entityModelMatrix, drawable.localMatrix);
            shaderProgram.setUniformMatrix4fv('uModelMatrix', this._worldMatrix);

            this._bindTexture(shaderProgram, drawable.texture, 0, 'uBaseColorTexture', 'uUseBaseColorTexture');
            this._bindTexture(shaderProgram, drawable.normalTexture, 3, 'uNormalTexture', 'uUseNormalTexture');
            this._bindTexture(shaderProgram, drawable.aoTexture, 4, 'uAOTexture', 'uUseAOTexture');
            this._bindTexture(shaderProgram, drawable.emissiveTexture, 5, 'uEmissiveTexture', 'uUseEmissiveTexture');
            this._bindTexture(shaderProgram, drawable.metallicRoughnessTexture, 6,
                'uMetallicRoughnessTexture', 'uUseMetallicRoughnessTexture');
            shaderProgram.setUniform1i('uVertexColorLinear', 1);
            shaderProgram.setUniform1f('uRoughness', drawable.roughness);
            shaderProgram.setUniform1f('uMetallic', drawable.metallic);
            shaderProgram.setUniform3fv('uEmissive', drawable.emissive);
            shaderProgram.setUniform1f('uMaterialAO', drawable.materialAO);
            shaderProgram.setUniform1f('uNormalScale', drawable.normalScale);
            shaderProgram.setUniform1f('uAOStrength', drawable.aoStrength);
            shaderProgram.setUniform3fv('uMotionBoundsMin', drawable.motionBoundsMin);
            shaderProgram.setUniform3fv('uMotionBoundsMax', drawable.motionBoundsMax);

            drawable.mesh.draw(drawMode);
        }

        shaderProgram.setUniform1i('uUseBaseColorTexture', 0);
        shaderProgram.setUniform1i('uUseNormalTexture', 0);
        shaderProgram.setUniform1i('uUseAOTexture', 0);
        shaderProgram.setUniform1i('uUseEmissiveTexture', 0);
        shaderProgram.setUniform1i('uUseMetallicRoughnessTexture', 0);
        shaderProgram.setUniform1i('uVertexColorLinear', 0);
        shaderProgram.setUniform1f('uRoughness', 0.85);
        shaderProgram.setUniform1f('uMetallic', 0);
        shaderProgram.setUniform3fv('uEmissive', [0, 0, 0]);
        shaderProgram.setUniform1f('uMaterialAO', 1);
        shaderProgram.setUniform1f('uNormalScale', 1);
        shaderProgram.setUniform1f('uAOStrength', 1);
        shaderProgram.setUniform3fv('uMotionBoundsMin', [0, 0, 0]);
        shaderProgram.setUniform3fv('uMotionBoundsMax', [0, 0, 0]);
        for (const unit of [0, 3, 4, 5, 6]) {
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }
        this.gl.activeTexture(this.gl.TEXTURE0);
    }

    _bindTexture(shaderProgram, texture, unit, samplerUniform, enabledUniform) {
        if (texture) texture.bind(unit);
        shaderProgram.setUniform1i(samplerUniform, unit);
        shaderProgram.setUniform1i(enabledUniform, texture ? 1 : 0);
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
        const textureInfo = ModelAsset._materialValue(material, 'getBaseColorTextureInfo', null);
        const uvSet = ModelAsset._textureCoord(textureInfo);
        const texCoordAccessor = primitive.getAttribute(`TEXCOORD_${uvSet}`);
        const factor = ModelAsset._readMaterialVector(material, 'getBaseColorFactor', [1, 1, 1, 1], 4);
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

    static _materialValue(material, methodName, fallback) {
        if (!material || typeof material[methodName] !== 'function') return fallback;
        try {
            const value = material[methodName]();
            return value === undefined || value === null ? fallback : value;
        } catch {
            return fallback;
        }
    }

    static _textureCoord(textureInfo) {
        const value = ModelAsset._materialValue(textureInfo, 'getTexCoord', 0);
        return Number.isInteger(value) && value >= 0 ? value : 0;
    }

    static _readMaterialVector(material, methodName, fallback, length) {
        const value = ModelAsset._materialValue(material, methodName, fallback);
        if (!value || value.length < length) return fallback.slice();
        const result = Array.from(value).slice(0, length).map(Number);
        return result.every(Number.isFinite) ? result : fallback.slice();
    }

    static _readMaterialFactor(material, methodName, fallback, min = 0, max = 1) {
        const value = Number(ModelAsset._materialValue(material, methodName, fallback));
        return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    }

    static _extractMaterialParameters(material) {
        return {
            roughness: ModelAsset._readMaterialFactor(material, 'getRoughnessFactor', 0.85),
            metallic: ModelAsset._readMaterialFactor(material, 'getMetallicFactor', 0),
            emissive: ModelAsset._readMaterialVector(material, 'getEmissiveFactor', [0, 0, 0], 3),
            normalScale: ModelAsset._readMaterialFactor(material, 'getNormalScale', 1, 0, 8),
            // glTF occlusionStrength only scales an AO texture sample; without
            // a texture there is no standalone AO factor to darken the surface.
            materialAO: 1,
            aoStrength: ModelAsset._readMaterialFactor(material, 'getOcclusionStrength', 1),
        };
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

    static async _createTexture(gl, sourceTexture, textureInfo, colorSpace = 'srgb') {
        const encodedImage = sourceTexture.getImage();
        if (!encodedImage) return null;

        const imageBitmap = await createImageBitmap(new Blob(
            [encodedImage],
            { type: sourceTexture.getMimeType() || 'image/png' }
        ));
        const texture = new Texture(gl, {
            colorSpace,
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
