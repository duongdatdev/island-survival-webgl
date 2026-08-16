import { WorldResource } from '../entities/WorldResource.js';
import { ResourceDatabase, getResourceDef, getWeightedRandomType, getAllResources } from './ResourceDatabase.js';

const SHORE_HEIGHT = 0.15;
const RESOURCE_BOB_AMPLITUDE = 0.15;

export class ResourceManager {
    constructor(assetManager = null) {
        this._assetManager = assetManager;

        this.worldResources = [];

        this.nearestPickable = null;

        this._notificationTimer = 0;
        this._notificationDuration = 2.0;
    }

    createResourceEntity(gl, resourceDef, worldPos) {
        const model = this._getResourceModel(resourceDef);
        return new WorldResource(gl, resourceDef, worldPos, model);
    }

    _getResourceModel(resourceDef) {
        return resourceDef.modelId && this._assetManager
            ? this._assetManager.getModel(resourceDef.modelId)
            : null;
    }

    getGroundedSpawnY(resourceDef, surfaceY) {
        const model = this._getResourceModel(resourceDef);
        const declaredScale = resourceDef.modelScale ?? 1;
        const scaleY = Array.isArray(declaredScale) ? declaredScale[1] : declaredScale;
        let baseOffset = resourceDef.meshScale[1] * 0.5;

        if (model && Array.isArray(model.targetSize)) {
            baseOffset = model.targetSize[1] * scaleY * 0.5;
        } else if (model && model.bounds && model.bounds.min) {
            baseOffset = -model.bounds.min[1] * scaleY;
        }

        return surfaceY + baseOffset + RESOURCE_BOB_AMPLITUDE;
    }

    spawnResource(gl, resourceId, x, z, terrain, options = {}) {
        const def = getResourceDef(resourceId);
        if (!def) {
            console.warn(`ResourceManager: Unknown resource type '${resourceId}'`);
            return null;
        }

        let y = 0;
        if (terrain) {
            y = terrain.getHeight(x, z);
        }

        if (y < SHORE_HEIGHT) {
            if (!options.allowWater) return null;
            y = SHORE_HEIGHT;
        }

        y = this.getGroundedSpawnY(def, y);

        const resource = this.createResourceEntity(gl, def, [x, y, z]);
        this.worldResources.push(resource);
        return resource;
    }

    spawnRandomResources(gl, terrain, count = 30) {
        const island = terrain && terrain.generator ? terrain.generator.island : null;
        const islandRadius = island ? island.radius : 46.0;
        let spawned = 0;
        let attempts = 0;
        const maxAttempts = count * 5;

        while (spawned < count && attempts < maxAttempts) {
            attempts++;

            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * islandRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            if (terrain) {
                const h = terrain.getHeight(x, z);
                if (h < SHORE_HEIGHT) continue;
            }

            const distFromCenter = Math.sqrt(x * x + z * z);
            if (distFromCenter < 3.0) continue;

            let tooClose = false;
            for (const existing of this.worldResources) {
                const dx = existing.position[0] - x;
                const dz = existing.position[2] - z;
                if (dx * dx + dz * dz < 4.0) {
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

    update(deltaTime, playerPosition, inventory, inputManager) {
        this.nearestPickable = null;
        let nearestDist = Infinity;

        for (let i = this.worldResources.length - 1; i >= 0; i--) {
            const resource = this.worldResources[i];

            if (resource.isCollected) {
                resource.delete();
                this.worldResources.splice(i, 1);
                continue;
            }

            resource.update(deltaTime);

            if (resource.canPickup(playerPosition)) {
                const dist = resource.distanceTo(playerPosition);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    this.nearestPickable = resource;
                }
            }
        }

        this._updatePickupHint(this.nearestPickable, inputManager);

        if (this.nearestPickable && inputManager && (inputManager.isActionPressed('interact') || inputManager.isKeyPressed('KeyE'))) {
            this._pickupResource(this.nearestPickable, inventory);
        }

        if (this._notificationTimer > 0) {
            this._notificationTimer -= deltaTime;
            if (this._notificationTimer <= 0) {
                this._hideNotification();
            }
        }
    }

    _pickupResource(resource, inventory) {
        const def = resource.resourceDef;
        const amount = 1;

        const added = inventory.addItem(resource.resourceId, amount);
        if (!added) {
            this._showInventoryFull();
            return;
        }

        resource.collect();

        this._showNotification(def);

        console.log(`ResourceManager: Picked up ${def.name} (${def.nameEn}) (x${amount})`);
    }

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

    _showNotification(resourceDef) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        el.innerHTML = `${resourceDef.icon} +1 ${resourceDef.name}`;
        el.classList.remove('hidden');
        el.classList.remove('animate-out');

        void el.offsetWidth;
        el.classList.add('animate-in');

        this._notificationTimer = this._notificationDuration;
    }

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

    drawAll(shaderProgram, drawMode) {
        for (const resource of this.worldResources) {
            resource.draw(shaderProgram, drawMode);
        }
    }

    delete() {
        for (const resource of this.worldResources) {
            resource.delete();
        }
        this.worldResources = [];
        this.nearestPickable = null;
    }
}
