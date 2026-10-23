import { Mat4 } from '../math/Mat4.js';
import { CharacterRenderer } from '../characters/CharacterRenderer.js';
import { getResourceDef } from '../systems/ResourceDatabase.js';
import { CreatureState } from '../entities/Creature.js';
import { Crab } from '../entities/Crab.js';
import { Boar } from '../entities/Boar.js';
import { Shark } from '../entities/Shark.js';
import { Seagull } from '../entities/Seagull.js';
import { DriftingDebris } from '../entities/DriftingDebris.js';
import { getDebrisDef } from '../systems/DebrisDatabase.js';
import { projectWorldPoint } from '../renderer/WorldSpaceUI.js';
import { sharedFromSnapshot, personalFromSnapshot, snapshotFromState, diffShared, applyChanges } from './WorldSync.js';

export class MultiplayerSession {
    constructor(scene, client) {
        this.scene = scene; this.client = client;
        scene.debrisManager.networkSession = this;
        this.shared = client.welcome.shared;
        this.ready = !!this.shared;
        this.seq = 0; this.nextDrop = 0;
        this.elapsed = 0; this.poseElapsed = 0;
        this.animals = new Map();
        this.environment = new Map(scene.environmentEntities.map(entity => [entity.worldObjectId, entity]));
        this.environmentColliders = new Map(scene.environmentEntities.map(entity => [entity.worldObjectId, { ...entity.collider }]));
        const counts = {};
        for (const animal of scene.creatures) {
            // Constructor names are minified in production; wire identifiers must stay stable.
            const type = animal instanceof Crab ? 'crab' : animal instanceof Boar ? 'boar'
                : animal instanceof Shark ? 'shark' : animal instanceof Seagull ? 'seagull' : animal.species;
            const id = animal.campaignId || type + '-' + (counts[type] = (counts[type] || 0) + 1);
            animal.netId = id; this.animals.set(id, animal);
        }
        for (const [i, resource] of scene.resourceManager.worldResources.entries()) resource.netId ||= this.shared ? this.matchResource(resource) : `initial-${i}`;
        this.personal = personalFromSnapshot(this.capture());
        this.hud = document.createElement('div'); this.hud.className = 'network-hud'; this.hud.id = 'network-hud';
        this.hud.setAttribute('role', 'status'); this.hud.setAttribute('aria-live', 'polite');
        this.hud.setAttribute('aria-atomic', 'true');
        document.body.append(this.hud);
        this.matrix = Mat4.create();
        // Campaign hides the local body by replacing its draw method. Peers need
        // their own renderer, while sharing the already loaded character mesh.
        this.remoteRenderer = new CharacterRenderer(scene.characterRenderer.characterDef);
        this.labels = new Map();
        if (!this.ready) {
            const snapshot = this.capture();
            const animals = Object.fromEntries([...this.animals].map(([id, animal]) => ['animal:' + id, this.animalRecord(id, animal)]));
            client.send({ type: 'initialize', snapshot, animals });
            this.pendingSince = Date.now();
        } else {
            this.applyWorld(this.shared, Object.keys(this.shared), true);
        }
        this.showHUD();
        this.onPageHide = () => {
            if (this.ready && !this.pending && !this.client.closed) this.flush();
        };
        window.addEventListener('pagehide', this.onPageHide);
    }

    get isLeader() { return this.client.leader === this.client.id; }
    targetFor(animal) {
        let target = this.scene.player.position;
        let distance = Math.hypot(target[0] - animal.position[0], target[2] - animal.position[2]);
        for (const peer of this.client.peers.values()) {
            if (!peer.pose || peer.pose.dead) continue;
            const p = peer.pose.position, d = Math.hypot(p[0] - animal.position[0], p[2] - animal.position[2]);
            if (d < distance) { target = p; distance = d; }
        }
        return target;
    }
    matchResource(resource) {
        return Object.entries(this.shared).find(([key, r]) => key.startsWith('resource:') && r.id === resource.resourceId
            && Math.abs(r.position[0] - resource.position[0]) < 0.01 && Math.abs(r.position[2] - resource.position[2]) < 0.01)?.[1].netId
            || `drop-${this.client.id}-${++this.nextDrop}`;
    }

