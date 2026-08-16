import { DriftingDebris } from '../entities/DriftingDebris.js';
import { getDebrisDef, getWeightedRandomDebrisType, randomInRange } from './DebrisDatabase.js';
import { getResourceDef } from './ResourceDatabase.js';

export class DebrisManager {
    constructor(assetManager = null, config = {}) {
        this.debris = [];

        this.nearestPickable = null;

        this._assetManager = assetManager;
        this.maxDebris = config.maxDebris || 15;
        this.spawnInterval = config.spawnInterval || 2.0;
        this.spawnRadiusMin = config.spawnRadiusMin || 50;
        this.spawnRadiusMax = config.spawnRadiusMax || 68;

        this._spawnTimer = 2.0;
        this._initialSpawnDone = false;

        this._notificationTimer = 0;
        this._notificationDuration = 2.0;

        this._gl = null;
    }

    _getRandomOceanPosition() {
        const angle = Math.random() * Math.PI * 2;
        const radius = this.spawnRadiusMin + Math.random() * (this.spawnRadiusMax - this.spawnRadiusMin);

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = 0.15;

        return [x, y, z];
    }

    _spawnDebris(gl) {
        if (this.debris.length >= this.maxDebris) return null;

        const typeId = getWeightedRandomDebrisType();
        const def = getDebrisDef(typeId);
        if (!def) return null;

        const pos = this._getRandomOceanPosition();

        let mesh = null;
        let meshScale = 1;
        if (def.modelId && this._assetManager) {
            mesh = this._assetManager.models[def.modelId];
            meshScale = def.modelScale ?? def.meshScale[1];
        }

        const debris = new DriftingDebris(gl, def, pos, mesh, meshScale);

        this.debris.push(debris);
        return debris;
    }

    _initialSpawn(gl) {
        const count = this.maxDebris;
        for (let i = 0; i < count; i++) {
            this._spawnDebris(gl);
        }
        this._initialSpawnDone = true;
        console.log(`DebrisManager: Initial spawn — ${this.debris.length} debris in ocean`);
    }

    update(deltaTime, playerPosition, inventory, inputManager, terrain, gl, resourcePickable = null) {
        if (gl) this._gl = gl;

        if (!this._initialSpawnDone && this._gl) {
            this._initialSpawn(this._gl);
        }

        this.nearestPickable = null;
        let nearestDist = Infinity;

        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];

            if (d.shouldRemove()) {
                d.delete();
                this.debris.splice(i, 1);
                continue;
            }

            d.update(deltaTime, terrain);

            if (d.canPickup(playerPosition)) {
                const dist = d.distanceTo(playerPosition);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    this.nearestPickable = d;
                }
            }
        }

        if (resourcePickable) {
            this._updatePickupHint(null, inputManager);
        } else {
            this._updatePickupHint(this.nearestPickable, inputManager);

            if (this.nearestPickable && inputManager && (inputManager.isActionPressed('interact') || inputManager.isKeyPressed('KeyE'))) {
                this._pickupDebris(this.nearestPickable, inventory);
            }
        }

        if (this.debris.length < this.maxDebris && this._gl) {
            this._spawnTimer -= deltaTime;
            if (this._spawnTimer <= 0) {
                this._spawnDebris(this._gl);
                this._spawnTimer = this.spawnInterval + (Math.random() - 0.5) * 2;
            }
        }

        if (this._notificationTimer > 0) {
            this._notificationTimer -= deltaTime;
            if (this._notificationTimer <= 0) {
                this._hideNotification();
            }
        }
    }

    _pickupDebris(debris, inventory) {
        const def = debris.debrisDef;
        const gives = def.gives;
        const finalAmount = gives.amount;

        const added = inventory.addItem(gives.resourceId, finalAmount);
        if (!added) {
            this._showInventoryFull();
            return;
        }

        debris.collect();

        this._showNotification(def, gives);

        console.log(`DebrisManager: Picked up ${def.name} → +${finalAmount} ${gives.resourceId}`);
    }

    _updatePickupHint(nearestDebris, inputManager) {
        const hintEl = document.getElementById('pickup-hint');
        if (!hintEl) return;

        if (nearestDebris) {
            const def = nearestDebris.debrisDef;
            const gives = def.gives;
            const resDef = getResourceDef(gives.resourceId);
            const resourceName = resDef ? resDef.name : gives.resourceId;
            const keyName = inputManager && inputManager.getBindingDisplayName ? inputManager.getBindingDisplayName('interact') : 'E';
            hintEl.innerHTML = `<span class="hint-key">${keyName}</span> Nhặt ${def.icon} ${def.name} <span class="hint-gives">(+${gives.amount} ${resourceName})</span>`;
            hintEl.classList.remove('hidden');
            hintEl.dataset.hintOwner = 'debris';
        } else if (hintEl.dataset.hintOwner === 'debris') {
            hintEl.classList.add('hidden');
            delete hintEl.dataset.hintOwner;
        }
    }

    _showNotification(debrisDef, gives) {
        const el = document.getElementById('pickup-notification');
        if (!el) return;

        const resDef = getResourceDef(gives.resourceId);
        const resourceName = resDef ? resDef.name : gives.resourceId;

        el.innerHTML = `${debrisDef.icon} ${debrisDef.name} → +${gives.amount} ${resourceName}`;
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
        for (const d of this.debris) {
            d.draw(shaderProgram, drawMode);
        }
    }

    delete() {
        for (const d of this.debris) {
            d.delete();
        }
        this.debris = [];
        this.nearestPickable = null;
    }
}
