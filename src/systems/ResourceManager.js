import { WorldResource } from '../entities/WorldResource.js';
import { ResourceDatabase, getResourceDef, getWeightedRandomType, getAllResources } from './ResourceDatabase.js';

/**
 * ResourceManager - Orchestrates world resource spawning, pickup detection, and UI feedback.
 */
export class ResourceManager {
    constructor() {
        /** @type {WorldResource[]} Active resources in the world */
        this.worldResources = [];

        /** @type {WorldResource|null} The nearest pickable resource to the player */
        this.nearestPickable = null;

        // Pickup notification state
        this._notificationTimer = 0;
        this._notificationDuration = 2.0; // seconds
    }

    /**
     * Spawn a specific resource at a world position
     * @param {WebGL2RenderingContext} gl
     * @param {string} resourceId - Resource type ID from ResourceDatabase
     * @param {number} x - World X position
     * @param {number} z - World Z position
     * @param {object} terrain - Terrain entity for height sampling
     */
    spawnResource(gl, resourceId, x, z, terrain) {
        const def = getResourceDef(resourceId);
        if (!def) {
            console.warn(`ResourceManager: Unknown resource type '${resourceId}'`);
            return null;
        }

        // Sample terrain height at spawn position
        let y = 0;
        if (terrain) {
            y = terrain.getHeight(x, z);
        }

        // Only spawn on land (above water level)
        if (y < 0.1) return null;

        // Offset Y so the resource floats slightly above ground
        y += def.meshScale[1] * 0.5 + 0.3;

        const resource = new WorldResource(gl, def, [x, y, z]);
        this.worldResources.push(resource);
        return resource;
    }

    /**
     * Spawn a batch of random resources across the island
     * @param {WebGL2RenderingContext} gl
     * @param {object} terrain
     * @param {number} count - Target number of resources to spawn
     */
    spawnRandomResources(gl, terrain, count = 30) {
        const islandRadius = 42.0; // Match player boundary limit from Player.js
        let spawned = 0;
        let attempts = 0;
        const maxAttempts = count * 5; // Prevent infinite loops

        while (spawned < count && attempts < maxAttempts) {
            attempts++;

            // Random position within island bounds
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * islandRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Check terrain height - only spawn on elevated land
            if (terrain) {
                const h = terrain.getHeight(x, z);
                if (h < 0.15) continue; // Skip water/beach areas
            }

            // Avoid spawning too close to player start position [0, 0]
            const distFromCenter = Math.sqrt(x * x + z * z);
            if (distFromCenter < 3.0) continue;

            // Avoid spawning too close to other resources
            let tooClose = false;
            for (const existing of this.worldResources) {
                const dx = existing.position[0] - x;
                const dz = existing.position[2] - z;
                if (dx * dx + dz * dz < 4.0) { // Min 2m apart
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const typeId = getWeightedRandomType();
            const result = this.spawnResource(gl, typeId, x, z, terrain);
            if (result) spawned++;
        }

        console.log(`ResourceManager: Spawned ${spawned}/${count} resources (${attempts} attempts)`);
    }

    /**
     * Per-frame update: animate resources, detect nearest pickable, handle pickup
     * @param {number} deltaTime
     * @param {Float32Array} playerPosition
     * @param {object} inventory - Inventory instance
     * @param {object} inputManager - InputManager for key detection
     */
    update(deltaTime, playerPosition, inventory, inputManager) {
        this.nearestPickable = null;
        let nearestDist = Infinity;

        // Update all active resources
        for (let i = this.worldResources.length - 1; i >= 0; i--) {
            const resource = this.worldResources[i];

            if (resource.isCollected) {
                // Clean up collected resources
                resource.delete();
                this.worldResources.splice(i, 1);
                continue;
            }

            // Animate
            resource.update(deltaTime);

            // Check proximity for pickup
            if (resource.canPickup(playerPosition)) {
                const dist = resource.distanceTo(playerPosition);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    this.nearestPickable = resource;
                }
            }
        }

        // Show/hide pickup hint in the UI
        this._updatePickupHint(this.nearestPickable);

        // Handle pickup on E key press
        if (this.nearestPickable && inputManager && inputManager.isKeyPressed('KeyE')) {
            this._pickupResource(this.nearestPickable, inventory);
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
     * Execute pickup: add to inventory, mark collected, show notification
     */
    _pickupResource(resource, inventory) {
        const def = resource.resourceDef;

        const equipped = inventory.getEquippedItem();
        const hasAxe = equipped && equipped.id === 'stone_axe';
        const amount = hasAxe ? 2 : 1;

        // Add to inventory
        inventory.addItem(resource.resourceId, amount);

        // Mark as collected (will be cleaned up next frame)
        resource.collect();

        // Show pickup notification
        this._showNotification(def, hasAxe);

        console.log(`ResourceManager: Picked up ${def.name} (${def.nameEn}) (x${amount})`);
    }

    /**
     * Show pickup hint near the closest resource
     */
    _updatePickupHint(nearestResource) {
        const hintEl = document.getElementById('pickup-hint');
        if (!hintEl) return;

        if (nearestResource) {
            const def = nearestResource.resourceDef;
            hintEl.innerHTML = `<span class="hint-key">E</span> Nhặt ${def.icon} ${def.name}`;
            hintEl.classList.remove('hidden');
        } else {
            hintEl.classList.add('hidden');
        }
    }

    /**
     * Show a toast notification for a picked up resource
     */
    _showNotification(resourceDef, hasAxe = false) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        const axeMultiplierText = hasAxe ? ' (Rìu Đá x2!)' : '';
        const amountText = hasAxe ? '+2' : '+1';

        el.innerHTML = `${resourceDef.icon} ${amountText} ${resourceDef.name}${axeMultiplierText}`;
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

        // After animation ends, hide fully
        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('animate-out');
        }, 300);
    }

    /**
     * Draw all active world resources
     * @param {ShaderProgram} shaderProgram
     * @param {number} drawMode
     */
    drawAll(shaderProgram, drawMode) {
        for (const resource of this.worldResources) {
            resource.draw(shaderProgram, drawMode);
        }
    }

    /**
     * Clean up all resources
     */
    delete() {
        for (const resource of this.worldResources) {
            resource.delete();
        }
        this.worldResources = [];
        this.nearestPickable = null;
    }
}
