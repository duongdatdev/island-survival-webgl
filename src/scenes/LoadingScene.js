import { Scene } from '../core/Scene.js';
import { CharacterRegistry } from '../characters/CharacterRegistry.js';
import { parseMtl } from '../characters/CharacterLoader.js';
import { ObjParser } from '../core/ObjParser.js';
import { Mesh } from '../renderer/Mesh.js';
import { DebrisDatabase } from '../systems/DebrisDatabase.js';

export class LoadingScene extends Scene {
    init() {
        console.log('LoadingScene: Initializing resources...');

        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.remove('hidden');
        }

        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.classList.add('hidden');
        }

        const resourceHud = document.getElementById('resource-hud');
        if (resourceHud) resourceHud.style.display = 'none';

        this._tips = [
            '💡 Thu thập Gỗ, Đá, Dây Thừng và Thùng Gỗ để chế tạo bè.',
            '🌊 Tài nguyên cũng trôi trên biển — hãy ra bờ biển để nhặt!',
            '🔨 Bấm C để mở bảng chế tạo và xem công thức.',
            '⛵ Mục tiêu: Xây bè thoát khỏi đảo hoang!',
            '🖱️ Di chuột để nhìn xung quanh ở góc nhìn thứ nhất.',
            '📦 Bấm E khi đứng gần tài nguyên để nhặt.',
            '🎮 Dùng phím W A S D để di chuyển nhân vật.',
            '🔊 Âm thanh được tạo hoàn toàn bằng Web Audio API!',
        ];
        this._tipIndex = Math.floor(Math.random() * this._tips.length);
        this._tipTimer = 0;
        this._tipInterval = 3.0;
        this._updateTip();

        this.engine.assets.loadTexture(
            'player_skin', 
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );

        const metadataPromise = this.engine.assets.loadEnvironmentMetadata('assets/environment/manifest.json');
        const creatureModelsPromise = this.engine.assets.loadCreatureModels('assets/creatures/manifest.json');
        const chestModelPromise = this.engine.assets.loadGLTFModel(
            'environment:chest',
            'assets/environment/chest.glb',
            { targetSize: [0.75, 0.55, 0.55], preserveAspect: true }
        );

        this.loadingDelay = new Promise(resolve => setTimeout(resolve, 2000));

        this._progress = 0;
        this._targetProgress = 0;
        this._stages = [
            { at: 0.3, delay: 400, label: 'Đang tạo thế giới...' },
            { at: 0.6, delay: 800, label: 'Đang tải tài nguyên...' },
            { at: 0.85, delay: 1200, label: 'Đang chuẩn bị âm thanh...' },
            { at: 1.0, delay: 1800, label: 'Sắp hoàn tất...' },
        ];
        this._stageIndex = 0;
        this._stageTimer = 0;

        Promise.all([this.loadingDelay, metadataPromise, creatureModelsPromise, chestModelPromise])
            .then(async () => {
                const uniquePaths = [];
                const characterDef = CharacterRegistry.get('casual_male');
                if (characterDef) {
                    uniquePaths.push(CharacterRegistry.getObjPath(characterDef));
                    const mtlPath = CharacterRegistry.getMtlPath(characterDef);
                    const mtlText = await this.engine.assets.loadText(mtlPath, mtlPath);
                    if (mtlText) {
                        const mtlColors = parseMtl(mtlText, characterDef.id);
                        for (const [matName, color] of Object.entries(mtlColors)) {
                            ObjParser.registerColor(matName, color);
                        }
                    }
                }
                console.log(`LoadingScene: Compiling ${uniquePaths.length} shared models...`);
                await this.engine.assets.compileUniqueModels(uniquePaths);

                await this._loadSurvivalPack(this.gl);

                this._targetProgress = 1.0;
                setTimeout(() => this._onLoadComplete(), 500);
            })
            .catch(err => {
                console.error('LoadingScene: Error during asset retrieval or world generation', err);
                this._onLoadComplete();
            });
    }

    update(deltaTime) {
        this._stageTimer += deltaTime * 1000;
        
        if (this._stageIndex < this._stages.length) {
            const stage = this._stages[this._stageIndex];
            if (this._stageTimer >= stage.delay) {
                this._targetProgress = stage.at;
                this._stageIndex++;
            }
        }

        this._progress += (this._targetProgress - this._progress) * deltaTime * 3.0;
        const percent = Math.round(Math.min(this._progress, 1.0) * 100);

        const barEl = document.getElementById('loader-bar');
        if (barEl) {
            barEl.style.width = `${percent}%`;
        }

        const textEl = document.getElementById('loader-text');
        if (textEl) {
            const currentStage = this._stages[Math.min(this._stageIndex, this._stages.length - 1)];
            textEl.textContent = currentStage ? `${currentStage.label} (${percent}%)` : `Đang tải tài nguyên (${percent}%)...`;
        }

        this._tipTimer += deltaTime;
        if (this._tipTimer >= this._tipInterval) {
            this._tipTimer = 0;
            this._tipIndex = (this._tipIndex + 1) % this._tips.length;
            this._updateTip();
        }
    }

    render() {
        const gl = this.gl;
        
        gl.clearColor(0.04, 0.05, 0.09, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    _updateTip() {
        const tipEl = document.getElementById('loader-tip');
        if (tipEl) {
            tipEl.style.opacity = '0';
            setTimeout(() => {
                tipEl.textContent = this._tips[this._tipIndex];
                tipEl.style.opacity = '1';
            }, 200);
        }
    }

    _onLoadComplete() {
        console.log('LoadingScene: Assets loaded. Transitioning to Main Menu...');

        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.add('hidden');
        }

        this.engine.scenes.switchScene('MainMenu');
    }

    destroy() {
        console.log('LoadingScene destroyed.');
    }

    async _loadSurvivalPack(gl) {
        try {
            const res = await fetch('assets/survival-pack/survival-items.json');
            if (!res.ok) throw new Error(`HTTP status: ${res.status}`);
            const data = await res.json();
            const items = data.items || [];

            for (const item of items) {
                const objText = await this.engine.assets.loadText(item.objPath, item.objPath);

                let mtlText = '';
                try {
                    mtlText = await this.engine.assets.loadText(item.mtlPath, item.mtlPath);
                } catch (e) {
                    mtlText = '';
                }

                if (mtlText) {
                    const colors = parseMtl(mtlText, 'survival_' + item.id);
                    for (const [matName, color] of Object.entries(colors)) {
                        ObjParser.registerColor(matName, color);
                    }
                }

                if (item.materialColors) {
                    for (const [matName, color] of Object.entries(item.materialColors)) {
                        ObjParser.registerColor(matName, color);
                    }
                }

                if (!objText) continue;

                const parsed = ObjParser.parse(objText);
                const adjustedScale = item.modelScale * 0.55;
                this._normalizeMeshData(parsed, adjustedScale);

                const mesh = new Mesh(gl, parsed);
                const key = 'survival:' + item.id;
                this.engine.assets.models[key] = mesh;

                if (item.registerAsDebris === false) continue;

                DebrisDatabase[key] = {
                    id: key,
                    name: item.name,
                    nameEn: item.nameEn,
                    icon: item.icon,
                    color: [0.6, 0.6, 0.6],
                    meshScale: [item.modelScale, item.modelScale, item.modelScale],
                    pickupRadius: item.pickupRadius,
                    gives: item.gives,
                    lifetime: item.lifetime,
                    driftSpeed: item.driftSpeed,
                    spawnWeight: item.spawnWeight,
                    modelId: key
                };
            }

            console.log(`LoadingScene: Loaded ${items.length} Survival Pack models.`);
        } catch (err) {
            console.error('LoadingScene: Failed to load Survival Pack', err);
        }
    }

    _normalizeMeshData(data, targetHeight) {
        const pos = data.positions;
        if (!pos || pos.length === 0) return;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < pos.length; i += 3) {
            const x = pos[i], y = pos[i + 1], z = pos[i + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const width = maxX - minX;
        const depth = maxZ - minZ;
        const height = maxY - minY;
        const maxDim = Math.max(width, height, depth, 1e-4);
        const s = targetHeight / maxDim;

        for (let i = 0; i < pos.length; i += 3) {
            pos[i] = (pos[i] - cx) * s;
            pos[i + 1] = (pos[i + 1] - minY) * s;
            pos[i + 2] = (pos[i + 2] - cz) * s;
        }
    }
}