    capture() {
        const snapshot = this.scene.saveController.capture();
        snapshot.resources = this.scene.resourceManager.worldResources.filter(r => !r.isCollected).map(r => {
            r.netId ||= `drop-${this.client.id}-${++this.nextDrop}`;
            return { id: r.resourceId, netId: r.netId, position: [r.position[0], r.baseY, r.position[2]],
                rewardType: r.rewardType || null, ...(r.worldNodeId ? { worldNodeId: r.worldNodeId, amount: r.amount || 1 } : {}) };
        });
        return snapshot;
    }

    animalRecord(id, animal) {
        return { id, position: Array.from(animal.position), yaw: animal.rotation[1], health: Math.max(0, animal.health),
            state: animal.state, orbit: Number.isFinite(animal._circleRadius)
                ? [animal._circleCenterX, animal._circleCenterZ, animal._circleRadius, animal._circleAngle, animal._circleHeight] : null };
    }

    captureShared(snapshot) {
        const shared = sharedFromSnapshot(snapshot);
        if (!this.isLeader) shared.clock = this.shared.clock;
        for (const [key, value] of Object.entries(this.shared)) if (key.startsWith('animal:')) shared[key] = value;
        for (const [id, animal] of this.animals) {
            const key = 'animal:' + id, record = this.animalRecord(id, animal);
            if (!this.isLeader && this.shared[key]) {
                const previous = this.shared[key];
                shared[key] = { ...previous, health: record.health,
                    state: record.health <= 0 ? CreatureState.DEAD : previous.state };
            } else shared[key] = record;
        }
        for (const d of this.scene.debrisManager.debris) {
            if (d.isCollected || d.isExpired) continue;
            d.netId ||= `drift-${this.client.id}-${++this.nextDrop}`;
            if (d.isHooked && !d.netHookOwner) d.netHookOwner = this.client.id;
            const key = 'debris:' + d.netId;
            const record = { netId: d.netId, type: d.debrisId, position: Array.from(d.position),
                direction: Array.from(d.driftDirection), speed: d.driftSpeed, age: d.age, lifetime: d.lifetime,
                yaw: d.rotation[1], onShore: d.isOnShore, hooked: !!d.isHooked, owner: d.isHooked ? d.netHookOwner : null };
            if (!this.isLeader && this.shared[key]) {
                shared[key] = { ...this.shared[key], hooked: record.hooked, owner: record.owner,
                    ...(record.owner === this.client.id ? { position: record.position } : {}) };
            } else shared[key] = record;
        }
        return shared;
    }

    flush() {
        if (!this.ready || this.pending || this.client.closed) return;
        const snapshot = this.capture();
        const shared = this.captureShared(snapshot);
        const changes = diffShared(this.shared, shared);
        const personal = personalFromSnapshot(snapshot);
        this.pending = { seq: ++this.seq, personal };
        this.pendingSince = Date.now(); this.elapsed = 0;
        if (!this.client.send({ type: 'commit', seq: this.seq, changes, personal })) this.disconnect();
    }

