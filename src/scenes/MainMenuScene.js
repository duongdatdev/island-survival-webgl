import { Scene } from '../core/Scene.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { SkyShader } from '../shaders/SkyShader.js';
import { Water } from '../entities/Water.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { Camera } from '../renderer/Camera.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { WorldGenerator } from '../gameplay/world/WorldGenerator.js';
import { CampaignWorldGenerator } from '../gameplay/world/CampaignWorldGenerator.js';
import { MenuUI } from '../systems/MenuUI.js';
import { setLoadingProgress } from '../systems/LoadingUI.js';

const SUN_DIRECTION = Vec3.create(0.50, 0.049, 1.0);
const KEY_LIGHT_DIRECTION = [0.50, 0.55, 1.0];
const FOG_START = 18.0;
const FOG_DENSITY = 0.018;
const WAVE_HEADING = [0.32, -0.95];
const SHALLOW_COLOR = [0.24, 0.66, 0.62];

const STATUS_LABELS = {
    new: 'MỚI',
    playing: 'ĐANG CHƠI',
    dead: 'ĐÃ GỤC NGÃ',
    escaped: 'ĐÃ THOÁT ĐẢO',
    completed: 'CÓ THỂ TIẾP TỤC',
};

export class MainMenuScene extends Scene {
    init() {
        const gl = this.gl;
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);
        this.water = new Water(gl, 96, 300.0);
        this.skyShader = null;
        this.skyVao = null;

        try {
            this.skyShader = new ShaderProgram(gl, SkyShader.vertex, SkyShader.fragment);
            this.skyVao = gl.createVertexArray();
        } catch (e) {
            console.error('MainMenuScene: sky shader failed to compile.', e);
        }

        this.camera = new Camera(50 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.1, 500.0);
        this.camera.position = Vec3.create(0, 4.0, -12.0);
        this.camera.target = Vec3.create(0, 1.2, 8.0);
        this._viewProj = Mat4.create();
        this._invViewProj = Mat4.create();
        this._updateInvViewProj();
        this.dirLight = new DirectionalLight(KEY_LIGHT_DIRECTION, [1.0, 0.80, 0.56], 0.95);
        this.ambientLight = new AmbientLight([0.15, 0.20, 0.35], 0.5);
        this.time = 0;
        this.selectedWorldId = null;
        this.formWorldId = null;
        this.deleteWorldId = null;
        this.isLaunching = false;
        this._tutorialRequested = false;

