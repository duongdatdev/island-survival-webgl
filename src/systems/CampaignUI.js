import { CampaignCraftingPanel } from './CampaignCraftingPanel.js';
import { STRUCTURE_DEFINITIONS, CAMPAIGN_RECIPES, CAMPAIGN_BALANCE } from '../gameplay/CampaignDatabase.js';
import { CAMPAIGN_JOURNALS } from '../gameplay/CampaignStory.js';
import { getResourceDef } from './ResourceDatabase.js';
import { ENDING_SUPPLIES } from './CampaignEndings.js';
import { oceanLane } from './EndingChallenge.js';
import { getSleepPlan } from './SleepSystem.js';
import { CIRCUIT_DIRECTIONS } from './RepairCircuit.js';
import { SURVEY_STATIONS, SURVEY_CAPACITIES, pressureReadings, pourSurveyWater } from './FieldSurvey.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const button = (action, label, argument = '', disabled = false, { ariaLabel, pressed } = {}) => `<button type="button" data-action="${action}" data-arg="${escape(argument)}"${disabled ? ' disabled' : ''}${ariaLabel ? ` aria-label="${escape(ariaLabel)}"` : ''}${pressed === undefined ? '' : ` aria-pressed="${!!pressed}"`}>${escape(label)}</button>`;
const toolbarButton = (key, label, argument, icon) => `<button type="button" class="campaign-tool" data-action="panel" data-arg="${escape(argument)}" aria-label="${escape(`${key} · ${label}`)}" title="${escape(`${key} · ${label}`)}"><svg class="ui-icon campaign-tool-icon" aria-hidden="true"><use href="#${icon}"/></svg><span class="campaign-tool-key">${escape(key)}</span><span class="campaign-tool-label">${escape(label)}</span></button>`;
const countLabel = item => `${getResourceDef(item.id)?.name || item.id} ×${item.count}`;