    update(seconds) {
        if (this.disconnected) return false;
        this.elapsed += seconds; this.poseElapsed += seconds;
        // Submit local edits before applying incoming edits to avoid overwriting an uncommitted pickup.
        if (this.ready && !this.pending && (this.elapsed >= 0.25 || this.client.queue.some(m => m.type === 'changes') || this.saveWaiters?.length)) this.flush();
        for (const message of this.client.queue.splice(0)) {
            if (message.type === 'checkpoint') {
                const request = this.requests?.get(message.request);
                if (request) { clearTimeout(request.timeout); request.resolve(message); this.requests.delete(message.request); }
                continue;
            }
            if (message.type === 'disconnected') { this.disconnect(); return false; }
            if (message.type === 'initialized') {
                this.shared = message.shared; this.ready = true; this.pendingSince = null;
            } else if (message.type === 'changes') {
                this.shared = applyChanges(this.shared, message.changes);
                this.applyWorld(this.shared, message.changes.map(c => c.key));
            } else if (message.type === 'accepted' && message.seq === this.pending?.seq) {
                this.shared = applyChanges(this.shared, message.changes);
                this.personal = this.pending.personal; this.pending = null;
                if (this.saveWaiters?.length && !this.saving) {
                    this.saving = true; this.client.send({ type: 'save', request: this.seq });
                }
            } else if (message.type === 'rejected' && message.seq === this.pending?.seq) {
                this.shared = message.shared; this.pending = null;
                this.restorePersonal(message.personal || this.personal);
                this.personal = message.personal || this.personal;
                this.applyWorld(this.shared, Object.keys(this.shared), true);
                this.scene._showNotification(message.message);
            } else if (message.type === 'saved') {
                this.saving = false;
                for (const waiter of this.saveWaiters || []) { clearTimeout(waiter.timeout); waiter.resolve(true); }
                this.saveWaiters = [];
                this.scene.saveController.setStatus('Đã lưu tiến trình trên server.', false);
            } else if (message.type === 'error') {
                this.scene._showNotification(message.message);
                if (this.pending || !this.ready) { this.disconnect(message.message); return false; }
                for (const waiter of this.saveWaiters || []) { clearTimeout(waiter.timeout); waiter.resolve(false); }
                this.saveWaiters = []; this.saving = false;
            }
        }
        if (this.pendingSince && (!this.ready || this.pending) && Date.now() - this.pendingSince > 12000) {
            this.disconnect('Server không phản hồi giao dịch.'); return false;
        }
        if (this.client.closed) { this.disconnect(); return false; }
        if (this.poseElapsed >= 0.08) {
            this.poseElapsed = 0;
            this.client.send({ type: 'pose', pose: { position: Array.from(this.scene.player.position),
                yaw: this.scene.player.rotation[1], paused: this.scene.isPaused || !!this.scene.campaign?.ui.isOpen || !!this.scene.campaign?.ending.state,
                dead: this.scene._isGameOver } });
            this.showHUD();
        }
        // World edits cannot continue until the current inventory/world transaction is acknowledged.
        return this.ready && !this.pending;
    }

    restorePersonal(personal) {
        const s = this.scene;
        s.inventory.slots = personal.inventory.slots.map(slot => slot ? { ...slot } : null);
        s.inventory.selectedHotbarIndex = personal.inventory.selectedHotbarIndex;
        Object.assign(s.vitals, personal.vitals); Object.assign(s.stats, personal.stats);
        s.vitals._isGameOver = personal.vitals.health <= 0;
        if (!s.campaign) {
            s._isGameOver = s.vitals._isGameOver;
            s.gameoverScreen?.classList.toggle('hidden', !s._isGameOver);
        }
        s.exposure.setState(personal.exposure);
        if (s.campaign && personal.campaign) {
            // Roll back rewards and per-player activities along with inventory, without moving the camera.
            const current = s.campaign.snapshot();
            s.campaign.restore({ ...current, ...personal.campaign, wildlife: undefined });
        }
        s.inventoryController.renderInventory(); s.inventoryController.renderCraftingPanel();
    }

