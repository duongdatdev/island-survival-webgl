/**
 * Wavefront OBJ Parser that extracts vertex attributes (position, normals, UVs)
 * and dynamically injects vertex colors based on material names (usemtl) to avoid huge textures.
 */
export class ObjParser {
    static _customColors = {};

    /**
     * Register exact material color from MTL Kd values
     */
    static registerColor(matName, color) {
        ObjParser._customColors[matName.toLowerCase()] = color;
    }

    /**
     * Clear all registered custom colors
     */
    static clearCustomColors() {
        ObjParser._customColors = {};
    }

    /**
     * Parse OBJ file text into WebGL-compatible mesh data
     * @param {string} text Raw OBJ content
     * @returns {object} Mesh data container
     */
    static parse(text) {
        const lines = text.split('\n');
        
        const rawPositions = [];
        const rawNormals = [];
        const rawTexCoords = [];
        
        const positions = [];
        const normals = [];
        const texCoords = [];
        const colors = [];
        const indices = [];
        
        const vertexCache = {};
        let vertexIndexCounter = 0;
        let currentColor = [0.6, 0.6, 0.6]; // Default gray

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;

            const parts = line.split(/\s+/);
            const type = parts[0];

            if (type === 'v') {
                rawPositions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
            } else if (type === 'vn') {
                rawNormals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
            } else if (type === 'vt') {
                rawTexCoords.push(parseFloat(parts[1]), parseFloat(parts[2]));
            } else if (type === 'usemtl') {
                // Determine vertex color based on material name
                const matName = parts[1] || '';
                currentColor = this.getColorForMaterial(matName);
            } else if (type === 'f') {
                const faceIndices = [];
                for (let j = 1; j < parts.length; j++) {
                    const vertexStr = parts[j];
                    if (!vertexStr) continue;

                    let idx = vertexCache[vertexStr];
                    if (idx === undefined) {
                        const indicesParts = vertexStr.split('/');
                        const posIdx = parseInt(indicesParts[0]);
                        const uvIdx = indicesParts[1] ? parseInt(indicesParts[1]) : null;
                        const normIdx = indicesParts[2] ? parseInt(indicesParts[2]) : null;

                        // Position mapping (1-based index)
                        const pIdx = (posIdx > 0 ? posIdx - 1 : rawPositions.length / 3 + posIdx) * 3;
                        positions.push(rawPositions[pIdx], rawPositions[pIdx + 1], rawPositions[pIdx + 2]);

                        // Normal mapping
                        if (normIdx && rawNormals.length > 0) {
                            const nIdx = (normIdx > 0 ? normIdx - 1 : rawNormals.length / 3 + normIdx) * 3;
                            normals.push(rawNormals[nIdx], rawNormals[nIdx + 1], rawNormals[nIdx + 2]);
                        } else {
                            normals.push(0, 1, 0); // Flat UP normal fallback
                        }

                        // UV mapping
                        if (uvIdx && rawTexCoords.length > 0) {
                            const tIdx = (uvIdx > 0 ? uvIdx - 1 : rawTexCoords.length / 2 + uvIdx) * 2;
                            texCoords.push(rawTexCoords[tIdx], rawTexCoords[tIdx + 1]);
                        } else {
                            texCoords.push(0, 0);
                        }

                        // Inject current material color
                        colors.push(currentColor[0], currentColor[1], currentColor[2], 1.0);

                        idx = vertexIndexCounter++;
                        vertexCache[vertexStr] = idx;
                    }
                    faceIndices.push(idx);
                }

                // Triangulate polygons
                if (faceIndices.length === 3) {
                    indices.push(faceIndices[0], faceIndices[1], faceIndices[2]);
                } else if (faceIndices.length === 4) {
                    indices.push(faceIndices[0], faceIndices[1], faceIndices[2]);
                    indices.push(faceIndices[0], faceIndices[2], faceIndices[3]);
                } else {
                    for (let j = 1; j < faceIndices.length - 1; j++) {
                        indices.push(faceIndices[0], faceIndices[j], faceIndices[j + 1]);
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            texCoords: new Float32Array(texCoords),
            indices: new Uint32Array(indices)
        };
    }

    /**
     * Map material names to stylized low-poly diffuse colors
     */
    static getColorForMaterial(matName) {
        const name = matName.toLowerCase();

        // Check exact MTL-defined color first
        if (ObjParser._customColors[name]) {
            return ObjParser._customColors[name];
        }

        // Wood, bark and trunks
        if (name.includes('bark') || name.includes('trunk') || name.includes('wood') || name.includes('branch')) {
            if (name.includes('birch')) return [0.78, 0.74, 0.70]; // White birch bark
            if (name.includes('palm')) return [0.55, 0.38, 0.22];  // Tropical palm trunk
            return [0.45, 0.30, 0.18]; // Warm forest brown
        }
        
        // Leaves and foliage
        if (name.includes('leaves') || name.includes('leaf') || name.includes('foliage') || name.includes('needle')) {
            if (name.includes('maple')) return [0.76, 0.26, 0.12]; // Golden/Orange maple autumn leaf
            if (name.includes('birch')) return [0.28, 0.58, 0.24]; // Lush birch green
            if (name.includes('pine')) return [0.12, 0.38, 0.18];  // Deep pine green
            if (name.includes('palm')) return [0.16, 0.58, 0.20];  // Tropical palm green
            return [0.22, 0.50, 0.24]; // Standard green
        }

        // Flowers and petal decorations
        if (name.includes('flower') || name.includes('petal') || name.includes('blossom')) {
            if (name.includes('yellow')) return [0.92, 0.82, 0.15];
            if (name.includes('red')) return [0.88, 0.15, 0.22];
            return [0.85, 0.25, 0.52]; // Pink/magenta petals
        }

        // Rocks, boulders and stones
        if (name.includes('rock') || name.includes('stone') || name.includes('boulder') || name.includes('cliff') || name.includes('gravel')) {
            return [0.52, 0.52, 0.55]; // Granite gray
        }

        // Ground cover, grass and plants
        if (name.includes('grass') || name.includes('stem') || name.includes('plant') || name.includes('shrub') || name.includes('clover')) {
            return [0.38, 0.68, 0.28]; // Bright grass green
        }

        return [0.6, 0.6, 0.6]; // Fallback gray
    }
}