/** Campaign panels use gameplay APIs; DOM code never owns simulation state. */
export class CampaignUI {
    constructor(controller) {
        this.controller = controller;
        this.scene = controller.scene;
        this.root = document.createElement('div');
        this.root.id = 'campaign-ui';
        this.root.innerHTML = `<div class="campaign-toolbar" aria-label="Công cụ chiến dịch">
            ${toolbarButton('B', 'Xây căn cứ', 'build', 'i-hammer')}${toolbarButton('J', 'Nhật ký', 'journal', 'i-book')}
            ${toolbarButton('M', 'Bản đồ', 'map', 'i-island')}${toolbarButton(this.scene.engine.input.getBindingDisplayName('inventory'), 'Kho đồ', 'craft', 'i-backpack')}
            </div><div id="campaign-action-hint" role="status"></div>
            <div id="campaign-activity" class="campaign-activity hidden"><p id="campaign-activity-label"></p>
            <label id="campaign-reel-label">Kéo cá <progress id="campaign-reel" max="1" value="0"></progress></label>
            <label id="campaign-tension-label">Độ căng <progress id="campaign-tension" max="1" value="0"></progress></label></div>
            <aside id="campaign-ending-hud" class="campaign-ending-hud hidden" aria-label="Thử thách thoát đảo" tabindex="-1"></aside>
            <div id="campaign-panel" class="campaign-panel hidden" role="dialog" aria-modal="true" aria-labelledby="campaign-panel-title">
            <div class="campaign-dialog"><header><h2 id="campaign-panel-title"></h2>${button('close', 'Đóng · Esc')}</header>
            <div id="campaign-panel-body"></div><div id="campaign-panel-feedback" role="status"></div></div></div>`;
        document.body.append(this.root);
        this.panel = this.root.querySelector('#campaign-panel');
        this.body = this.root.querySelector('#campaign-panel-body');
        this.feedback = this.root.querySelector('#campaign-panel-feedback');
        this.onClick = event => {
            const target = event.target.closest('[data-action]');
            if (target) this.action(target.dataset.action, target.dataset.arg);
        };
        this.onInput = event => {
            if (this.kind !== 'field-survey' || this.argument !== 'wind' || !event.target.matches('[data-survey-wind]')) return;
            const response = this.controller.surveyCommand('wind', 'angle', Number(event.target.value));
            if (!response.ok) { this.report(response.error); return; }
            const angle = this.controller.fieldSurvey.wind.angle;
            this.body.querySelector('.survey-needle').setAttribute('transform', `rotate(${angle} 120 120)`);
            this.body.querySelector('#survey-wind-angle').textContent = angle;
            const target = this.controller.fieldSurvey.layout.wind[this.controller.fieldSurvey.wind.readings.length];
            this.body.querySelector('.survey-compass').setAttribute('aria-label', `Kim ${angle} độ; cờ tham chiếu ${target} độ`);
        };
        this.onKey = event => {
            if (this.isOpen && this.kind === 'repair-circuit' && event.target?.dataset?.action === 'repair-rotate'
                && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation();
                const index = Number(event.target.dataset.arg), offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
                const next = Math.max(0, Math.min(24, index + offsets[event.key]));
                this.body.querySelector(`[data-action="repair-rotate"][data-arg="${next}"]`)?.focus(); return;
            }
            if (!this.isOpen || event.key !== 'Tab') return;
            const elements = this.focusableControls();
            const first = elements[0], last = elements.at(-1);
            if (!elements.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('input', this.onInput);
        document.addEventListener('keydown', this.onKey);
        this.craftingPanel = new CampaignCraftingPanel(controller);
        this.refreshHUD();
    }

    get isOpen() { return !this.panel.classList.contains('hidden'); }
    focusableControls() {
        return [...this.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),canvas[tabindex]')]
            .filter(element => element.tabIndex >= 0 && element.getClientRects().length);
    }

    open(kind, argument = '') {
        if (kind === 'craft') {
            if (this.controller.ending?.state) return;
            if (this.isOpen) this.close();
            this.scene.inventoryController.openMenu();
            return;
        }
        if (this.controller.ending?.state && !['ending-result', 'ending-abandon'].includes(kind)) return;
        if (this.controller.wreckSalvage?.active) {
            this.controller.wreckSalvage.pause();
            this.controller.saveMilestone();
        }
        if (this.controller.mineExtraction?.active) {
            this.controller.mineExtraction.pause();
            this.controller.saveMilestone();
        }
        this.kind = kind;
        this.argument = argument;
        if (!this.isOpen) {
            this.returnFocus = document.activeElement;
            if (this.scene.inventoryMenu && !this.scene.inventoryMenu.classList.contains('hidden')) this.scene.inventoryController.closeMenu();
            this.wasPaused = this.scene.isPaused;
            this.wasPointerLockEnabled = this.scene.engine.input.pointerLockEnabled;
            this.scene.isPaused = true;
            this.scene._pointerUnlockPauseGuard = 0.5;
            this.scene.engine.input.setPointerLockEnabled(false);
            this.scene.engine.input.releasePointerLock();
        }
        this.panel.classList.remove('hidden');
        this.scene.tutorial?.notifyPanel(kind);
        this.render();
        this.panel.querySelector('button:not(:disabled)')?.focus();
    }

    close() {
        if (!this.isOpen) return;
        this.panel.classList.add('hidden');
        if (this.kind === 'ending-abandon' && this.controller.ending.state?.status === 'active') this.root.querySelector('#campaign-ending-hud').focus();
        else if (this.returnFocus?.isConnected && this.returnFocus.getClientRects().length && !this.returnFocus.disabled) this.returnFocus.focus();
        this.returnFocus = null;
        this.scene.isPaused = !!this.wasPaused;
        this.scene._pointerUnlockPauseGuard = 0.5;
        this.scene.engine.input.setPointerLockEnabled(!this.controller.ending?.state && !!this.wasPointerLockEnabled);
        if (!this.scene.isPaused && this.scene.engine.input.pointerLockEnabled && !this.controller.ending?.state) this.scene.engine.input.requestPointerLock();
    }

    report(message) { this.feedback.textContent = message; }

    async action(action, argument) {
        const c = this.controller;
        if (c.ending.busy) return;
        let result;
        if (action === 'panel') { this.open(argument); return; }
        if (action === 'close') { this.close(); return; }
        if (action === 'install-raft') result = c.ending.install(argument);
        if (action === 'repair-tower') result = c.ending.repairTower();
        if (action === 'start-ending') { await c.ending.start(argument); return; }
        if (action === 'ending-command') { c.ending.command(argument); return; }
        if (action === 'return-base') { await c.ending.returnToBase(false); return; }
        if (action === 'abandon-ending') { if (c.ending.state?.status === 'active') this.open('ending-abandon'); return; }
        if (action === 'retry-ending') { await c.ending.returnToBase(true); return; }
        if (action === 'retry-save') { if (await this.scene.saveController.save(false)) this.close(); else this.report('Vẫn chưa lưu được. Tiến trình đang giữ trong phiên này.'); return; }
        if (action === 'build') { this.close(); c.beginPlacement(argument); return; }
        if (action === 'inspect-structure') { this.open('structure', argument); return; }
        if (action === 'craft') result = c.craft(argument);
        if (action === 'pin-objective') result = c.pinObjective(Number(argument));
        if (action === 'repair-install') result = c.installStationCircuit();
        if (action === 'repair-test') result = c.testStationCircuit();
        if (action === 'survey-command') {
            const [id, command, value] = argument.split(':');
            const parsed = value === undefined ? undefined : value.includes(',') ? value.split(',').map(Number) : Number(value);
            const response = c.surveyCommand(id, command, parsed);
            this.render(); this.report(response.ok ? response.message || 'Đã chỉnh thiết bị.' : response.error);
            const control = [...this.body.querySelectorAll('[data-action="survey-command"]')].find(element => element.dataset.arg === argument && !element.disabled);
            control?.focus(); return;
        }
        if (action === 'repair-rotate' || action === 'repair-reset') {
            if (action === 'repair-rotate') c.stationCircuit.rotate(Number(argument)); else c.stationCircuit.reset();
            c.saveMilestone(); this.render();
            this.body.querySelector(`[data-action="repair-rotate"][data-arg="${action === 'repair-reset' ? 0 : argument}"]`)?.focus(); return;
        }
        const record = c.registry.structures.get(this.argument) || c.deathBags.find(bag => bag.id === this.argument);
        if (action === 'fuel') result = { ok: c.production.addFuel(record, this.scene.inventory, argument) };
        if (action === 'cook') result = { ok: c.production.cook(record, argument, this.scene.inventory, this.scene.player.position) };
        if (action === 'cancel-job') result = c.production.cancel(record.id, argument, this.scene.inventory);
        if (action === 'collect' || action === 'store') {
            const source = action === 'collect' ? record.container : this.scene.inventory;
            const target = action === 'collect' ? this.scene.inventory : record.container;
            const requested = source.getCount(argument), moved = source.transferTo(target, argument, requested, true);
            result = { ok: moved > 0, message: `${action === 'collect' ? 'Đã lấy' : 'Đã cất'} ${getResourceDef(argument).name} ×${moved}`
                + (moved < requested ? ` · còn ${requested - moved} ở nơi cũ vì thiếu chỗ.` : '') };
        }
        if (action === 'craft-source') { record.allowCrafting = !record.allowCrafting; result = { ok: true }; }
        if (action === 'toggle-door') { record.open = !record.open; c.refreshCollision(); result = { ok: true }; }
        if (action === 'dismantle') { result = c.registry.dismantle(record.id, this.scene.inventory); if (result.ok) this.open('build'); }
        if (action === 'bed') { c.registry.respawnBedId = record.id; result = { ok: true }; }
        if (action === 'sleep') { this.close(); c.sleep(); return; }
        if (action === 'plant') result = { ok: c.production.plant(record, argument, this.scene.inventory) };
        if (action === 'water') result = { ok: c.production.water(record, this.scene.inventory) };
        if (action === 'harvest') result = { ok: c.production.harvest(record, this.scene.inventory) };
        if (action === 'drink-source') result = { ok: c.production.drawWater(record, this.scene.inventory) };
        if (action === 'journal') { c.readJournal(argument); return; }
        if (action === 'rewards') result = { ok: c.progress.claimRewards(this.scene.inventory) > 0 };
        if (action === 'remove-marker') { c.markers.splice(Number(argument), 1); result = { ok: true }; }
        if (result) {
            this.render();
            this.report(result.ok ? result.message || 'Đã thực hiện.' : result.error || 'Chưa thể thực hiện: kiểm tra nguyên liệu và chỗ trống.');
            if (result.ok) c.saveMilestone();
        }
    }

    render() {
        // Replacing a panel's contents must not strand keyboard users on the page body.
        const active = document.activeElement;
        const restoreFocus = this.isOpen && this.body.contains(active);
        const focusIdentity = restoreFocus ? { id: active.id, action: active.dataset.action, argument: active.dataset.arg } : null;
        this.feedback.textContent = '';
        const c = this.controller;
        const record = c.registry.structures.get(this.argument);
        const title = { build: 'Xây căn cứ', journal: 'Nhật ký chiến dịch', map: 'Bản đồ đảo', craft: 'Công nghệ và chế tạo', note: 'Ghi chép tìm được', structure: record ? STRUCTURE_DEFINITIONS[record.type].name : 'Công trình' };
        this.root.querySelector('#campaign-panel-title').textContent = title[this.kind] || 'Chiến dịch';
        this.panel.querySelector('[data-action="close"]').disabled = this.kind === 'ending-result';
        if (this.kind === 'build') {
            this.body.innerHTML = `<p>Chọn công trình, di chuyển để xem vị trí đặt. R xoay · E xây · Esc hủy.</p><div class="campaign-grid">`
                + Object.values(STRUCTURE_DEFINITIONS).map(def => button('build', `${def.name} · cấp ${def.tier}`, def.id, def.tier > c.progress.tier)).join('') + '</div>';
            this.body.innerHTML += '<h3>Quản lý công trình đã xây</h3><div class="campaign-grid">'
                + [...c.registry.structures.values()].map(r => button('inspect-structure', `${STRUCTURE_DEFINITIONS[r.type].name} ${r.id.replace('structure-', '')}`, r.id)).join('') + '</div>';
        }
        else if (this.kind === 'repair-circuit') { this.root.querySelector('#campaign-panel-title').textContent = 'Khôi phục bảng điều khiển'; this.body.innerHTML = this.circuitHTML(); }
        else if (this.kind === 'survey-report') { this.root.querySelector('#campaign-panel-title').textContent = 'Đối chiếu thiết bị ngoài hiện trường'; this.body.innerHTML = this.surveyReportHTML(); }
        else if (this.kind === 'field-survey') {
            this.root.querySelector('#campaign-panel-title').textContent = SURVEY_STATIONS.find(station => station.id === this.argument).title;
            this.body.innerHTML = this.surveyHTML(this.argument);
        }
        else if (this.kind === 'raft' || this.kind === 'rescue') this.body.innerHTML = this.endingPreparation(this.kind);
        else if (this.kind === 'ending-abandon') {
            this.root.querySelector('#campaign-panel-title').textContent = 'Dừng chuyến đi?';
            this.body.innerHTML = '<p>Trở về checkpoint trước lúc khởi hành. Căn cứ và vật tư chuẩn bị được khôi phục; tiến độ của chuyến đi đang chạy sẽ bỏ lại. Bạn có thể chuẩn bị rồi thử lại.</p>'
                + button('close', 'Tiếp tục chuyến đi') + button('return-base', 'Dừng và trở về căn cứ');
        }
        else if (this.kind === 'ending-result') {
            const state = c.ending.state, success = state.status === 'completed';
            this.root.querySelector('#campaign-panel-title').textContent = success ? 'Đã tìm được đường về nhà' : 'Chuyến đi chưa thành công';
            this.body.innerHTML = `<p>${success ? (state.route === 'raft' ? 'Bạn đã vượt qua rạn đá và gặp tuyến tàu ngoài khơi.' : 'Tàu cứu hộ đã xác nhận tín hiệu và tìm thấy đảo.') : escape(state.reason)}</p><p>Thời gian thử thách: ${Math.floor(state.elapsed / 60)} phút ${Math.floor(state.elapsed % 60)} giây. Căn cứ và vật tư trước lúc đi được giữ trong checkpoint.</p>`
                + (success ? '<p>Tiếp tục căn cứ để khám phá thêm hoặc chuẩn bị tuyến kết thúc còn lại.</p>' : button('retry-ending', 'Thử lại từ checkpoint'))
                + button('return-base', success ? 'Lưu kết thúc và tiếp tục căn cứ' : 'Trở về căn cứ');
        } else if (this.kind === 'ending-save-error') this.body.innerHTML = '<p>Căn cứ đã khôi phục trong phiên này. Cần lưu thành công để giữ kết quả khi đóng game.</p>' + button('retry-save', 'Thử lưu lại');
        else if (this.kind === 'journal') {
            const chapter = c.progress.currentChapter();
            this.body.innerHTML = `<p class="campaign-kicker">CHƯƠNG ${chapter.id} · CÔNG NGHỆ CẤP ${c.progress.tier}</p><h3>${escape(chapter.title)}</h3><p>${escape(chapter.summary)}</p>`
                + `<ul>${c.progress.objectives().map((item, index) => {
                    const pinned = c.pinnedObjective?.chapter === chapter.id && c.pinnedObjective.index === index;
                    return `<li>${item.progress >= item.count ? '✓' : '○'} ${escape(item.label)} · ${item.progress}/${item.count} `
                        + (item.progress < item.count || pinned ? button('pin-objective', pinned ? 'Bỏ ghim' : 'Ghim mục tiêu', String(index), false,
                            { ariaLabel: `${pinned ? 'Bỏ ghim' : 'Ghim mục tiêu'}: ${item.label}`, pressed: pinned }) : '') + '</li>';
                }).join('')}</ul>`
                + (c.progress.journals.has('wreck_manifest') ? `<h3>Trục vớt xác tàu</h3><ul>${c.landmarks.salvageNodes.map(node => {
                    const state = c.wreckSalvage.parts[node.id];
                    return `<li>${state.claimed ? '✓' : '○'} ${escape(node.name)} · ${state.claimed ? 'đã nhận vật tư' : `${Math.floor(state.progress)}/${node.seconds}s${state.progress === node.seconds ? ' · chờ nhận vật tư' : ''}`}${node.toolLabel ? ` · mang ${escape(node.toolLabel)}` : ''}</li>`;
                }).join('')}</ul><p>Tới gần từng bộ phận dưới nước và giữ ${escape(this.scene.engine.input.getBindingDisplayName('interact'))}. Thả phím để giữ tiến độ. Theo dõi oxy và nổi lên khi cần.</p>` : '')
                + `<h3>Nhiệm vụ phụ</h3>${c.progress.sideQuests().map(quest => `<p>${quest.completed ? '✓' : '○'} ${escape(quest.title)} — ${quest.objectives.map(o => `${escape(o.label)} ${o.progress}/${o.count}`).join(' · ')}</p>`).join('')}`
                + button('rewards', `Nhận phần thưởng đang chờ (${c.progress.pendingRewards.length})`, '', !c.progress.pendingRewards.length)
                + `<h3>Ghi chép đã tìm</h3><div class="campaign-grid">${[...c.progress.journals].map(id => button('journal', CAMPAIGN_JOURNALS[id].title, id)).join('')}</div>`;
        } else if (this.kind === 'note') {
            const journal = c.journals?.[this.argument] || CAMPAIGN_JOURNALS[this.argument];
            this.body.innerHTML = `<h3>${escape(journal.title)}</h3><p class="campaign-note">${escape(journal.text)}</p>${button('panel', 'Xem tiến trình chiến dịch', 'journal')}`;
        } else if (this.kind === 'structure' && record) this.body.innerHTML = this.structureHTML(record);
        else if (this.kind === 'bag') {
            const bag = c.deathBags.find(bag => bag.id === this.argument);
            this.body.innerHTML = `<h3>Đồ đã rơi</h3><div class="campaign-grid">${bag.container.getSlots().map(item => button('collect', 'Lấy ' + countLabel(item), item.id)).join('') || '<p>Đã lấy hết đồ.</p>'}</div>`;
        }
        else if (this.kind === 'map') {
            this.body.innerHTML = `<p id="campaign-map-help">Nhấn vào vùng đã khám phá để đặt dấu. Bàn phím: phím mũi tên di chuyển con trỏ 10 m, Shift + mũi tên 40 m; Home về vị trí của bạn; Enter đặt dấu.</p><p id="campaign-map-cursor" role="status"></p><canvas id="campaign-map" width="600" height="600" tabindex="0" aria-label="Bản đồ địa điểm đã khám phá" aria-describedby="campaign-map-help campaign-map-cursor"></canvas>`
                + c.markers.map((marker, index) => `<p>${escape(marker.label)} ${button('remove-marker', 'Bỏ dấu', String(index))}</p>`).join('');
            const map = this.body.querySelector('canvas');
            this.mapCursor ||= [this.scene.player.position[0], this.scene.player.position[2]];
            const drawCursor = () => {
                c.drawMap(map);
                const [x, z] = this.mapCursor, ctx = map.getContext('2d');
                const px = (x + 320) / 640 * 600, py = (z + 320) / 640 * 600;
                ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
                ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
                ctx.moveTo(px - 13, py); ctx.lineTo(px + 13, py); ctx.moveTo(px, py - 13); ctx.lineTo(px, py + 13); ctx.stroke(); ctx.restore();
                const known = c.discovered.has(`${Math.floor((x + 320) / 40)}:${Math.floor((z + 320) / 40)}`);
                this.body.querySelector('#campaign-map-cursor').textContent = `Con trỏ: ${Math.round(x)}, ${Math.round(z)} m · ${known ? 'đã khám phá' : 'chưa khám phá'}`;
            };
            const placeMarker = () => {
                const result = c.addMarker(...this.mapCursor);
                if (!result.ok) { this.report(result.error); return; }
                this.render(); this.report('Đã đặt dấu trên bản đồ.');
            };
            drawCursor();
            map.onclick = event => {
                const rect = map.getBoundingClientRect();
                this.mapCursor = [(event.clientX - rect.left) / rect.width * 640 - 320, (event.clientY - rect.top) / rect.height * 640 - 320]
                    .map(value => Math.max(-320, Math.min(319, value)));
                drawCursor(); placeMarker();
            };
            map.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', ' '].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                if (event.key === 'Enter' || event.key === ' ') { if (!event.repeat) placeMarker(); return; }
                if (event.key === 'Home') this.mapCursor = [this.scene.player.position[0], this.scene.player.position[2]];
                else {
                    const step = event.shiftKey ? 40 : 10;
                    const offsets = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                    this.mapCursor = this.mapCursor.map((value, index) => Math.max(-320, Math.min(319, value + offsets[event.key][index])));
                }
                drawCursor();
            };
        }
        this.refreshHUD();
        if (restoreFocus) {
            const controls = this.focusableControls();
            const replacement = controls.find(element => focusIdentity.id ? element.id === focusIdentity.id
                : focusIdentity.action && element.dataset.action === focusIdentity.action && element.dataset.arg === focusIdentity.argument);
            (replacement || controls[0])?.focus();
        }
    }

    endingControlHint(route) {
        const key = action => this.scene.engine.input.getBindingDisplayName(action);
        const turn = `${key('moveLeft')}/${key('moveRight')}`;
        return route === 'raft' ? `${turn} lái · ${key('moveForward')} tăng tốc · ${key('moveBackward')} chậm lại · R sửa`
            : `${turn} chỉnh · giữ Space phát · ${key('interact')} nhiên liệu · R bảo vệ`;
    }

    endingPreparation(route) {
        const ending = this.controller.ending, raft = this.scene.raftAssembly;
        this.root.querySelector('#campaign-panel-title').textContent = route === 'raft' ? 'Chuẩn bị bè vượt biển' : 'Khôi phục cứu hộ';
        let html = route === 'raft' ? `<p>Lái bè qua rạn đá trong khoảng 8–12 phút. ${escape(this.endingControlHint(route))}. Động cơ giúp điều khiển và chịu va chạm tốt hơn.</p>`
            + `<div class="campaign-grid">${[['raft_frame', 'Khung bè', 'framePlaced'], ['barrel_floats', 'Phao nổi', 'floatsPlaced'], ['paddle', 'Mái chèo', 'paddlePlaced'], ['raft_sail', 'Buồm', 'sailPlaced'], ['raft_motor', 'Động cơ (tùy chọn)', 'motorPlaced']].map(([id, name, property]) => button('install-raft', (raft[property] ? '✓ ' : 'Lắp ') + name, id, raft[property] || !this.scene.inventory.hasItem(id))).join('')}</div>`
            : `<p>Giữ tín hiệu trong khoảng 8–12 phút. ${escape(this.endingControlHint(route))}.</p><p>Sửa tháp: 1 radio + 2 pin + 6 dây đồng + 3 thỏi sắt.</p>` + button('repair-tower', ending.towerRepaired ? '✓ Tháp đã khôi phục' : 'Sửa radio và máy phát', '', ending.towerRepaired);
        html += '<h3>Tiếp tế cho hành trình</h3><ul>' + Object.entries(ENDING_SUPPLIES[route]).map(([id, count]) => `<li>${escape(getResourceDef(id).name)} ${this.scene.inventory.getCount(id)}/${count}</li>`).join('') + '</ul>';
        const missing = ending.requirements(route);
        html += missing.length ? '<h3>Còn thiếu</h3><ul>' + missing.map(item => `<li>${typeof item === 'string' ? escape(item) : `${escape(getResourceDef(item.id).name)} ${item.have}/${item.count}`}</li>`).join('') + '</ul>' : '<p>Đã đủ điều kiện. Checkpoint sẽ được lưu trước khi dùng tiếp tế.</p>';
        return html + button('start-ending', route === 'raft' ? 'Khởi hành vượt biển' : 'Bắt đầu phát tín hiệu', route, missing.length > 0 || ending.busy);
    }

    endingHUD(state) {
        document.body.classList.toggle('campaign-ending', !!state);
        const panel = this.root.querySelector('#campaign-ending-hud');
        panel.classList.toggle('hidden', !state);
        this.root.querySelector('.campaign-toolbar').classList.toggle('hidden', !!state);
        if (!state) { panel.innerHTML = ''; return; }
        this.root.querySelector('#campaign-activity').classList.add('hidden');
        this.hint('');
        const route = state.route;
        if (panel.dataset.route !== route || !panel.children.length) {
            panel.dataset.route = route;
            panel.innerHTML = `<h3>${route === 'raft' ? 'Vượt rạn đá' : 'Tín hiệu cứu hộ'}</h3><p id="ending-clock"></p><p id="ending-primary"></p><progress id="ending-progress" max="1"></progress><p id="ending-secondary"></p>`
                + (route === 'raft' ? '<canvas id="ending-radar" width="280" height="180" aria-label="Rạn đá phía trước; đường đi nằm trong vùng sáng"></canvas>'
                    : '<label>Tần số <input id="ending-tuning" type="range" min="0" max="100" step="0.1"></label><p id="ending-target"></p>')
                + `<p>${escape(this.endingControlHint(route))}</p>`
                + (route === 'rescue' ? button('ending-command', 'Bật / tắt phát tín hiệu', 'transmit') + button('ending-command', 'Thêm nhiên liệu', 'refuel') : '')
                + button('ending-command', 'Sửa / bảo vệ · R', 'repair')
                + button('abandon-ending', 'Dừng chuyến đi');
            const tuning = panel.querySelector('#ending-tuning');
            if (tuning) tuning.oninput = () => { if (this.controller.ending.state) this.controller.ending.state.tuning = Number(tuning.value); };
        }
        panel.querySelector('#ending-clock').textContent = `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')} · ${state.storm ? 'Giông mạnh' : 'Gió ổn định'}`;
        panel.querySelector('[data-action="abandon-ending"]').disabled = state.status !== 'active';
        panel.querySelector('#ending-progress').value = route === 'raft' ? state.along / 1800 : state.signal / 480;
        panel.querySelector('#ending-primary').textContent = route === 'raft' ? `Quãng đường ${Math.floor(state.along)}/1800 m · độ bền bè ${Math.ceil(state.hull)}%` : `Liên lạc ổn định ${Math.floor(state.signal)}/480 giây · điện ${Math.ceil(state.power)}%`;
        panel.querySelector('#ending-secondary').textContent = route === 'raft' ? `Bộ sửa chữa còn ${state.repairs} · hướng lái ${Math.round(state.heading * 180 / Math.PI)}°` : `Gỗ còn ${state.fuel} · bộ bảo vệ ${state.repairs} · sét sau ${Math.ceil(state.strikeWarning)}s`;
        if (route === 'rescue') {
            const tuning = panel.querySelector('#ending-tuning');
            if (document.activeElement !== tuning) tuning.value = state.tuning;
            panel.querySelector('#ending-target').textContent = `Tần số mục tiêu ${state.target.toFixed(1)} · đang chỉnh ${state.tuning.toFixed(1)} · tín hiệu ${Math.round((state.quality || 0) * 100)}%`;
        } else {
            const ctx = panel.querySelector('#ending-radar').getContext('2d');
            ctx.fillStyle = '#193c3d'; ctx.fillRect(0, 0, 280, 180);
            ctx.fillStyle = '#49685b';
            for (let y = 0; y < 180; y++) { const along = state.along + (160 - y) * 1.2; const x = 140 + (oceanLane(along) - state.across) * 3; ctx.fillRect(x - 54, y, 108, 1); }
            ctx.fillStyle = '#d39979';
            for (const rock of state.rocks) { const y = 160 - (rock.along - state.along) / 1.2; if (y < -10 || y > 190) continue; ctx.beginPath(); ctx.arc(140 + (rock.across - state.across) * 3, y, rock.radius * 3, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = '#ffe8a2'; ctx.beginPath(); ctx.moveTo(140, 150); ctx.lineTo(134, 166); ctx.lineTo(146, 166); ctx.fill();
        }
    }

    circuitHTML() {
        const circuit = this.controller.stationCircuit, status = circuit.status();
        const tiles = Array.from({ length: 25 }, (_, index) => {
            const mask = circuit.mask(index), sensor = circuit.layout.sensors.indexOf(index), powered = circuit.installed && status.powered.has(index);
            const ports = CIRCUIT_DIRECTIONS.filter(direction => mask & direction.bit);
            const label = `Hàng ${Math.floor(index / 5) + 1}, cột ${index % 5 + 1}: nối ${ports.map(p => p.name).join(' và ')}${sensor >= 0 ? ', cảm biến ' + (sensor + 1) : ''}${powered ? ', có điện' : ', chưa có điện'}. Nhấn để xoay.`;
            const lines = ports.map(p => `<path d="M32 32 L${32 + p.dx * 28} ${32 + p.dy * 28}"/>`).join('');
            return `<button type="button" class="repair-tile${powered ? ' powered' : ''}" data-action="repair-rotate" data-arg="${index}" aria-label="${escape(label)}"${circuit.solved ? ' disabled' : ''}>`
                + `<svg viewBox="0 0 64 64" aria-hidden="true">${lines}${sensor >= 0 ? `<circle cx="32" cy="32" r="11"/><text x="32" y="37">${sensor + 1}</text>` : '<circle cx="32" cy="32" r="4"/>'}</svg></button>`;
        }).join('');
        return `<p>Gió giật đã xoay các đầu nối. Dẫn nguồn từ mép trái hàng 3 đến đầu ra ở mép phải hàng 3, đi qua cả ba cảm biến được đánh số. Các đầu nối có điện phải khớp nhau, không được để hở.</p>`
            + `<p>Nhấn ô để xoay theo chiều kim đồng hồ. Dùng phím mũi tên chọn ô, Enter xoay. Đặt lại giữ nguyên vật tư đã lắp.</p>`
            + `<div class="repair-layout"><span class="repair-endpoint">Nguồn →</span><div class="repair-board" role="group" aria-label="Mạch điện năm hàng, năm cột">${tiles}</div><span class="repair-endpoint">→ Đầu ra</span></div>`
            + `<p class="repair-status" role="status">${circuit.solved ? 'Đã sửa xong · ba cảm biến đã có điện.' : circuit.installed ? `Cảm biến có điện: ${status.sensors.length}/3 · đầu nối hở: ${status.leaks.length} · ${status.sourceConnected ? 'đã nối nguồn' : 'chưa nối nguồn'}` : 'Chưa lắp vật tư vào trạm.'}</p>`
            + (circuit.installed ? '' : button('repair-install', 'Lắp 4 thỏi sắt + 2 thỏi đồng'))
            + button('repair-reset', 'Đặt lại đầu nối', '', circuit.solved)
            + button('repair-test', 'Thử mạch điện', '', !circuit.installed || circuit.solved)
            + (circuit.solved ? this.surveyReportHTML() : '');
    }

    surveyReportHTML() {
        const c = this.controller;
        return '<p>Bảng điều khiển đã có điện. Hồ sơ tọa độ cần ba bản hiệu chỉnh để đối chiếu dữ liệu cũ. Các thiết bị đã có vật tư; không phải trả thêm nguyên liệu.</p>'
            + '<ul class="survey-report">' + SURVEY_STATIONS.map(station => `<li>${c.fieldSurvey.complete(station.id) ? '✓' : '○'} ${escape(station.title)} — ${escape(station.place)}</li>`).join('') + '</ul>'
            + '<p>Các thiết bị nằm cạnh địa điểm tương ứng. Dùng M xem dấu ở vùng đã khám phá; tới gần và nhấn E. Bản đo giữ lại khi chết hoặc rời phiên.</p>'
            + button('journal', 'Đọc hồ sơ tọa độ', 'station_coordinates', !c.fieldReadingsReady());
    }

    surveyHTML(id) {
        const survey = this.controller.fieldSurvey, state = survey[id], done = survey.complete(id);
        const control = (command, label, value, disabled = false) => button('survey-command', label, `${id}:${command}${value === undefined ? '' : ':' + value}`, done || disabled);
        let html;
        if (id === 'wind') {
            const target = survey.layout.wind[Math.min(2, state.readings.length)];
            html = '<p>Căn kim của thiết bị trùng mũi tên cờ tham chiếu, rồi ghi mẫu. Có ba hướng khác nhau; mỗi lần xoay 5°. Hướng 0° là Bắc.</p>'
                + `<svg class="survey-compass" viewBox="0 0 240 240" role="img" aria-label="Kim ${state.angle} độ; cờ tham chiếu ${target} độ"><circle cx="120" cy="120" r="94"/><text x="120" y="18">Bắc</text><text x="222" y="124">Đ</text><text x="120" y="233">Nam</text><text x="18" y="124">T</text>`
                + `<g transform="rotate(${target} 120 120)" class="survey-reference"><path d="M120 120 L120 36 L105 54 M120 36 L135 54"/></g>`
                + `<g transform="rotate(${state.angle} 120 120)" class="survey-needle"><path d="M120 157 L120 50 L112 62 M120 50 L128 62"/></g><circle cx="120" cy="120" r="5"/></svg>`
                + `<label class="survey-dial-control">Chỉnh hướng kim<input type="range" min="0" max="355" step="5" value="${state.angle}" data-survey-wind${done ? ' disabled' : ''}></label>`
                + `<p class="survey-status" role="status">Kim <span id="survey-wind-angle">${state.angle}</span>° · đã ghi ${state.readings.length}/3 mẫu${done ? ' · hoàn tất' : ''}. Mũi tên vàng nét đứt là cờ chuẩn; kim sáng nét liền là thiết bị.</p>`
                + '<div class="survey-controls">' + control('turn', '↶ Xoay trái 5°', -5) + control('turn', 'Xoay phải 5° ↷', 5) + control('measure', 'Ghi mẫu gió') + '</div>';
        } else if (id === 'water') {
            html = '<p>Có tổng cộng 8 lít trong ba bình dung tích 8, 5 và 3 lít. Mỗi lần chuyển sẽ đổ tới khi bình nguồn rỗng hoặc bình nhận đầy. Phân chia đúng bộ chuẩn rồi thử lưu lượng.</p>'
                + '<div class="survey-tanks">' + state.levels.map((level, i) => `<figure><figcaption>Bình ${'ABC'[i]} · ${SURVEY_CAPACITIES[i]} lít</figcaption><div class="survey-tank" aria-hidden="true"><div style="height:${level / SURVEY_CAPACITIES[i] * 100}%"></div></div><p id="survey-level-${i}">${level} lít · chuẩn ${survey.layout.water[i]} lít</p><meter aria-labelledby="survey-level-${i}" min="0" max="${SURVEY_CAPACITIES[i]}" value="${level}"></meter></figure>`).join('') + '</div>'
                + '<div class="survey-controls">' + [0, 1, 2].flatMap(from => [0, 1, 2].filter(to => to !== from).map(to => control('pour', `${'ABC'[from]} → ${'ABC'[to]}`, `${from},${to}`, !pourSurveyWater(state.levels, from, to)))).join('')
                + control('test', 'Thử lưu lượng') + '</div>';
        } else {
            const readings = pressureReadings(state.valves);
            html = '<p>Chỉnh ba van từ 0 đến 9 để cả ba đồng hồ khớp áp suất chuẩn. Van ảnh hưởng lẫn nhau: đồng hồ 1 = 2A + B; đồng hồ 2 = 2B + C; đồng hồ 3 = A + 2C.</p>'
                + '<div class="survey-valves">' + state.valves.map((value, i) => `<div><h3>Van ${'ABC'[i]} · ${value}/9</h3>${control('turn', 'Giảm van ' + 'ABC'[i], `${i},-1`, value === 0)} ${control('turn', 'Tăng van ' + 'ABC'[i], `${i},1`, value === 9)}</div>`).join('') + '</div>'
                + '<table class="survey-readings"><thead><tr><th>Đồng hồ</th><th>Hiện tại</th><th>Chuẩn</th><th>Trạng thái</th></tr></thead><tbody>'
                + readings.map((value, i) => `<tr><th>${i + 1}</th><td>${value}</td><td>${survey.layout.pressure[i]}</td><td>${value === survey.layout.pressure[i] ? '✓ Khớp' : '○ Chưa khớp'}</td></tr>`).join('') + '</tbody></table>' + control('test', 'Thử áp suất');
        }
        return html + (id === 'wind' ? '' : `<p class="survey-status" role="status">${done ? '✓ Đã hiệu chỉnh. Bản đo được giữ trong nhật ký.' : 'Chưa hiệu chỉnh xong; có thể đóng và tiếp tục ở phiên sau.'}</p>`) + control('reset', 'Đặt lại thiết bị');
    }

    structureHTML(record) {
        const def = STRUCTURE_DEFINITIONS[record.type];
        let html = `<p>${escape(def.name)} · ${record.id.replace('structure-', '')}</p>`;
        if (record.type === 'door') html += button('toggle-door', record.open ? 'Đóng cửa' : 'Mở cửa');
        if (def.fire) html += `<p>Nhiên liệu: ${Math.ceil(record.fuelSeconds)} giây</p>${button('fuel', 'Thêm 1 gỗ', 'wood')}${button('fuel', 'Thêm 1 than', 'charcoal')}`;
        if (record.type === 'campfire') html += `<h3>Nấu thức ăn</h3><div class="campaign-grid">${['raw_fish', 'raw_boar_meat', 'raw_crab_meat', 'raw_seagull_meat', 'reef_fish', 'ocean_fish', 'coconut', 'carrot'].map(id => button('cook', getResourceDef(id).name, id, !this.scene.inventory.hasItem(id))).join('')}</div>`;
        if (record.container) {
            if (record.type.includes('chest')) html += button('craft-source', record.allowCrafting ? '✓ Cho phép dùng nguyên liệu trong rương' : 'Cho phép dùng nguyên liệu trong rương');
            html += `<h3>Đồ trong công trình</h3><div class="campaign-grid">${Object.entries(record.container.getAll()).map(([id, count]) => button('collect', 'Lấy ' + countLabel({ id, count }), id)).join('') || '<p>Trống</p>'}</div>`;
            if (record.type.includes('chest')) html += `<h3>Cất từ túi</h3><div class="campaign-grid">${Object.entries(this.scene.inventory.getAll()).map(([id, count]) => button('store', 'Cất ' + countLabel({ id, count }), id)).join('')}</div>`;
        }
        if (def.station) {
            html += `<h3>Chế tạo tại trạm</h3><div class="campaign-grid">${Object.values(CAMPAIGN_RECIPES).filter(recipe => recipe.station === def.station).map(recipe => button('craft', recipe.name, recipe.id, !this.controller.production.checkCraft(recipe.id, this.scene.inventory, this.scene.player.position).ok)).join('')}</div>`;
            html += `<h3>Hàng đợi ${record.jobs.length}/5</h3>${record.jobs.map(job => `<p>${escape(getResourceDef(job.output.id)?.name || job.output.id)} · ${Math.floor(job.progress)}/${job.duration}s · ${escape({ queued: 'Đang chờ', running: 'Đang xử lý', no_fuel: 'Hết nhiên liệu', output_full: 'Kho đầu ra đầy' }[job.state] || '')} ${button('cancel-job', 'Hủy lượt', job.id)}</p>`).join('')}`;
        }
        if (def.waterCapacity) html += `<p>Nước: ${record.waterStored}/${def.waterCapacity}</p>${button('drink-source', 'Lấy 1 nước ngọt', '', !record.waterStored)}`;
        if (def.bed) html += button('bed', 'Đặt điểm hồi sinh');
        if (def.bed || def.shelter || record.type === 'roof') {
            const sleep = getSleepPlan(this.scene);
            html += `<p>${sleep.allowed ? `Ngủ tới sáng · đói −${Math.ceil(sleep.hungerCost)} · khát −${Math.ceil(sleep.thirstCost)}` : escape(sleep.reason)}</p>`
                + button('sleep', 'Ngủ tới sáng', '', !sleep.allowed);
        }
        if (def.crop) {
            if (record.crop) {
                const duration = record.crop.type === 'carrot' ? CAMPAIGN_BALANCE.cropFoodSeconds : CAMPAIGN_BALANCE.cropHerbSeconds;
                html += `<p>${record.crop.type === 'carrot' ? 'Thực phẩm' : 'Thảo dược'} · ${Math.floor(record.crop.progress / 60)}/${duration / 60} phút · nước còn ${Math.ceil(record.crop.waterSeconds / 60)} phút</p>`
                    + button('water', 'Tưới 1 nước ngọt', '', record.crop.waterSeconds >= 2400 || !this.scene.inventory.hasItem('fresh_water'))
                    + button('harvest', 'Thu hoạch', '', record.crop.progress < duration);
            } else html += button('plant', 'Trồng thực phẩm', 'carrot', !this.scene.inventory.hasItem('carrot_seed')) + button('plant', 'Trồng thảo dược', 'herb', !this.scene.inventory.hasItem('herb_seed'));
        }
        return html + '<hr>' + button('dismantle', 'Tháo công trình · hoàn 75% vật liệu');
    }

    renderCraftingPanel() { this.craftingPanel.render(); }

    refreshHUD() {
        const c = this.controller;
        const tracker = document.getElementById('objective-tracker');
        if (tracker) {
            const objective = c.trackedObjective();
            const recipe = c.production.recipe(c.pinnedRecipe);
            const sources = recipe ? c.registry.craftingSources(this.scene.player.position, this.scene.inventory) : [];
            const markup = `<div class="objective-kicker">CHƯƠNG ${c.progress.chapter} · CẤP ${c.progress.tier}</div><div class="objective-title">${escape(c.progress.currentChapter().title)}</div><div class="objective-milestone">Gần nhất: ${escape(c.progress.lastMilestone)}</div><div class="objective-description">${objective ? `${escape(objective.label)} · ${objective.progress}/${objective.count}` : 'Đã hoàn thành chiến dịch — tiếp tục căn cứ hoặc thử kết thúc còn lại.'}</div>`
                + (recipe ? `<div class="objective-ingredients">${escape(recipe.name)}: ${Object.entries(recipe.ingredients).map(([id, count]) => `${escape(getResourceDef(id)?.name || id)} ${sources.reduce((sum, source) => sum + source.getCount(id), 0)}/${count}`).join(' · ')}</div>` : '');
            if (this.lastHUDMarkup !== markup || this.lastHUDFirstChild !== tracker.firstChild) {
                tracker.innerHTML = markup; this.lastHUDMarkup = markup; this.lastHUDFirstChild = tracker.firstChild;
            }
        }
    }

    hint(message) { this.root.querySelector('#campaign-action-hint').textContent = message; }
    activity(fishing, oxygen, swimY, hookReward, salvage, mining) {
        const panel = this.root.querySelector('#campaign-activity');
        const label = this.root.querySelector('#campaign-activity-label');
        const reel = this.root.querySelector('#campaign-reel');
        const tension = this.root.querySelector('#campaign-tension');
        const diving = swimY !== undefined && swimY < -0.8;
        panel.classList.toggle('hidden', !fishing && !diving && !hookReward && !salvage && !mining);
        const reelLabel = this.root.querySelector('#campaign-reel-label');
        reelLabel.hidden = fishing?.phase !== 'reeling' && !salvage && !mining;
        reelLabel.firstChild.textContent = mining ? 'Khai thác ' : salvage ? 'Trục vớt ' : 'Kéo cá ';
        const tensionLabel = this.root.querySelector('#campaign-tension-label');
        tensionLabel.hidden = fishing?.phase !== 'reeling' && !diving;
        tensionLabel.firstChild.textContent = diving && !fishing ? 'Oxy ' : 'Độ căng ';
        if (fishing) {
            const text = { waiting: 'Chờ phao động…', bite: 'Cá cắn câu! E hoặc nhấn chuột trái để giật cần.',
                reeling: 'Giữ chuột trái / Space để kéo; thả khi dây căng cao.', landed: 'Đã câu được cá · túi đầy, cá được giữ lại. Cất đồ rồi lấy cá.' }[fishing.phase];
            label.textContent = text;
            reel.value = fishing.progress; tension.value = fishing.tension;
        } else if (diving) {
            label.textContent = (salvage ? `${salvage.name} · giữ ${this.scene.engine.input.getBindingDisplayName('interact')}; thả để nghỉ · ` : '') + `Oxy: ${Math.ceil(oxygen ?? 45)} giây · Space nổi lên · Ctrl lặn xuống`;
            if (salvage) reel.value = salvage.progress;
            tension.value = (oxygen ?? 45) / (this.scene.inventory.hasItem('dive_kit') ? 120 : 45);
        } else if (mining) {
            label.textContent = `${mining.name} · giữ ${this.scene.engine.input.getBindingDisplayName('interact')}; thả để nghỉ · 2 quặng/lượt`;
            reel.value = mining.progress;
        } else if (hookReward) label.textContent = `Đồ vừa kéo: ${getResourceDef(hookReward.id)?.name || hookReward.id} ×${hookReward.count} · cần chỗ trong túi.`;
    }
    dispose() { document.body.classList.remove('campaign-ending'); this.craftingPanel.dispose(); this.root.removeEventListener('click', this.onClick); this.root.removeEventListener('input', this.onInput); document.removeEventListener('keydown', this.onKey); this.root.remove(); }
}