    applyWorld(shared, keys, force = false) {
        const s = this.scene, changed = new Set(keys);
        if (force || keys.some(key => key.startsWith('debris:'))) {
            const desired = new Map(Object.entries(shared).filter(([key]) => key.startsWith('debris:')).map(([, r]) => [r.netId, r]));
            const current = new Map(s.debrisManager.debris.map(d => [d.netId, d]));
            for (const [id, d] of current) if (!desired.has(id)) { d.isExpired = true; d.delete(); }
            s.debrisManager.debris = [...desired].map(([id, record]) => {
                let d = current.get(id);
                if (!d || d.isCollected || d.isExpired) {
                    if (d) d.delete();
                    const def = getDebrisDef(record.type), mesh = s.engine.assets.models[def.modelId] || null;
                    d = new DriftingDebris(s.gl, def, record.position, mesh, def.modelScale ?? def.meshScale[1]);
                }
                d.netId = id; d.position.set(record.position); d.driftDirection.set(record.direction);
                d.driftSpeed = record.speed; d.age = record.age; d.lifetime = record.lifetime;
                d.rotation[1] = record.yaw; d.isOnShore = record.onShore; d.isHooked = record.hooked;
                d.netHookOwner = record.owner; d.isCollected = false; d.isExpired = false; d.updateModelMatrix();
                return d;
            });
            if (desired.size) s.debrisManager._initialSpawnDone = true;
            s.debrisManager.nearestPickable = null;
        }
        if (force || keys.some(k => k.startsWith('resource:'))) {
            const desired = new Map(Object.entries(shared).filter(([key]) => key.startsWith('resource:')).map(([, r]) => [r.netId, r]));
            const existing = new Map();
            for (const r of s.resourceManager.worldResources) {
                if (!desired.has(r.netId)) { r.delete(); continue; }
                existing.set(r.netId, r);
            }
            const resources = [];
            for (const [id, record] of desired) {
                let r = existing.get(id);
                if (!r || r.isCollected) {
                    if (r) r.delete();
                    const definition = getResourceDef(record.id);
                    if (!definition) continue;
                    r = s.resourceManager.createResourceEntity(s.gl, definition, record.position);
                }
                r.netId = id; r.isCollected = false; r.baseY = record.position[1];
                r.worldNodeId = record.worldNodeId; r.amount = record.amount || 1; r.rewardType = record.rewardType;
                resources.push(r);
            }
            s.resourceManager.worldResources = resources; s.resourceManager.nearestPickable = null;
            if (s.campaign) s.campaign.resourceIndexTimer = 0;
        }
        if (force || changed.has('removed')) {
            s.removedEnvironmentObjectIds = new Set(shared.removed);
            for (const [id, entity] of this.environment) {
                const present = s.environmentEntities.includes(entity);
                if (s.removedEnvironmentObjectIds.has(id)) {
                    if (!force && entity.treeState === 'falling' && entity.networkFellOwner === this.client.id) continue;
                    if (present) { s.environmentEntities.splice(s.environmentEntities.indexOf(entity), 1); s.collisionSystem.unregister(entity); }
                } else if (!present || (force && entity.treeState !== 'standing' && entity.isHarvestableTree)) {
                    entity.treeState = entity.isHarvestableTree ? 'standing' : 'none';
                    entity.treeHitsRemaining = entity.isHarvestableTree ? 3 : 0; entity.woodDropsSpawned = false; entity._fallAngle = 0;
                    entity.collider = { ...this.environmentColliders.get(id) };
                    entity.collisionRadius = entity.collider.radius;
                    entity.networkFellOwner = null;
                    const source = s.world.placedObjects[Number(id)];
                    if (source) { entity.position.set(source.position); entity.rotation.set(source.rotation); entity.updateModelMatrix(); }
                    entity._updateCullingBounds?.();
                    if (!present) s.environmentEntities.push(entity);
                    s.collisionSystem.register(entity);
                }
            }
        }
        if (force || changed.has('raft')) Object.assign(s.raftAssembly, shared.raft);
        if (force || changed.has('structures')) for (const key of ['shelter', 'campfire', 'waterCollector']) {
            const entity = s[key], record = shared.structures[key];
            if (!entity || !record) continue;
            const { position, ...fields } = record;
            Object.assign(entity, fields); entity.position.set(position); entity.updateModelMatrix();
        }
        if (force || changed.has('clock')) {
            const clock = shared.clock;
            s.dayNight.timeOfDay = clock.timeOfDay;
            s.weather.currentWeather = clock.weather; s.weather.nextWeather = clock.weather;
            for (const key of ['cloudCover', 'windSpeed', 'rainIntensity']) s.weather[key] = clock[key];
        }
        if (force || changed.has('blueprints')) {
            s.unlockedBlueprints.clear(); for (const id of shared.blueprints) s.unlockedBlueprints.add(id);
        }
        if (s.campaign) {
            const c = s.campaign;
            if (force || changed.has('campaign:towerRepaired')) c.ending.towerRepaired = !!shared['campaign:towerRepaired'];
            if (force || keys.some(k => k.startsWith('progress:') || k.startsWith('fact:'))) {
                const progress = c.progress.snapshot();
                for (const [key, value] of Object.entries(shared)) if (key.startsWith('progress:')) progress[key.slice(9)] = value;
                progress.facts = Object.fromEntries(Object.entries(shared).filter(([k]) => k.startsWith('fact:')).map(([k, v]) => [k.slice(5), v]));
                c.progress.restore(progress);
            }
            for (const field of ['registry', 'production', 'stationCircuit', 'fieldSurvey', 'wreckSalvage', 'mineExtraction', 'islandEvents']) {
                if ((force || changed.has('campaign:' + field)) && shared['campaign:' + field] !== undefined) c[field]?.restore(shared['campaign:' + field]);
            }
            if (force || changed.has('campaign:claimedCaches')) c.claimedCaches = new Set(shared['campaign:claimedCaches']);
            if (force || changed.has('campaign:deathBags') || changed.has('campaign:nextBag')) {
                const saved = c.snapshot();
                // restore creates the ItemContainers used by recover-bag actions.
                c.restore({ ...saved, deathBags: shared['campaign:deathBags'], nextBag: shared['campaign:nextBag'], wildlife: undefined });
            }
            c.refreshCollision(); c.ui.refreshHUD();
        }
        for (const [id, animal] of this.animals) {
            const key = 'animal:' + id, record = shared[key];
            if (!record || (!force && !changed.has(key))) continue;
            animal.health = record.health; animal.position.set(record.position); animal.rotation[1] = record.yaw;
            animal.state = record.health <= 0 ? CreatureState.DEAD : record.state;
            if (record.health > 0 && !s.creatures.includes(animal)) {
                if (!animal.mesh && !animal.modelAsset) animal._buildMesh();
                s.creatures.push(animal); s.collisionSystem.register(animal, true);
            }
            if (record.orbit) [animal._circleCenterX, animal._circleCenterZ, animal._circleRadius, animal._circleAngle, animal._circleHeight] = record.orbit;
            if (s.wildlife) { if (record.health <= 0) s.wildlife.killed.add(id); else s.wildlife.killed.delete(id); }
            animal.updateModelMatrix(); s.collisionSystem.refresh(animal);
        }
        if (force || changed.has('blueprints') || keys.some(k => k.startsWith('campaign:registry'))) {
            s.inventoryController.renderInventory(); s.inventoryController.renderCraftingPanel();
        }
    }

