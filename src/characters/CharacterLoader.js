import { ObjParser } from '../core/ObjParser.js';
import { Mesh } from '../renderer/Mesh.js';
import { CharacterRegistry } from './CharacterRegistry.js';

export function parseMtl(text, characterId = '') {
    const colors = {};
    const lines = text.split('\n');
    let currentMat = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts[0] === 'newmtl') {
            currentMat = parts[1];
        } else if (parts[0] === 'Kd' && currentMat) {
            const r = parseFloat(parts[1]);
            const g = parseFloat(parts[2]);
            const b = parseFloat(parts[3]);
            colors[currentMat] = [r, g, b];
        }
    }

    const charIdLower = characterId.toLowerCase();
    
    let faceColor = null;
    for (const [matName, color] of Object.entries(colors)) {
        if (matName.toLowerCase() === 'face') {
            const maxVal = Math.max(color[0], color[1], color[2]);
            if (maxVal > 0.3) {
                faceColor = color;
            }
        }
    }

    for (const [matName, color] of Object.entries(colors)) {
        const matNameLower = matName.toLowerCase();
        let [r, g, b] = color;
        const maxVal = Math.max(r, g, b);
        
        if (matNameLower === 'skin') {
            if (charIdLower.includes('zombie')) {
                colors[matName] = [0.45, 0.65, 0.35];
            } else if (charIdLower.includes('goblin')) {
                colors[matName] = [0.35, 0.65, 0.25];
            } else if (charIdLower.includes('elf')) {
                colors[matName] = [0.92, 0.82, 0.75];
            } else if (faceColor) {
                colors[matName] = faceColor;
            } else {
                colors[matName] = [0.85, 0.67, 0.55];
            }
        } else if (matNameLower === 'face' && maxVal < 0.25) {
            if (charIdLower.includes('zombie')) {
                colors[matName] = [0.45, 0.65, 0.35];
            } else if (charIdLower.includes('goblin')) {
                colors[matName] = [0.35, 0.65, 0.25];
            } else {
                colors[matName] = [0.85, 0.67, 0.55];
            }
        } else if (maxVal > 0.0 && maxVal < 0.25) {
            let targetMax = 0.7;
            if (matNameLower.includes('hair')) {
                targetMax = 0.45;
            } else if (matNameLower.includes('belt')) {
                targetMax = 0.3;
            } else if (matNameLower.includes('pants')) {
                targetMax = 0.5;
            }
            
            const scale = targetMax / maxVal;
            colors[matName] = [
                Math.min(r * scale, 1.0),
                Math.min(g * scale, 1.0),
                Math.min(b * scale, 1.0)
            ];
        }
    }

    return colors;
}

export class CharacterLoader {
    constructor() {
        this._cache = new Map();
    }

    async load(gl, assetManager, characterDef) {
        const objPath = CharacterRegistry.getObjPath(characterDef);

        if (this._cache.has(objPath)) {
            return this._cache.get(objPath);
        }

        if (assetManager.models[objPath]) {
            const mesh = assetManager.models[objPath];
            this._cache.set(objPath, mesh);
            return mesh;
        }

        const mtlPath = CharacterRegistry.getMtlPath(characterDef);
        let mtlText = assetManager.getText(mtlPath);
        if (!mtlText) {
            mtlText = await assetManager.loadText(mtlPath, mtlPath);
        }
        if (mtlText) {
            const mtlColors = parseMtl(mtlText, characterDef.id);
            for (const [matName, color] of Object.entries(mtlColors)) {
                ObjParser.registerColor(matName, color);
            }
        }

        let text = assetManager.getText(objPath);
        if (!text) {
            text = await assetManager.loadText(objPath, objPath);
        }

        if (!text) {
            console.error(`CharacterLoader: Failed to load OBJ at '${objPath}'`);
            return null;
        }

        try {
            const parsedData = ObjParser.parse(text);
            const mesh = new Mesh(gl, parsedData);
            assetManager.models[objPath] = mesh;
            this._cache.set(objPath, mesh);
            return mesh;
        } catch (error) {
            console.error(`CharacterLoader: Failed to parse OBJ at '${objPath}':`, error);
            return null;
        }
    }

    getCached(characterDef) {
        const objPath = CharacterRegistry.getObjPath(characterDef);
        return this._cache.get(objPath) || null;
    }

    getDebugInfo() {
        const info = [];
        for (const [path, mesh] of this._cache) {
            const vertexCount = mesh.vertexCount;
            const triCount = mesh.indexCount / 3;
            const memEstimate = (mesh.vertexCount * (3 + 3 + 4 + 2) * 4) + (mesh.indexCount * 4);
            info.push({
                path,
                vertexCount,
                triCount,
                memBytes: memEstimate,
            });
        }
        return info;
    }

    clear() {
        for (const mesh of this._cache.values()) {
            mesh.delete();
        }
        this._cache.clear();
    }
}

export const characterLoader = new CharacterLoader();
