import { Entity } from './Entity.js';
import { Mesh } from '../renderer/Mesh.js';
import { Vec3 } from '../math/Vec3.js';
import { randomInRange } from '../systems/DebrisDatabase.js';
import { WaveField } from '../shaders/WaterWaves.js';

/**
 * DriftingDebris - A collectible debris entity that spawns in the ocean
 * and drifts toward the island shore.
 * 
 * Lifecycle:
 *   1. Spawns at random position in the ocean (outside island radius)
 *   2. Drifts toward island center each frame
 *   3. When reaching shore (terrain height > threshold), stops drifting
 *   4. Expires after lifetime countdown → marked for removal
 *   5. Can be collected by the player at any point while alive
 */
export class DriftingDebris extends Entity {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} debrisDef - Definition from DebrisDatabase
     * @param {number[]} spawnPos - [x, y, z] initial ocean position
     */
    constructor(gl, debrisDef, spawnPos, mesh = null, meshScale = 1) {
        super();
        this.gl = gl;
        this.debrisDef = debrisDef;
        this.debrisId = debrisDef.id;

        // Set initial position
        Vec3.set(this.position, spawnPos[0], spawnPos[1], spawnPos[2]);

        // Use a detailed OBJ mesh when supplied, otherwise fall back to a colored cube
        if (mesh) {
            this.useModel = true;
            this.mesh = mesh;
            Vec3.set(this.scale, meshScale, meshScale, meshScale);
        } else {
            this.useModel = false;
            // Set scale from definition
            Vec3.set(this.scale,
                debrisDef.meshScale[0],
                debrisDef.meshScale[1],
                debrisDef.meshScale[2]
            );

            // Build the colored cube fallback mesh
            const [r, g, b] = debrisDef.color;
            this.mesh = new Mesh(gl, this._createCubeData(r, g, b));
        }

        // --- Drift movement ---
        // Direction toward island center (0, 0) with slight random offset for natural feel
        const toCenter = Vec3.create(-spawnPos[0], 0, -spawnPos[2]);
        Vec3.normalize(toCenter, toCenter);

        // Add slight angular deviation (±15 degrees)
        const deviationAngle = (Math.random() - 0.5) * 0.52; // ~±15°
        const cosA = Math.cos(deviationAngle);
        const sinA = Math.sin(deviationAngle);
        this.driftDirection = Vec3.create(
            toCenter[0] * cosA - toCenter[2] * sinA,
            0,
            toCenter[0] * sinA + toCenter[2] * cosA
        );

        this.driftSpeed = randomInRange(debrisDef.driftSpeed);

        // --- Lifetime ---
        this.lifetime = randomInRange(debrisDef.lifetime);
        this.age = 0;

        // --- Animation state ---
        this.animTime = Math.random() * Math.PI * 2; // Random phase
        this.rotSpeed = 0.6 + Math.random() * 0.4;

        // How far the hull leans out of the wave's own slope. Light debris sits
        // flatter on the water than heavy debris, so this varies per item.
        this.tiltResponse = 1.6 + Math.random() * 0.8;

        // Scratch buffer for the wave slope lookup, so drifting debris does not
        // allocate an array per item per frame.
        this._slope = [0, 0];

        // --- State flags ---
        this.isCollected = false;
        this.isExpired = false;
        this.isOnShore = false; // True when reached land

        // Water surface Y level (slightly above 0 for visibility)
        this.waterY = 0.15;

        this.updateModelMatrix();
    }

    /**
     * Per-frame update: drift, animate, check shore arrival, count lifetime
     * @param {number} deltaTime
     * @param {object} terrain - Terrain for height sampling
     */
    update(deltaTime, terrain) {
        if (this.isCollected || this.isExpired) return;

        // Count lifetime
        this.age += deltaTime;
        if (this.age >= this.lifetime) {
            this.isExpired = true;
            return;
        }

        this.animTime += deltaTime;

        // --- Drift movement (only while in water) ---
        if (!this.isOnShore) {
            const moveX = this.driftDirection[0] * this.driftSpeed * deltaTime;
            const moveZ = this.driftDirection[2] * this.driftSpeed * deltaTime;
            this.position[0] += moveX;
            this.position[2] += moveZ;

            // Check if reached shore
            if (terrain) {
                const terrainHeight = terrain.getHeight(this.position[0], this.position[2]);
                if (terrainHeight > 0.1) {
                    // Arrived at shore — stop drifting, rest on beach
                    this.isOnShore = true;
                    // OBJ models are normalized with their base at y=0
                    this.position[1] = terrainHeight + (this.useModel ? 0.02 : this.debrisDef.meshScale[1] * 0.5 + 0.05);
                }
            }
        }

        // --- Animation ---
        if (this.isOnShore) {
            // On shore: very subtle bob, no drift
            this.rotation[1] = this.animTime * this.rotSpeed * 0.1;
        } else {
            // Float on the real ocean surface. This used to be a private sine
            // at its own frequency, which left debris visibly out of phase with
            // the water directly underneath it.
            const x = this.position[0];
            const z = this.position[2];
            this.position[1] = this.waterY + WaveField.heightAt(x, z);

            // Slow Y-axis rotation
            const yaw = this.animTime * this.rotSpeed;
            this.rotation[1] = yaw;

            // Lie along the wave face: the surface slope *is* the tilt. Pitch
            // and roll are applied after yaw (see Entity.updateModelMatrix), so
            // project the world slope onto the yawed axes first.
            WaveField.slopeAt(x, z, this._slope);
            const cy = Math.cos(yaw);
            const sy = Math.sin(yaw);
            const slopeAlongX = this._slope[0] * cy - this._slope[1] * sy;
            const slopeAlongZ = this._slope[0] * sy + this._slope[1] * cy;
            this.rotation[0] = -slopeAlongZ * this.tiltResponse;
            this.rotation[2] = slopeAlongX * this.tiltResponse;
        }

        this.updateModelMatrix();
    }

    /**
     * Check if the player is within pickup range
     * @param {Float32Array} playerPosition
     * @returns {boolean}
     */
    canPickup(playerPosition) {
        if (this.isCollected || this.isExpired) return false;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const distSq = dx * dx + dz * dz;
        const radiusSq = this.debrisDef.pickupRadius * this.debrisDef.pickupRadius;

        return distSq <= radiusSq;
    }

    /**
     * Get horizontal XZ distance to a target position
     * @param {Float32Array} targetPos
     * @returns {number}
     */
    distanceTo(targetPos) {
        const dx = targetPos[0] - this.position[0];
        const dz = targetPos[2] - this.position[2];
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Mark this debris as collected
     */
    collect() {
        this.isCollected = true;
    }

    /**
     * Check if this debris should be removed (collected or expired)
     * @returns {boolean}
     */
    shouldRemove() {
        return this.isCollected || this.isExpired;
    }

    /**
     * Get remaining lifetime as a 0-1 fraction (for potential fade-out effects)
     * @returns {number}
     */
    getLifetimeFraction() {
        return Math.max(0, 1 - this.age / this.lifetime);
    }

    /**
     * Draw this debris using the provided shader
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode
     */
    draw(shaderProgram, drawMode) {
        if (!this.mesh || this.isCollected || this.isExpired) return;

        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
    }

    /**
     * Free GPU resources
     */
    delete() {
        // Only free the mesh if it is a per-instance cube (OBJ meshes are
        // shared and owned by AssetManager, so we must not delete them here)
        if (this.mesh && !this.useModel) {
            this.mesh.delete();
        }
        this.mesh = null;
    }

    /**
     * Generate standard 24-vertex cube geometry with a solid color
     */
    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            // Back face
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            // Bottom face
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
            // Right face
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            // Left face
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
            // Front
             0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,
            // Back
             0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,
            // Top
             0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,
            // Bottom
             0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,
            // Right
             1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,
            // Left
            -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0,
        ]);

        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i * 4] = r;
            colors[i * 4 + 1] = g;
            colors[i * 4 + 2] = b;
            colors[i * 4 + 3] = 1.0;
        }

        const texCoords = new Float32Array([
            // Front
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
            // Back
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Top
            0.0, 1.0,  0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
            // Bottom
            1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
            // Right
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Left
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        ]);

        const indices = new Uint16Array([
            0, 1, 2,      0, 2, 3,    // Front
            4, 5, 6,      4, 6, 7,    // Back
            8, 9, 10,     8, 10, 11,  // Top
            12, 13, 14,   12, 14, 15, // Bottom
            16, 17, 18,   16, 18, 19, // Right
            20, 21, 22,   20, 22, 23  // Left
        ]);

        return { positions, normals, colors, texCoords, indices };
    }
}
