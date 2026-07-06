import { DriftingDebris } from '../entities/DriftingDebris.js';
import { getDebrisDef, getWeightedRandomDebrisType, randomInRange } from './DebrisDatabase.js';
import { getResourceDef } from './ResourceDatabase.js';

/**
 * DebrisManager - Orchestrates ocean debris spawning, drifting, pickup, and respawning.
 * 
 * Maintains a pool of DriftingDebris entities:
 *   - Spawns debris at random ocean positions outside the island
 *   - Updates drift movement + animations each frame
 *   - Handles player pickup via E key (reuses Inventory + notification UI)
 *   - Removes expired/collected debris and spawns replacements
 */
export class DebrisManager {
    /**
     * @param {object} [config] - Optional configuration overrides
     * @param {number} [config.maxDebris=6] - Maximum simultaneous debris in the world
     * @param {number} [config.spawnInterval=4] - Base seconds between spawn attempts
     * @param {number} [config.spawnRadiusMin=28] - Minimum spawn distance from center
     * @param {number} [config.spawnRadiusMax=40] - Maximum spawn distance from center
     */
    constructor(config = {}) {
        /** @type {DriftingDebris[]} Active debris entities */
        this.debris = [];

        /** @type {DriftingDebris|null} Nearest pickable debris to the player */
        this.nearestPickable = null;

        // Configuration
        this.maxDebris = config.maxDebris || 15;
        this.spawnInterval = config.spawnInterval || 2.0;
        this.spawnRadiusMin = config.spawnRadiusMin || 50;
        this.spawnRadiusMax = config.spawnRadiusMax || 68;

        // Spawn timer state
        this._spawnTimer = 2.0; // Initial delay before first spawn wave
        this._initialSpawnDone = false;

        // Pickup notification state (reuses existing UI elements)
        this._notificationTimer = 0;
        this._notificationDuration = 2.0;

        // GL context reference (set on first spawn)
        this._gl = null;
    }

    /**
     * Generate a random spawn position in the ocean (outside island radius)
     * @returns {number[]} [x, y, z]
     */
    _getRandomOceanPosition() {
        const angle = Math.random() * Math.PI * 2;
        const radius = this.spawnRadiusMin + Math.random() * (this.spawnRadiusMax - this.spawnRadiusMin);

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 0.15; // Water surface level

        return [x, y, z];
    }

    /**
     * Spawn a single debris entity at a random ocean position
     * @param {WebGL2RenderingContext} gl
     * @returns {DriftingDebris|null}
     */
    _spawnDebris(gl) {
        if (this.debris.length >= this.maxDebris) return null;

        const typeId = getWeightedRandomDebrisType();
        const def = getDebrisDef(typeId);
        if (!def) return null;

        const pos = this._getRandomOceanPosition();
        const debris = new DriftingDebris(gl, def, pos);

        this.debris.push(debris);
        return debris;
    }

    /**
     * Initial spawn wave — fill up to maxDebris with staggered positions
     * @param {WebGL2RenderingContext} gl
     */
    _initialSpawn(gl) {
        const count = this.maxDebris;
        for (let i = 0; i < count; i++) {
            this._spawnDebris(gl);
        }
        this._initialSpawnDone = true;
        console.log(`DebrisManager: Initial spawn — ${this.debris.length} debris in ocean`);
    }

    /**
     * Per-frame update: spawn, drift, animate, detect pickup, cleanup
     * @param {number} deltaTime
     * @param {Float32Array} playerPosition
     * @param {object} inventory - Inventory instance
     * @param {object} inputManager - InputManager for key detection
     * @param {object} terrain - Terrain for height sampling
     * @param {WebGL2RenderingContext} gl - WebGL context for creating new meshes
     * @param {object|null} resourcePickable - If a WorldResource is in pickup range, debris pickup is deferred
     */
    update(deltaTime, playerPosition, inventory, inputManager, terrain, gl, resourcePickable = null) {
        // Store GL reference
        if (gl) this._gl = gl;

        // Initial spawn on first update
        if (!this._initialSpawnDone && this._gl) {
            this._initialSpawn(this._gl);
        }

        this.nearestPickable = null;
        let nearestDist = Infinity;

        // Update all active debris
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];

            // Remove collected or expired debris
            if (d.shouldRemove()) {
                d.delete();
                this.debris.splice(i, 1);
                continue;
            }

            // Drift + animate
            d.update(deltaTime, terrain);

