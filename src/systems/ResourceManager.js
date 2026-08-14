import { WorldResource } from '../entities/WorldResource.js';
import { ResourceDatabase, getResourceDef, getWeightedRandomType, getAllResources } from './ResourceDatabase.js';

/**
 * Minimum terrain height considered dry land for spawning. Below this is
 * water/beach. Kept as a single constant so land checks stay consistent.
 */
const SHORE_HEIGHT = 0.15;

/**
 * ResourceManager - Orchestrates world resource spawning, pickup detection, and UI feedback.
 */
export class ResourceManager {
    constructor(assetManager = null) {
        // Used to resolve optional detailed models declared by resource defs.
        this._assetManager = assetManager;

        /** @type {WorldResource[]} Active resources in the world */
        this.worldResources = [];

        /** @type {WorldResource|null} The nearest pickable resource to the player */
        this.nearestPickable = null;

        // Pickup notification state
        this._notificationTimer = 0;
        this._notificationDuration = 2.0; // seconds
    }

    /** Create a resource entity with its declared model, if that model loaded. */
    createResourceEntity(gl, resourceDef, worldPos) {
        const model = resourceDef.modelId && this._assetManager
            ? this._assetManager.getModel(resourceDef.modelId)
            : null;
        return new WorldResource(gl, resourceDef, worldPos, model);
    }

    /**
     * Spawn a specific resource at a world position
     * @param {WebGL2RenderingContext} gl
     * @param {string} resourceId - Resource type ID from ResourceDatabase
     * @param {number} x - World X position
     * @param {number} z - World Z position
     * @param {object} terrain - Terrain entity for height sampling
     * @param {object} [options]
     * @param {boolean} [options.allowWater=false] - Spawn even below the shore
     *        line, floating at water level. Used for creature loot, since
     *        crabs die on the beach and sharks die at sea.
     */
    spawnResource(gl, resourceId, x, z, terrain, options = {}) {
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
        if (y < SHORE_HEIGHT) {
            if (!options.allowWater) return null;
            y = SHORE_HEIGHT; // Float the drop at the surface so it stays pickable
        }

        // Offset Y so the resource floats slightly above ground
        y += def.meshScale[1] * 0.5 + 0.3;

        const resource = this.createResourceEntity(gl, def, [x, y, z]);
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
        // Spawn inside the island proper. The radius is procedural (44–47), so
        // read it off the generator instead of assuming one seed's value; the
        // old hardcoded 42 left an unpopulated ring on larger islands.
        const island = terrain && terrain.generator ? terrain.generator.island : null;
        const islandRadius = island ? island.radius : 46.0;
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
                if (h < SHORE_HEIGHT) continue; // Skip water/beach areas
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
        this._updatePickupHint(this.nearestPickable, inputManager);

        // Handle pickup on interact action press
        if (this.nearestPickable && inputManager && (inputManager.isActionPressed('interact') || inputManager.isKeyPressed('KeyE'))) {
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
        const amount = 1;

        // Refuse the pickup when the bag can't hold it, so the resource stays in
        // the world instead of being silently destroyed. addItem returns true
        // only when every unit was stored.
        const added = inventory.addItem(resource.resourceId, amount);
        if (!added) {
            this._showInventoryFull();
            return;
        }

        // Mark as collected (will be cleaned up next frame)
        resource.collect();

        // Show pickup notification
        this._showNotification(def);

        console.log(`ResourceManager: Picked up ${def.name} (${def.nameEn}) (x${amount})`);
    }

    /**
     * Show pickup hint near the closest resource
     */
    _updatePickupHint(nearestResource, inputManager) {
        const hintEl = document.getElementById('pickup-hint');
        if (!hintEl) return;

        if (nearestResource) {
            const def = nearestResource.resourceDef;
            const keyName = inputManager && inputManager.getBindingDisplayName ? inputManager.getBindingDisplayName('interact') : 'E';
            hintEl.innerHTML = `<span class="hint-key">${keyName}</span> Nhặt ${def.icon} ${def.name}`;
            hintEl.classList.remove('hidden');
        } else {
            hintEl.classList.add('hidden');
        }
    }

    /**
     * Show a toast notification for a picked up resource
     */
    _showNotification(resourceDef) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        el.innerHTML = `${resourceDef.icon} +1 ${resourceDef.name}`;
        el.classList.remove('hidden');
        el.classList.remove('animate-out');

        // Force reflow for animation restart
        void el.offsetWidth;
        el.classList.add('animate-in');

        this._notificationTimer = this._notificationDuration;
    }

    /**
     * Toast shown when a pickup is refused because the inventory is full.
     */
    _showInventoryFull() {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        el.innerHTML = '❌ Túi đồ đã đầy!';
        el.classList.remove('hidden');
        el.classList.remove('animate-out');
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
