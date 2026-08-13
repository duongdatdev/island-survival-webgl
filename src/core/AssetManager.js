import { WebIO } from '@gltf-transform/core';
import { Texture } from '../renderer/Texture.js';
import { Mesh } from '../renderer/Mesh.js';
import { ModelAsset } from '../renderer/ModelAsset.js';
import { ObjParser } from './ObjParser.js';

/**
 * Asset Manager for asynchronous resource loading and caching
 */
export class AssetManager {
    constructor(gl) {
        this.gl = gl;
        this.textures = {};
        this.shaders = {};
        this.models = {};
        this.modelPromises = {};
        this.texts = {};
        this.environmentMetadata = {}; // Cache for metadata JSONs
        this.creatureMetadata = {};
        this.gltfIO = new WebIO();
        
        this.totalAssets = 0;
        this.loadedAssets = 0;
    }

    /**
     * Load environment asset manifest and fetch all metadata JSONs
     */
    async loadEnvironmentMetadata(manifestUrl) {
        this.totalAssets++;
        try {
            const response = await fetch(manifestUrl);
            if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
            const manifest = await response.json();
            this.loadedAssets++;

            const assetUrls = manifest.assets || [];
            this.totalAssets += assetUrls.length;

            const loadPromises = assetUrls.map(async (url) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP status: ${res.status}`);
                    const data = await res.json();

                    // Derive OBJ and MTL paths from asset JSON URL
                    const folder = url.substring(0, url.lastIndexOf('/'));
                    const filename = url.substring(url.lastIndexOf('/') + 1);
                    const base = filename.substring(0, filename.indexOf('.asset.json'));
                    data.objPath = `${folder}/${base}.obj`;
                    data.mtlPath = `${folder}/${base}.mtl`;

                    this.environmentMetadata[data.id] = data;
                    this.loadedAssets++;
                    return data;
                } catch (err) {
                    console.error(`AssetManager: Failed to load metadata at '${url}':`, err);
                    this.loadedAssets++;
                    return null;
                }
            });

            await Promise.all(loadPromises);
        } catch (error) {
            console.error(`AssetManager: Failed to load environment manifest at '${manifestUrl}':`, error);
            this.loadedAssets++;
        }
    }

    /**
     * Load image asset asynchronously and cache it as a WebGL Texture
     */
    loadTexture(name, src, options = {}) {
        this.totalAssets++;
        return new Promise((resolve) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            
            image.onload = () => {
                const texture = new Texture(this.gl, options);
                texture.setImage(image);
                this.textures[name] = texture;
                this.loadedAssets++;
                resolve(texture);
            };

            image.onerror = () => {
                console.warn(`AssetManager: Texture failed to load at path '${src}'. Utilizing gray fallback.`);
                // Fallback texture created by default
                const texture = new Texture(this.gl, options);
                this.textures[name] = texture;
                this.loadedAssets++;
                resolve(texture);
            };

            image.src = src;
        });
    }

    /**
     * Load raw text files (e.g. for external shaders or OBJ models)
     */
    loadText(name, src) {
        this.totalAssets++;
        return fetch(src)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP status: ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                this.texts[name] = text;
                this.loadedAssets++;
                return text;
            })
            .catch(error => {
                console.error(`AssetManager: Failed to load text resource at '${src}':`, error);
                this.texts[name] = '';
                this.loadedAssets++;
                return '';
            });
    }

    /**
     * Directly cache an existing shader program
     */
    addShader(name, shaderProgram) {
        this.shaders[name] = shaderProgram;
    }

    getTexture(name) {
        return this.textures[name] || null;
    }

    getShader(name) {
        return this.shaders[name] || null;
    }

    getText(name) {
        return this.texts[name] || '';
    }

    getModel(name) {
        return this.models[name] || null;
    }

    /**
     * Load the creature model manifest and compile every GLB independently.
     * A broken model resolves to null so the corresponding creature can use
     * its procedural fallback without blocking the rest of the game.
     */
    async loadCreatureModels(manifestUrl) {
        this.totalAssets++;

        let manifest;
        try {
            const response = await fetch(manifestUrl);
            if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
            manifest = await response.json();
            this.creatureMetadata = Object.fromEntries(
                (manifest.models || []).map(definition => [definition.id, definition])
            );
        } catch (error) {
            console.error(`AssetManager: Failed to load creature manifest at '${manifestUrl}':`, error);
            this.creatureMetadata = {};
            return [];
        } finally {
            this.loadedAssets++;
        }

        return Promise.all((manifest.models || []).map(definition => {
            const key = `creature:${definition.id}`;
            return this.loadGLTFModel(key, definition.path, {
                targetSize: definition.targetSize,
                preserveAspect: definition.preserveAspect,
                yawOffset: definition.yawOffset,
            });
        }));
    }

    /**
     * Load and cache a renderer-native glTF model.
     */
    loadGLTFModel(name, src, options) {
        if (this.models[name]) return Promise.resolve(this.models[name]);
        if (this.modelPromises[name]) return this.modelPromises[name];

        this.totalAssets++;
        this.modelPromises[name] = this.gltfIO.read(src)
            .then(document => ModelAsset.fromDocument(this.gl, document, options))
            .then(model => {
                this.models[name] = model;
                return model;
            })
            .catch(error => {
                console.error(`AssetManager: Failed to load glTF model '${name}' at '${src}':`, error);
                return null;
            })
            .finally(() => {
                this.loadedAssets++;
                delete this.modelPromises[name];
            });

        return this.modelPromises[name];
    }

    /**
     * Parse cached raw text assets of unique OBJ models into WebGL meshes
     * @param {string[]} uniqueObjPaths List of unique paths to OBJ files
     */
    async compileUniqueModels(uniqueObjPaths) {
        this.totalAssets += uniqueObjPaths.filter(path => !this.models[path]).length;

        const loadPromises = uniqueObjPaths.map(async (path) => {
            if (this.models[path]) return; // Already compiled

            let text = this.getText(path);
            if (!text) {
                text = await this.loadText(path, path);
            }

            if (text) {
                try {
                    const parsedData = ObjParser.parse(text);
                    const mesh = new Mesh(this.gl, parsedData);
                    this.models[path] = mesh;
                    this.loadedAssets++;
                } catch (error) {
                    console.error(`AssetManager: Failed to parse OBJ at '${path}':`, error);
                    this.loadedAssets++;
                }
            } else {
                this.loadedAssets++;
            }
        });

        await Promise.all(loadPromises);
    }

    getProgress() {
        if (this.totalAssets === 0) return 1.0;
        return this.loadedAssets / this.totalAssets;
    }

    isLoaded() {
        return this.loadedAssets >= this.totalAssets;
    }

    clear() {
        // Delete all textures from WebGL memory
        for (const key in this.textures) {
            this.textures[key].delete();
        }
        this.textures = {};

        // Delete all shader programs from WebGL memory
        for (const key in this.shaders) {
            this.shaders[key].delete();
        }
        this.shaders = {};

        // Delete all compiled meshes from WebGL memory
        for (const key in this.models) {
            this.models[key].delete();
        }
        this.models = {};
        this.modelPromises = {};
        
        this.texts = {};
        this.environmentMetadata = {};
        this.creatureMetadata = {};
        this.totalAssets = 0;
        this.loadedAssets = 0;
    }
}
