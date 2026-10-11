import { EndingChallenge } from './EndingChallenge.js';
import { transactCraft } from './ItemContainer.js';
import { Water } from '../entities/Water.js';
import { WaveField } from '../shaders/WaterWaves.js';

const PARTS = { raft_frame: 'framePlaced', barrel_floats: 'floatsPlaced', paddle: 'paddlePlaced', raft_sail: 'sailPlaced', raft_motor: 'motorPlaced' };
export const ENDING_SUPPLIES = { raft: { fresh_water: 6, smoked_meal: 3, repair_kit: 3 },
    rescue: { fresh_water: 4, smoked_meal: 2, repair_kit: 3, wood: 16 } };
export function raftCoursePosition(state, origin, yaw) {
    return [origin[0] + Math.sin(yaw) * state.along + Math.cos(yaw) * state.across, 0.15,
        origin[2] + Math.cos(yaw) * state.along - Math.sin(yaw) * state.across];
}

export class CampaignEndings {
    constructor(controller) {
        this.controller = controller;
        this.scene = controller.scene;
        this.challenge = new EndingChallenge();
        this.towerRepaired = false;
        this.pendingRoute = null;
        this.busy = false;
        this.resultShown = false;
        this.commands = {};
        this.baseWaterMesh = this.scene.water.mesh;
        this.oceanWater = null;
        const world = this.scene.world;
        const beach = world.pois.find(p => p.id === 'wreck_beach').position;
        this.oceanYaw = Math.atan2(beach[0], beach[2]);
        const radius = world.terrainGenerator.island.radius + 10;
        this.oceanOrigin = [Math.sin(this.oceanYaw) * radius, 0.15, Math.cos(this.oceanYaw) * radius];
        this.baseRaftPosition = [beach[0], 0.22, beach[2]];
        this.scene.raftAssembly.draw = () => {};
    }
    get state() { return this.challenge.state; }
    raftPosition() {
        const position = raftCoursePosition(this.state, this.oceanOrigin, this.oceanYaw);
        position[1] += WaveField.heightAt(position[0], position[2]);
        return position;
    }
    requirements(route) {
        const c = this.controller, inventory = this.scene.inventory, raft = this.scene.raftAssembly;
        const missing = [];
        if (c.progress.chapter < 6) missing.push('Hoàn thành chương 5 và tìm vật tư trong xác tàu/kho');
        if (!c.progress.questItems.has('island_coordinates')) missing.push('Tọa độ từ trạm khí tượng');
        if (route === 'raft') {
            for (const [id, label] of [['raft_frame', 'Khung bè'], ['barrel_floats', 'Phao nổi'], ['paddle', 'Mái chèo'], ['raft_sail', 'Buồm']]) if (!raft[PARTS[id]]) missing.push(label + ' chưa lắp');
            if (!inventory.hasItem('compass')) missing.push('La bàn dẫn đường');
        } else if (!this.towerRepaired) missing.push('Radio và máy phát tại tháp chưa được khôi phục');
        for (const [id, count] of Object.entries(ENDING_SUPPLIES[route] || {})) if (!inventory.hasItem(id, count)) missing.push({ id, count, have: inventory.getCount(id) });
        return missing;
    }
    install(id) {
        const property = PARTS[id], raft = this.scene.raftAssembly;
        if (!property || raft[property]) return { ok: false, error: 'Bộ phận đã được lắp hoặc không hợp lệ.' };
        if (id !== 'raft_frame' && !raft.framePlaced) return { ok: false, error: 'Lắp khung bè trước.' };
        if (!this.scene.inventory.removeItem(id, 1)) return { ok: false, error: 'Chưa có bộ phận này trong túi.' };
        raft[property] = true;
        if (raft.isComplete()) this.scene.stats.raftCompleted = 1;
        if (raft.motorPlaced) this.scene.stats.motorInstalled = 1;
        this.controller.saveMilestone();
        return { ok: true };
    }
    repairTower() {
        if (this.towerRepaired) return { ok: false, error: 'Tháp đã được sửa.' };
        if (this.controller.progress.tier < 3 || !this.controller.progress.questItems.has('island_coordinates')) return { ok: false, error: 'Cần công nghệ cấp 3 và tọa độ đảo.' };
        if (!transactCraft([this.scene.inventory], { radio: 1, battery: 2, copper_wire: 6, iron_ingot: 3 }, [])) return { ok: false, error: 'Cần 1 radio, 2 pin, 6 dây đồng và 3 thỏi sắt.' };
        this.towerRepaired = true;
        this.controller.events.emit('deviceRepaired', { id: 'signal_tower' });
        this.controller.saveMilestone();
        return { ok: true };
    }
    async start(route) {
        if (this.busy || this.state || !['raft', 'rescue'].includes(route)) return;
        if (this.requirements(route).length) { this.controller.ui.report('Chưa đủ điều kiện khởi hành.'); return; }
        this.busy = true;
        this.controller.ui.report('Đang lưu checkpoint trước khi khởi hành…');
        let reservedInventory = null, departureSaved = false;
        try {
            const checkpoint = this.scene.saveController.capture();
            const ok = await this.scene.engine.worldRepository.saveWorld(this.scene.activeWorldId, checkpoint, { checkpoint: true });
            if (!ok) throw new Error('Không thể lưu checkpoint. Tiến trình chuẩn bị được giữ nguyên; hãy thử lưu lại.');
            reservedInventory = this.scene.inventory.snapshot();
            if (!transactCraft([this.scene.inventory], ENDING_SUPPLIES[route], [])) { reservedInventory = null; throw new Error('Vật tư đã thay đổi. Chuẩn bị lại trước khi đi.'); }
            this.challenge.start(route, { seed: this.scene.worldSeed, motor: this.scene.raftAssembly.motorPlaced });
            if (!await this.scene.saveController.save(true)) throw new Error('Không thể lưu chuyến đi. Vật tư đã được hoàn lại; hãy thử khởi hành lại.');
            departureSaved = true;
            this.scene.engine.input.setPointerLockEnabled(false);
            this.resultShown = false;
            this.controller.placement = null;
            this.controller.fishing.cancel(); this.controller.hook.cancel(); this.scene.isFishing = false;
            this.controller.ui.close();
            this.controller.ui.hint('');
            this.scene.inventoryController.renderInventory();
        } catch (error) {
            if (reservedInventory && !departureSaved) {
                this.scene.inventory.restore(reservedInventory); this.challenge.state = null;
                this.scene.inventoryController.renderInventory();
            }
            this.controller.ui.report(error.message);
        }
        finally { this.busy = false; }
    }
    command(action) { this.commands[action] = action === 'transmit' ? !this.commands[action] : true; }
    update(seconds) {
        const state = this.state;
        if (!state) return false;
        if (this.busy) return true;
        if (state.route === 'raft') {
            if (!this.oceanWater) this.oceanWater = new Water(this.scene.gl, 128, 1280, null, { innerWidth: 128, outerSegments: 24 });
            this.scene.water.mesh = this.oceanWater.mesh;
        }
        if (state.status !== 'active') {
            if (!this.resultShown) { this.resultShown = true; this.controller.ui.open('ending-result'); this.scene.saveController.save(true); }
            return true;
        }
        const input = this.scene.engine.input;
        this.challenge.update(seconds, {
            steer: Number(input.isActionDown('moveRight')) - Number(input.isActionDown('moveLeft')),
            throttle: input.isActionDown('moveForward'), slow: input.isActionDown('moveBackward'),
            tune: Number(input.isActionDown('moveRight')) - Number(input.isActionDown('moveLeft')),
            transmit: input.isKeyDown('Space') || this.commands.transmit,
            repair: input.isKeyPressed('KeyR') || this.commands.repair,
            refuel: input.isActionPressed('interact') || this.commands.refuel,
        });
        this.commands.repair = this.commands.refuel = false;
        this.controller.playSeconds += seconds;
        this.scene.time += seconds;
        this.scene.survivalSeconds += seconds;
        this.scene.dayNight.update(seconds); this.scene.weather.update(seconds);
        const weather = state.storm ? 'storm' : 'cloudy';
        if (weather !== this.lastWeather) { this.lastWeather = weather; this.scene.weather.forceWeather(weather); }
        this.scene._syncWaveField();
        this.scene.camera.setAspect(this.scene.gl.canvas.width / this.scene.gl.canvas.height);
        if (state.route === 'raft') {
            const position = this.raftPosition();
            this.scene.player.position.set([position[0], position[1] + 1.1, position[2]]);
            const heading = this.oceanYaw + state.heading;
            this.scene.camera.setCutsceneView([position[0] - Math.sin(heading) * 6, 3.2, position[2] - Math.cos(heading) * 6], [position[0] + Math.sin(heading) * 6, 0.9, position[2] + Math.cos(heading) * 6]);
            this.scene.water.position[0] = position[0]; this.scene.water.position[2] = position[2]; this.scene.water.updateModelMatrix();
        } else {
            const console = this.controller.landmarks.towerConsole;
            this.scene.camera.setCutsceneView([console[0], console[1] + 1.5, console[2] + 2], console);
        }
        this.scene._updateInvViewProj();
        this.scene._updateEnvironmentPresentation(seconds);
        this.scene.particleSystem.update(seconds);
        this.scene._syncPointerLockHint();
        this.controller.ui.endingHUD(state);
        this.scene.saveController.updateAutosave(seconds);
        if (state.status !== 'active') { this.resultShown = true; this.controller.ui.open('ending-result'); this.scene.saveController.save(true); }
        return true;
    }
    async returnToBase(retry = false) {
        if (this.busy || !this.state) return;
        this.busy = true;
        const attempt = this.challenge.snapshot(), c = this.controller, scene = this.scene;
        c.ui.report('Đang khôi phục căn cứ trước lúc đi…');
        try {
            const checkpoint = await scene.engine.worldRepository.loadWorld(scene.activeWorldId, 'checkpoint');
            if (!checkpoint) throw new Error('Không đọc được checkpoint. Giữ nguyên phiên này để xuất bản sao hoặc thử lại.');
            const played = c.playSeconds, survival = scene.survivalSeconds;
            const completed = ['raft', 'rescue'].filter(route => c.progress.facts['endingCompleted:' + route]);
            scene.saveController.apply(checkpoint); c.restore(checkpoint.campaign);
            c.ui.wasPointerLockEnabled = true;
            c.playSeconds = played; scene.survivalSeconds = survival;
            scene.water.position.fill(0); scene.water.updateModelMatrix();
            scene.water.mesh = this.baseWaterMesh;
            for (const route of completed) c.events.emit('endingCompleted', { id: route });
            if (attempt.status === 'completed') {
                c.events.emit('endingCompleted', { id: attempt.route });
                scene.stats.escaped = 1; this.pendingRoute = attempt.route;
            }
            this.challenge.state = null; this.resultShown = false; this.commands = {};
            c.ui.endingHUD(null);
            const saved = await scene.saveController.save(false);
            if (!saved) {
                c.ui.open('ending-save-error');
                c.ui.report('Căn cứ đã khôi phục trong phiên này nhưng chưa lưu được. Hãy thử lưu lại trước khi đóng game.');
                return;
            }
            c.ui.close(); c.ui.endingHUD(null);
            scene.camera._firstUpdate = true;
            if (attempt.status === 'completed') scene.engine.audio.playVictory();
            if (retry) { c.ui.open(attempt.route === 'raft' ? 'raft' : 'rescue'); this.busy = false; await this.start(attempt.route); }
        } catch (error) { c.ui.report(error.message); }
        finally { this.busy = false; }
    }
    onCommitted(route) {
        if (this.pendingRoute !== route) return;
        this.pendingRoute = null;
        const world = this.scene.engine.activeWorld;
        world.completedRoutes = [...new Set([...(world.completedRoutes || []), route])]; world.status = 'completed';
        this.scene.achievements.unlock(route === 'raft' ? 'ocean_escape' : 'radio_rescue');
        this.scene.achievements.evaluate(this.scene.stats);
        if (world.completedRoutes.length === 2) this.scene.achievements.unlock('both_routes');
    }
    snapshot() { return { challenge: this.challenge.snapshot(), towerRepaired: this.towerRepaired, pendingRoute: this.pendingRoute }; }
    restore(saved = {}) {
        this.challenge.restore(saved.challenge);
        this.scene.engine.input.setPointerLockEnabled(!this.state && !this.controller.ui.isOpen);
        this.towerRepaired = !!saved.towerRepaired;
        this.pendingRoute = saved.pendingRoute || null;
        this.resultShown = false; this.commands = {}; this.lastWeather = null;
        if (this.pendingRoute && this.scene.engine.activeWorld.completedRoutes?.includes(this.pendingRoute)) this.pendingRoute = null;
        for (const route of this.scene.engine.activeWorld.completedRoutes || []) {
            this.scene.achievements.unlock(route === 'raft' ? 'ocean_escape' : 'radio_rescue');
            this.controller.events.emit('endingCompleted', { id: route });
        }
        if (this.scene.engine.activeWorld.completedRoutes?.length === 2) this.scene.achievements.unlock('both_routes');
    }
    dispose() { this.scene.water.mesh = this.baseWaterMesh; this.oceanWater?.delete(); }
}