            // Check proximity for pickup
            if (d.canPickup(playerPosition)) {
                const dist = d.distanceTo(playerPosition);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    this.nearestPickable = d;
                }
            }
        }

        // If a WorldResource is in pickup range, defer to ResourceManager
        if (resourcePickable) {
            this._updatePickupHint(null);
        } else {
            // Show/hide pickup hint
            this._updatePickupHint(this.nearestPickable);

            // Handle pickup on E key press
            if (this.nearestPickable && inputManager && inputManager.isKeyPressed('KeyE')) {
                this._pickupDebris(this.nearestPickable, inventory);
            }
        }

        // Spawn timer — replenish debris pool
        if (this.debris.length < this.maxDebris && this._gl) {
            this._spawnTimer -= deltaTime;
            if (this._spawnTimer <= 0) {
                this._spawnDebris(this._gl);
                // Randomize next spawn interval slightly
                this._spawnTimer = this.spawnInterval + (Math.random() - 0.5) * 2;
            }
        }

        // Update notification timer
        if (this._notificationTimer > 0) {
            this._notificationTimer -= deltaTime;
            if (this._notificationTimer <= 0) {
                this._hideNotification();
            }
        }
    }

    /**
     * Execute pickup: add resource to inventory, mark collected, show notification
     * @param {DriftingDebris} debris
     * @param {object} inventory
     */
    _pickupDebris(debris, inventory) {
        const def = debris.debrisDef;
        const gives = def.gives;

        const equipped = inventory.getEquippedItem();
        const hasAxe = equipped && equipped.id === 'stone_axe';
        const finalAmount = gives.amount * (hasAxe ? 2 : 1);

        // Add the mapped resource to inventory
        inventory.addItem(gives.resourceId, finalAmount);

        // Mark as collected (will be cleaned up next frame)
        debris.collect();

        // Show pickup notification
        this._showNotification(def, gives, hasAxe);

        console.log(`DebrisManager: Picked up ${def.name} → +${finalAmount} ${gives.resourceId} (hasAxe: ${hasAxe})`);
    }

    /**
     * Show/hide pickup hint near the closest debris.
     * Only shows debris hint if ResourceManager's nearestPickable is null
     * (resource hints take priority, debris is secondary).
     * Uses a data attribute to track ownership of the hint element.
     * @param {DriftingDebris|null} nearestDebris
     */
    _updatePickupHint(nearestDebris) {
        const hintEl = document.getElementById('pickup-hint');
        if (!hintEl) return;

        if (nearestDebris) {
            const def = nearestDebris.debrisDef;
            const gives = def.gives;
            const resDef = getResourceDef(gives.resourceId);
            const resourceName = resDef ? resDef.name : gives.resourceId;
            hintEl.innerHTML = `<span class="hint-key">E</span> Nhặt ${def.icon} ${def.name} <span class="hint-gives">(+${gives.amount} ${resourceName})</span>`;
            hintEl.classList.remove('hidden');
            hintEl.dataset.hintOwner = 'debris';
        } else if (hintEl.dataset.hintOwner === 'debris') {
            // Only hide if we were the one showing the hint
            hintEl.classList.add('hidden');
            delete hintEl.dataset.hintOwner;
        }
    }

    /**
     * Show a toast notification for a picked up debris
     * @param {object} debrisDef
     * @param {object} gives - { resourceId, amount }
     */
    _showNotification(debrisDef, gives, hasAxe = false) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        const resDef = getResourceDef(gives.resourceId);
        const resourceName = resDef ? resDef.name : gives.resourceId;
        const finalAmount = gives.amount * (hasAxe ? 2 : 1);
        const axeMultiplierText = hasAxe ? ' (Rìu Đá x2!)' : '';

        el.innerHTML = `${debrisDef.icon} ${debrisDef.name} → +${finalAmount} ${resourceName}${axeMultiplierText}`;
        el.classList.remove('hidden');
        el.classList.remove('animate-out');

        // Force reflow for animation restart
        void el.offsetWidth;
        el.classList.add('animate-in');

        this._notificationTimer = this._notificationDuration;
    }

    /**
     * Hide the pickup notification
     */
    _hideNotification() {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        el.classList.remove('animate-in');
        el.classList.add('animate-out');

        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('animate-out');
        }, 300);
    }

    /**
     * Draw all active debris entities
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode
     */
    drawAll(shaderProgram, drawMode) {
        for (const d of this.debris) {
            d.draw(shaderProgram, drawMode);
        }
    }

    /**
     * Clean up all debris and GPU resources
     */
    delete() {
        for (const d of this.debris) {
            d.delete();
        }
        this.debris = [];
        this.nearestPickable = null;
    }
}
