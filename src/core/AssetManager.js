import { Texture } from '../renderer/Texture.js';

/**
 * Asset Manager for asynchronous resource loading and caching
 */
export class AssetManager {
    constructor(gl) {
        this.gl = gl;
        this.textures = {};
        this.shaders = {};
        this.models = {};
        this.texts = {};
        
        this.totalAssets = 0;
        this.loadedAssets = 0;
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
        
        this.models = {};
        this.texts = {};
        this.totalAssets = 0;
        this.loadedAssets = 0;
    }
}