        gl.clearColor(...SkyShader.palette.mid, 1.0);
        this.storage = this.engine.worldRepository;
        this._cacheDom();
        this._showMenu();
        this.menuUI = new MenuUI(this.engine, { onGuidePlay: () => this._startWithTutorial() });
        this._bindEvents();
        this._updateSoundButton(this.engine.audio.isMuted);
        this._refreshAchievementsButton();
        this.engine.audio._ensureContext();
        this.engine.audio.startAmbientWaves();
        this.engine.audio.startMusic();
    }

    _cacheDom() {
        this._mainMenu = document.getElementById('main-menu');
        this._playMenuBtn = document.getElementById('menu-play-btn');
        this._tutorialBtn = document.getElementById('menu-tutorial-btn');
        this._soundBtn = document.getElementById('menu-sound-btn');
        this._settingsBtn = document.getElementById('menu-settings-btn');
        this._achievementsBtn = document.getElementById('menu-achievements-btn');
        this._creditsBtn = document.getElementById('menu-credits-btn');
        this._worldMenu = document.getElementById('world-menu');
        this._worldMenuCloseBtn = document.getElementById('world-menu-close-btn');
        this._worldCreateBtn = document.getElementById('world-create-btn');
        this._worldImportBtn = document.getElementById('world-import-btn');
        this._worldImportFile = document.getElementById('world-import-file');
        this._worldList = document.getElementById('world-list');
        this._worldSummary = document.getElementById('world-menu-summary');
        this._worldSelectionSummary = document.getElementById('world-selection-summary');
        this._worldError = document.getElementById('world-menu-error');
        this._worldPlayBtn = document.getElementById('world-play-btn');
        this._worldFormModal = document.getElementById('world-form-modal');
        this._worldForm = document.getElementById('world-form');
        this._worldFormTitle = document.getElementById('world-form-title');
        this._worldNameInput = document.getElementById('world-name-input');
        this._worldSeedInput = document.getElementById('world-seed-input');
        this._worldFormError = document.getElementById('world-form-error');
        this._worldFormSubmitLabel = document.getElementById('world-form-submit-label');
        this._worldFormCloseBtn = document.getElementById('world-form-close-btn');
        this._worldFormCancelBtn = document.getElementById('world-form-cancel-btn');
        this._worldDeleteModal = document.getElementById('world-delete-modal');
        this._worldDeleteMessage = document.getElementById('world-delete-message');
        this._worldDeleteCloseBtn = document.getElementById('world-delete-close-btn');
        this._worldDeleteCancelBtn = document.getElementById('world-delete-cancel-btn');
        this._worldDeleteConfirmBtn = document.getElementById('world-delete-confirm-btn');
        this._loaderScreen = document.getElementById('loading-screen');
    }

    _bindEvents() {
        this._onPlayMenu = () => this._openWorldMenu();
        this._onTutorial = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.playClick();
            this.menuUI.openGuide();
        };
        this._onSound = () => {
            this.engine.audio._ensureContext();
            this.engine.audio.resume();
            const muted = this.engine.audio.toggleMute();
            this.engine.settings.set('muted', muted);
            this._updateSoundButton(muted);
            if (!muted) this.engine.audio.playClick();
        };
        this._onSettings = () => { this.engine.audio.playClick(); this.menuUI.openSettings(); };
        this._onAchievements = () => { this.engine.audio.playClick(); this.menuUI.openAchievements(); };
        this._onCredits = () => { this.engine.audio.playClick(); this.menuUI.openCredits(); };
        this._onWorldMenuClose = () => this._closeWorldMenu();
        this._onWorldCreate = () => this._showWorldForm();
        this._onWorldImport = () => this._worldImportFile.click();
        this._onWorldImportFile = async () => {
            const file = this._worldImportFile.files[0];
            if (!file) return;
            try {
                const result = await this.storage.importWorld(await file.text());
                if (!result.ok) throw new Error(result.error);
                this.selectedWorldId = result.world.id;
                this._setWorldError('');
                await this._renderWorlds();
            } catch (error) { this._setWorldError(error.message); }
            this._worldImportFile.value = '';
        };
        this._onWorldPlay = () => this._launchSelectedWorld();
        this._onWorldFormSubmit = event => this._submitWorldForm(event);
        this._onWorldFormClose = () => this._hideWorldForm();
        this._onWorldDeleteClose = () => this._hideDeleteDialog();
        this._onWorldDeleteConfirm = () => this._confirmDeleteWorld();

        this._playMenuBtn?.addEventListener('click', this._onPlayMenu);
        this._tutorialBtn?.addEventListener('click', this._onTutorial);
        this._soundBtn?.addEventListener('click', this._onSound);
        this._settingsBtn?.addEventListener('click', this._onSettings);
        this._achievementsBtn?.addEventListener('click', this._onAchievements);
        this._creditsBtn?.addEventListener('click', this._onCredits);
        this._worldMenuCloseBtn?.addEventListener('click', this._onWorldMenuClose);
        this._worldCreateBtn?.addEventListener('click', this._onWorldCreate);
        this._worldImportBtn?.addEventListener('click', this._onWorldImport);
        this._worldImportFile?.addEventListener('change', this._onWorldImportFile);
        this._worldPlayBtn?.addEventListener('click', this._onWorldPlay);
        this._worldForm?.addEventListener('submit', this._onWorldFormSubmit);
        this._worldFormCloseBtn?.addEventListener('click', this._onWorldFormClose);
        this._worldFormCancelBtn?.addEventListener('click', this._onWorldFormClose);
        this._worldDeleteCloseBtn?.addEventListener('click', this._onWorldDeleteClose);
        this._worldDeleteCancelBtn?.addEventListener('click', this._onWorldDeleteClose);
        this._worldDeleteConfirmBtn?.addEventListener('click', this._onWorldDeleteConfirm);
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.engine.achievements.update(deltaTime);

        if (this.engine.input.isKeyPressed('Escape')) {
            if (!this._worldFormModal?.classList.contains('hidden')) this._hideWorldForm();
            else if (!this._worldDeleteModal?.classList.contains('hidden')) this._hideDeleteDialog();
            else if (!this._worldMenu?.classList.contains('hidden')) this._closeWorldMenu();
            else if (this.menuUI?.isAnyOpen()) this.menuUI.closeAll();
        }

        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);
        const camX = Math.sin(this.time * 0.08) * 3.0;
        const camY = 4.0 + Math.sin(this.time * 0.15) * 0.35;
        Vec3.set(this.camera.position, camX, camY, -12.0);
        Vec3.set(this.camera.target, camX * 0.3, 1.2, 8.0);
        Mat4.lookAt(this.camera.viewMatrix, this.camera.position, this.camera.target, Vec3.create(0, 1, 0));
        this._updateInvViewProj();
    }

    _updateInvViewProj() {
        Mat4.multiply(this._viewProj, this.camera.projectionMatrix, this.camera.viewMatrix);
        Mat4.invert(this._invViewProj, this._viewProj);
    }

    render() {
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this._renderSky();
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.waterShader.use();
        this.waterShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.waterShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.waterShader.setUniform3fv('uViewPosition', this.camera.position);
        this.waterShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.waterShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.waterShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.waterShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.waterShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);
        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', 1.0);
        this.waterShader.setUniform1f('uWaveAmplitude', 1.2);
        this.waterShader.setUniform1f('uWaveSpeed', 0.7);
        this.waterShader.setUniform1f('uWaveAttenStart', 0.0);
        this.waterShader.setUniform1f('uWaveAttenEnd', 1.0);
        this.waterShader.setUniform2f('uWaveHeading', WAVE_HEADING[0], WAVE_HEADING[1]);
        this.waterShader.setUniform3fv('uFogColor', SkyShader.palette.horizon);
        this.waterShader.setUniform1f('uFogStart', FOG_START);
        this.waterShader.setUniform1f('uFogDensity', FOG_DENSITY);
        this.waterShader.setUniform3fv('uHorizonColor', SkyShader.palette.horizon);
        this.waterShader.setUniform3fv('uShallowColor', SHALLOW_COLOR);
        this.waterShader.setUniform1f('uDetailStrength', 1.0);
        this.waterShader.setUniform1f('uFoamStrength', 0.0);
        this.waterShader.setUniform1f('uWhitecaps', 0.0);
        this.waterShader.setUniform3fv('uSunDirection', SUN_DIRECTION);
        this.waterShader.setUniform3fv('uSunColor', SkyShader.palette.sun);
        this.waterShader.setUniform1f('uSunGlitter', 0.6);
        this.water.draw(this.waterShader);
        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
    }

    _renderSky() {
        if (!this.skyShader) return;
        const gl = this.gl;
        const palette = SkyShader.palette;
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.skyVao);
        this.skyShader.use();
        this.skyShader.setUniformMatrix4fv('uInvViewProj', this._invViewProj);
        this.skyShader.setUniform3fv('uCameraPos', this.camera.position);
        this.skyShader.setUniform3fv('uSunDirection', SUN_DIRECTION);
        this.skyShader.setUniform3fv('uSunColor', palette.sun);
        this.skyShader.setUniform3fv('uMoonDirection', [-SUN_DIRECTION[0], -SUN_DIRECTION[1], -SUN_DIRECTION[2]]);
        this.skyShader.setUniform3fv('uMoonColor', [0.0, 0.0, 0.0]);
        this.skyShader.setUniform3fv('uSkyHorizon', palette.horizon);
        this.skyShader.setUniform3fv('uSkyMid', palette.mid);
        this.skyShader.setUniform3fv('uSkyZenith', palette.zenith);
        this.skyShader.setUniform1f('uSunsetAmount', 0.7);
        this.skyShader.setUniform1f('uTime', this.time);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
    }

    _showMenu() {
        this._mainMenu?.classList.remove('hidden');
        document.getElementById('resource-hud')?.style.setProperty('display', 'none');
        document.getElementById('debug-panel')?.classList.add('hidden');
        document.getElementById('escape-hud')?.classList.add('hidden');
        document.getElementById('vitals-hud')?.classList.add('hidden');
        document.getElementById('hotbar-hud')?.classList.add('hidden');
    }

    _hideMenu() {
        this._mainMenu?.classList.add('hidden');
    }

    _openWorldMenu() {
        this.engine.audio.playClick();
        this._hideMenu();
        this._worldMenu?.classList.remove('hidden');
        this._worldMenu?.setAttribute('aria-hidden', 'false');
        this._setWorldError('');
        this._renderWorlds();
    }

    _closeWorldMenu() {
        if (this.isLaunching) return;
        this._hideWorldForm();
        this._hideDeleteDialog();
        this._worldMenu?.classList.add('hidden');
        this._worldMenu?.setAttribute('aria-hidden', 'true');
        this._showMenu();
        this.engine.audio.playClick();
    }

    async _renderWorlds() {
        const ticket = this._worldRenderTicket = (this._worldRenderTicket || 0) + 1;
        if (this._worldPlayBtn) this._worldPlayBtn.disabled = true;
        let worlds;
        try { worlds = await this.storage.listWorlds(); }
        catch (error) { this._setWorldError(error.message); return; }
        if (ticket !== this._worldRenderTicket) return;
        if (!worlds.some(world => world.id === this.selectedWorldId)) {
            this.selectedWorldId = worlds[0]?.id || null;
        }
        if (this._worldSummary) {
            this._worldSummary.textContent = worlds.length ? `${worlds.length} map đã tạo` : 'Tạo map đầu tiên để bắt đầu hành trình.';
        }
        if (this._worldList) {
            this._worldList.replaceChildren();
            if (!worlds.length) {
                const empty = document.createElement('div');
                empty.className = 'world-empty';
                empty.textContent = 'Chưa có map nào. Hãy tạo một hòn đảo cho riêng bạn.';
                this._worldList.append(empty);
            }
            for (const world of worlds) this._worldList.append(this._createWorldCard(world));
        }
        if (this._worldPlayBtn) this._worldPlayBtn.disabled = !this.selectedWorldId || this.isLaunching;
        if (this._worldSelectionSummary) {
            const selected = worlds.find(world => world.id === this.selectedWorldId);
            this._worldSelectionSummary.textContent = selected ? `Đã chọn: ${selected.name}` : 'Chưa chọn thế giới';
        }
    }

    _createWorldCard(world) {
        const card = document.createElement('div');
        card.className = `world-card${world.id === this.selectedWorldId ? ' selected' : ''}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', world.id === this.selectedWorldId ? 'true' : 'false');
        const select = async () => {
            const keyboardFocused = document.activeElement === card;
            this.selectedWorldId = world.id;
            this._setWorldError('');
            await this._renderWorlds();
            if (keyboardFocused) this._worldList?.querySelector('.world-card.selected')?.focus();
        };
        card.addEventListener('click', select);
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                select();
            }
        });

        const main = document.createElement('div');
        main.className = 'world-card-main';
        const top = document.createElement('div');
        top.className = 'world-card-top';
        const name = document.createElement('span');
        name.className = 'world-card-name';
        name.textContent = world.name;
        name.title = world.name;
        const status = document.createElement('span');
        status.className = `world-status ${world.recoveryProblem ? 'dead' : world.status || 'new'}`;
        status.textContent = world.recoveryProblem ? 'Cần khôi phục' : STATUS_LABELS[world.status] || STATUS_LABELS.new;
        top.append(name, status);

        const meta = document.createElement('div');
        meta.className = 'world-card-meta';
        for (const [label, value] of [
            ['Chế độ', world.mode === 'campaign' ? `Chiến dịch · Chương ${world.chapter || 1}` : 'Classic'],
            ['Thời gian sinh tồn', this._formatDuration(world.survivalSeconds)],
            ['Chơi gần nhất', world.lastPlayedAt ? this._formatDate(world.lastPlayedAt) : 'Chưa chơi'],
        ]) {
            const item = document.createElement('span');
            item.className = 'world-stat';
            const caption = document.createElement('span');
            caption.textContent = label;
            const content = document.createElement('strong');
            content.textContent = value;
            item.append(caption, content);
            meta.append(item);
        }
        const seed = document.createElement('p');
        seed.className = 'world-card-seed';
        seed.textContent = `Seed: ${world.seed}`;
        main.append(top, meta, seed);
        if (world.recoveryProblem) {
            const warning = document.createElement('p');
            warning.className = 'world-card-warning';
            warning.textContent = world.recoveryProblem;
            main.append(warning);
        }

        const actions = document.createElement('div');
        actions.className = 'world-card-actions';
        actions.append(
            this._createWorldAction('Xuất bản sao thế giới', 'XUẤT', () => this._exportWorld(world)),
            this._createWorldAction('Đổi tên map', 'SỬA', () => this._showWorldForm(world)),
            this._createWorldAction('Xóa map', 'XÓA', () => this._showDeleteDialog(world), true)
        );
        card.append(main, actions);
        return card;
    }

    _createWorldAction(label, text, handler, dangerous = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `world-action${dangerous ? ' danger' : ''}`;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', event => {
            event.stopPropagation();
            handler();
        });
        button.addEventListener('keydown', event => event.stopPropagation());
        return button;
    }

    async _exportWorld(world) {
        try {
            const json = await this.storage.exportWorld(world.id);
            const recovery = JSON.parse(json).format === 'island-survival-recovery';
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `island-${world.id}${recovery ? '-recovery' : ''}.json`;
            link.click();
            if (recovery) this._setWorldError('Đã xuất dữ liệu gốc để phục hồi. Tệp này cần được kiểm tra trước khi có thể nhập lại.');
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { this._setWorldError(error.message); }
    }

    _showWorldForm(world = null) {
        this.formWorldId = world?.id || null;
        this._worldFormTitle.textContent = world ? 'ĐỔI TÊN MAP' : 'TẠO MAP MỚI';
        this._worldFormSubmitLabel.textContent = world ? 'LƯU TÊN' : 'TẠO MAP';
        this._worldNameInput.value = world?.name || '';
        this._worldSeedInput.value = world?.seed || new URLSearchParams(window.location.search).get('seed') || '';
        this._worldSeedInput.closest('.world-field').classList.toggle('hidden', !!world);
        for (const field of document.querySelectorAll('.world-new-config')) field.classList.toggle('hidden', !!world);
        this._worldFormError.textContent = '';
        this._worldFormModal.classList.remove('hidden');
        this._worldFormModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => this._worldNameInput.focus(), 0);
    }

    _hideWorldForm() {
        this.formWorldId = null;
        this._worldFormModal?.classList.add('hidden');
        this._worldFormModal?.setAttribute('aria-hidden', 'true');
    }

    async _submitWorldForm(event) {
        event.preventDefault();
        let result;
        try {
            result = this.formWorldId
                ? await this.storage.renameWorld(this.formWorldId, this._worldNameInput.value)
                : await this.storage.createWorld({ name: this._worldNameInput.value, seed: this._worldSeedInput.value,
                    mode: document.getElementById('world-mode-input').value, difficulty: document.getElementById('world-difficulty-input').value });
        } catch (error) { this._worldFormError.textContent = error.message; return; }
        if (!result.ok) {
            this._worldFormError.textContent = result.error;
            return;
        }
        this.selectedWorldId = result.world.id;
        this._hideWorldForm();
        this._renderWorlds();
        this.engine.audio.playClick();
    }

    _showDeleteDialog(world) {
        this.deleteWorldId = world.id;
        this._worldDeleteMessage.textContent = `Map “${world.name}” và toàn bộ tiến trình của nó sẽ bị xóa vĩnh viễn.`;
        this._worldDeleteModal.classList.remove('hidden');
        this._worldDeleteModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => this._worldDeleteConfirmBtn.focus(), 0);
    }

    _hideDeleteDialog() {
        this.deleteWorldId = null;
        this._worldDeleteModal?.classList.add('hidden');
        this._worldDeleteModal?.setAttribute('aria-hidden', 'true');
    }

    async _confirmDeleteWorld() {
        const deletedWorldId = this.deleteWorldId;
        let result;
        try { result = await this.storage.deleteWorld(deletedWorldId); }
        catch (error) { this._setWorldError(error.message); return; }
        this._hideDeleteDialog();
        if (!result.ok) {
            this._setWorldError(result.error);
            return;
        }
        if (this.selectedWorldId === deletedWorldId) this.selectedWorldId = null;
        this._renderWorlds();
        this.engine.audio.playClick();
    }

    async _launchSelectedWorld() {
        if (this.isLaunching || !this.selectedWorldId) return;
        this.isLaunching = true;
        this._setWorldError('');
        this._renderWorlds();
        this._setLoader(true, 'Đang tạo thế giới...', 18);

        try {
            const selected = await this.storage.getWorld(this.selectedWorldId);
            if (!selected) throw new Error('Thế giới không còn tồn tại.');
            const save = await this.storage.loadWorld(selected.id);
            const world = await this.storage.prepareWorld(selected.id);
            if (!world) throw new Error('Không thể cập nhật map đã chọn.');
            await new Promise(resolve => requestAnimationFrame(resolve));
            const generator = world.mode === 'campaign' ? new CampaignWorldGenerator(world.generatorVersion ?? 2) : new WorldGenerator(120, 100.0);
            if (world.mode === 'campaign' && !this.engine.assets.campaignMetadata) await this.engine.assets.loadCampaignModels();
            const generatedWorld = generator.generate(world.seed, this.engine.assets.environmentMetadata, false);
            this._setLoader(true, 'Đang chuẩn bị môi trường...', 58);
            const paths = Array.from(new Set(generatedWorld.placedObjects.map(object => object.objPath)));
            await this.engine.assets.compileUniqueModels(paths);
            this._setLoader(true, 'Sẵn sàng lên đảo...', 100);
            this.engine.activeWorldId = world.id;
            this.engine.activeWorld = world;
            this.engine.worldSeed = world.seed;
            this.engine.generatedWorld = generatedWorld;
            this.engine.pendingLoad = save;
            this.engine.pendingRecoveryWarning = this.storage.recoveryWarnings?.get(world.id) || null;
            if (this._tutorialRequested) {
                try { localStorage.removeItem('island_survival_tutorial_done'); } catch (e) { }
                this._tutorialRequested = false;
            }
            this._setLoader(false);
            this._worldMenu.classList.add('hidden');
            this._hideMenu();
            this._enterGame();
        } catch (e) {
            this._setWorldError(e.message || 'Không thể mở map này.');
            this._setLoader(false);
            this.isLaunching = false;
            this._renderWorlds();
        }
    }

    _setLoader(visible, text = '', progress = 0) {
        if (!this._loaderScreen) return;
        this._loaderScreen.classList.toggle('hidden', !visible);
        if (visible) setLoadingProgress(text, progress);
    }

    _enterGame() {
        this.engine.audio._ensureContext();
        this.engine.audio.resume();
        this.engine.audio.playClick();
        setTimeout(() => this.engine.scenes.switchScene('Game'), 120);
    }

    _startWithTutorial() {
        this._tutorialRequested = true;
        this._openWorldMenu();
    }

    _setWorldError(message) {
        if (this._worldError) this._worldError.textContent = message;
    }

    _formatDuration(seconds) {
        const safeSeconds = Math.max(0, Math.floor(seconds || 0));
        return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
    }

    _formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    _updateSoundButton(isMuted) {
        if (!this._soundBtn) return;
        this._soundBtn.innerHTML =
            `<svg class="ui-icon" aria-hidden="true"><use href="#i-volume${isMuted ? '-off' : ''}"/></svg>` +
            `<span class="tile-label">ÂM THANH: ${isMuted ? 'TẮT' : 'BẬT'}</span>`;
        this._soundBtn.classList.toggle('is-off', isMuted);
        this._soundBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
        this._soundBtn.setAttribute('aria-label', isMuted ? 'Bật âm thanh' : 'Tắt âm thanh');
    }

    _refreshAchievementsButton() {
        const metaEl = document.getElementById('menu-achievements-meta');
        if (!metaEl) return;
        const progress = this.engine.achievements.getProgress();
        metaEl.textContent = `${progress.unlocked}/${progress.total}`;
    }

    destroy() {
        this._playMenuBtn?.removeEventListener('click', this._onPlayMenu);
        this._tutorialBtn?.removeEventListener('click', this._onTutorial);
        this._soundBtn?.removeEventListener('click', this._onSound);
        this._settingsBtn?.removeEventListener('click', this._onSettings);
        this._achievementsBtn?.removeEventListener('click', this._onAchievements);
        this._creditsBtn?.removeEventListener('click', this._onCredits);
        this._worldMenuCloseBtn?.removeEventListener('click', this._onWorldMenuClose);
        this._worldCreateBtn?.removeEventListener('click', this._onWorldCreate);
        this._worldImportBtn?.removeEventListener('click', this._onWorldImport);
        this._worldImportFile?.removeEventListener('change', this._onWorldImportFile);
        this._worldPlayBtn?.removeEventListener('click', this._onWorldPlay);
        this._worldForm?.removeEventListener('submit', this._onWorldFormSubmit);
        this._worldFormCloseBtn?.removeEventListener('click', this._onWorldFormClose);
        this._worldFormCancelBtn?.removeEventListener('click', this._onWorldFormClose);
        this._worldDeleteCloseBtn?.removeEventListener('click', this._onWorldDeleteClose);
        this._worldDeleteCancelBtn?.removeEventListener('click', this._onWorldDeleteClose);
        this._worldDeleteConfirmBtn?.removeEventListener('click', this._onWorldDeleteConfirm);
        this.menuUI?.dispose();
        this.waterShader?.delete();
        this.water?.delete();
        this.skyShader?.delete();
        if (this.skyVao) this.gl.deleteVertexArray(this.skyVao);
        this.engine.audio.stopMusic();
    }
}