    draw(shader, mode) {
        this.remoteRenderer.mesh = this.scene.characterRenderer.mesh;
        for (const [id, label] of this.labels) if (!this.client.peers.has(id)) { label.remove(); this.labels.delete(id); }
        const viewport = this.scene.gl.canvas.getBoundingClientRect();
        for (const peer of this.client.peers.values()) {
            const pose = peer.pose;
            let label = this.labels.get(peer.id);
            if (!label) {
                label = document.createElement('div'); label.className = 'network-player-label';
                document.body.append(label); this.labels.set(peer.id, label);
            }
            label.hidden = true;
            if (!pose || pose.dead) continue;
            peer.display ||= [...pose.position];
            for (let i = 0; i < 3; i++) peer.display[i] += (pose.position[i] - peer.display[i]) * 0.25;
            Mat4.identity(this.matrix);
            Mat4.translate(this.matrix, this.matrix, [peer.display[0], peer.display[1] - this.scene.player.collider.height / 2, peer.display[2]]);
            Mat4.rotateY(this.matrix, this.matrix, pose.yaw);
            this.remoteRenderer.draw(shader, this.matrix, mode);
            const point = projectWorldPoint(this.scene.camera, peer.display, viewport, this.scene.player.collider.height * 0.75);
            if (point && Math.hypot(...peer.display.map((v, i) => v - this.scene.player.position[i])) < 60) {
                label.textContent = peer.name + (pose.paused ? ' · Đang mở menu' : '');
                label.style.left = point.x + 'px'; label.style.top = point.y + 'px'; label.hidden = false;
            }
        }
    }

    showHUD() {
        const names = [this.client.welcome.players.find(p => p.id === this.client.id)?.name || 'Bạn', ...[...this.client.peers.values()].map(p => p.name)];
        // textContent keeps names from the network out of HTML.
        const text = `Phòng ${this.client.room} · ${names.length}/${this.client.welcome.maxPlayers} người · ${this.client.latency} ms\n${names.join(' · ')}${this.scene.isPaused ? ' · Bạn đang mở menu' : ''}`;
        if (this.hud.textContent !== text) this.hud.textContent = text;
        this.hud.style.whiteSpace = 'pre-line';
    }

    save() {
        if (this.client.closed || this.disconnected) return Promise.resolve(false);
        return new Promise(resolve => {
            const waiter = { resolve, timeout: setTimeout(() => {
                this.saveWaiters = (this.saveWaiters || []).filter(w => w !== waiter);
                this.scene.saveController.setStatus('Server chưa xác nhận lưu. Hãy thử lại.', true); resolve(false);
            }, 10000) };
            (this.saveWaiters ||= []).push(waiter);
            if (!this.pending) this.flush();
        });
    }

    async respawn() {
        const s = this.scene;
        if (this.pending) { s._showNotification('Đang đồng bộ. Hãy thử lại sau giây lát.'); return; }
        s.inventory.slots.fill(null);
        s.vitals.reset(); s.exposure.setState({ warmth: 100, wetness: 0 });
        s._isGameOver = false; s.isEscaping = false; s.isPaused = false;
        const spawn = s.world.spawnPosition || [0, 0, 0];
        s.player.position.set([spawn[0], s.terrain.getHeight(spawn[0], spawn[2]) + s.player.collider.height / 2, spawn[2]]);
        s.player.velocity.fill(0); s.player.updateModelMatrix();
        s.camera._firstUpdate = true; s.camera.setLookAngles?.(0);
        s.victoryScreen?.classList.add('hidden'); s.gameoverScreen?.classList.add('hidden');
        document.getElementById('hotbar-hud')?.classList.remove('hidden');
        s.engine.audio.setDucked(false);
        s.inventoryController.renderInventory();
        this.flush();
    }

    checkpoint(action) {
        if (this.client.closed || this.disconnected) return Promise.resolve({ ok: false });
        const request = 'checkpoint-' + action + '-' + (++this.seq);
        return new Promise(resolve => {
            const timeout = setTimeout(() => { this.requests.delete(request); resolve({ ok: false }); }, 10000);
            (this.requests ||= new Map()).set(request, { timeout, resolve });
            this.client.send({ type: 'checkpoint', request, action });
        });
    }
    async saveCheckpoint() {
        if (!await this.save()) return false;
        return (await this.checkpoint('save')).ok;
    }
    async loadCheckpoint() {
        const result = await this.checkpoint('load');
        return result.ok ? snapshotFromState(this.capture(), this.shared, result.personal) : null;
    }

    disconnect(reason = 'Mất kết nối tới server. Nhân vật đã dừng để bảo vệ tiến trình.') {
        if (this.disconnected) return;
        this.disconnected = true; this.client.close(); this.scene.engine.input.releasePointerLock();
        for (const waiter of this.saveWaiters || []) { clearTimeout(waiter.timeout); waiter.resolve(false); }
        this.saveWaiters = [];
        for (const request of this.requests?.values() || []) { clearTimeout(request.timeout); request.resolve({ ok: false }); }
        this.requests?.clear();
        const overlay = this.disconnectUI = document.createElement('div'); overlay.className = 'network-disconnect';
        overlay.innerHTML = '<section role="alertdialog" aria-modal="true" aria-labelledby="network-lost-title"><h2 id="network-lost-title">Đã ngắt kết nối</h2><p></p><p>Vào lại cùng mã phòng và trình duyệt để tiếp tục nhân vật đã lưu.</p><button type="button">Về menu kết nối</button></section>';
        overlay.querySelector('p').textContent = reason;
        overlay.querySelector('button').onclick = () => this.scene.engine.scenes.switchScene('MainMenu');
        document.body.append(overlay); overlay.querySelector('button').focus();
    }

    dispose() {
        this.remoteRenderer.delete();
        window.removeEventListener('pagehide', this.onPageHide);
        for (const waiter of this.saveWaiters || []) { clearTimeout(waiter.timeout); waiter.resolve(false); }
        this.client.close(); this.hud.remove(); this.disconnectUI?.remove();
        for (const request of this.requests?.values() || []) { clearTimeout(request.timeout); request.resolve({ ok: false }); }
        for (const label of this.labels.values()) label.remove();
        this.scene.engine.networkClient = null;
    }
}
