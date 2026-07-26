import { Scene } from '../core/Scene.js';
import { WorldGenerator } from '../gameplay/world/WorldGenerator.js';
import { CharacterRegistry } from '../characters/CharacterRegistry.js';
import { parseMtl } from '../characters/CharacterLoader.js';
import { ObjParser } from '../core/ObjParser.js';
import { Mesh } from '../renderer/Mesh.js';
import { DebrisDatabase } from '../systems/DebrisDatabase.js';

/**
 * Loading screen scene that tracks AssetManager status and updates the UI.
 * Now includes rotating gameplay tips and routes to MainMenu after loading.
 */
export class LoadingScene extends Scene {
    init() {
        console.log('LoadingScene: Initializing resources...');

        // Reset and display the HTML loader overlay
        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.remove('hidden');
        }

        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.classList.add('hidden'); // Hide debug during load
        }

        // Hide resource HUD during loading
        const resourceHud = document.getElementById('resource-hud');
        if (resourceHud) resourceHud.style.display = 'none';

        // Loading tips
        this._tips = [
            '💡 Thu thập Gỗ, Đá, Dây Thừng và Thùng Gỗ để chế tạo bè.',
            '🌊 Tài nguyên cũng trôi trên biển — hãy ra bờ biển để nhặt!',
            '🔨 Bấm C để mở bảng chế tạo và xem công thức.',
            '⛵ Mục tiêu: Xây bè thoát khỏi đảo hoang!',
            '🖱️ Giữ chuột trái và kéo để xoay camera.',
            '📦 Bấm E khi đứng gần tài nguyên để nhặt.',
            '🎮 Dùng phím W A S D để di chuyển nhân vật.',
            '🔊 Âm thanh được tạo hoàn toàn bằng Web Audio API!',
        ];
        this._tipIndex = Math.floor(Math.random() * this._tips.length);
        this._tipTimer = 0;
        this._tipInterval = 3.0; // Change tip every 3 seconds
        this._updateTip();

        // 1. Queue core textures (using small data URLs to guarantee immediate, CORS-free resolution)
        this.engine.assets.loadTexture(
            'player_skin', 
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );

        // Queue environment metadata loading
        const metadataPromise = this.engine.assets.loadEnvironmentMetadata('assets/environment/manifest.json');

        // 2. Queue simulated heavy loads (2s delay) to showcase the UI animation smoothly
        this.loadingDelay = new Promise(resolve => setTimeout(resolve, 2000));

        // Staged progress simulation
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

        // Wait for all assets to resolve
        Promise.all([this.loadingDelay, metadataPromise])
            .then(async () => {
                const seed = new URLSearchParams(window.location.search).get('seed') || Math.floor(Math.random() * 1000000).toString();
                this.engine.worldSeed = seed;

                console.log(`LoadingScene: Generating world with seed: ${seed}`);
                const generator = new WorldGenerator(120, 100.0);
                const world = generator.generate(seed, this.engine.assets.environmentMetadata, false);
                this.engine.generatedWorld = world;

                // Collect and compile unique meshes
                const uniquePaths = Array.from(new Set(world.placedObjects.map(obj => obj.objPath)));
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
                console.log(`LoadingScene: Compiling ${uniquePaths.length} unique environment models...`);
                await this.engine.assets.compileUniqueModels(uniquePaths);

                // Compile Survival Pack OBJ models and register them as drifting debris
                await this._loadSurvivalPack(this.gl);

                this._targetProgress = 1.0;
                // Give a moment for progress bar to catch up
                setTimeout(() => this._onLoadComplete(), 500);
            })
            .catch(err => {
                console.error('LoadingScene: Error during asset retrieval or world generation', err);
                this._onLoadComplete(); // Safe fallback
            });
    }

    update(deltaTime) {
        // Staged progress animation
        this._stageTimer += deltaTime * 1000;
        
        if (this._stageIndex < this._stages.length) {
            const stage = this._stages[this._stageIndex];
            if (this._stageTimer >= stage.delay) {
                this._targetProgress = stage.at;
                this._stageIndex++;
            }
        }

        // Smooth progress interpolation
        this._progress += (this._targetProgress - this._progress) * deltaTime * 3.0;
        const percent = Math.round(Math.min(this._progress, 1.0) * 100);

        // Update loading progress bar element
        const barEl = document.getElementById('loader-bar');
        if (barEl) {
            barEl.style.width = `${percent}%`;
        }

        // Update progress readout text
        const textEl = document.getElementById('loader-text');
        if (textEl) {
            const currentStage = this._stages[Math.min(this._stageIndex, this._stages.length - 1)];
            textEl.textContent = currentStage ? `${currentStage.label} (${percent}%)` : `Đang tải tài nguyên (${percent}%)...`;
        }

        // Rotate tips
        this._tipTimer += deltaTime;
        if (this._tipTimer >= this._tipInterval) {
            this._tipTimer = 0;
            this._tipIndex = (this._tipIndex + 1) % this._tips.length;
            this._updateTip();
        }
    }

    render() {
        const gl = this.gl;
        
        // Clear with deep space/night background
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

        // Fade out overlay
        const loaderScreen = document.getElementById('loading-screen');
        if (loaderScreen) {
            loaderScreen.classList.add('hidden');
        }

        // Switch to Main Menu Scene (not directly to Game)
        this.engine.scenes.switchScene('MainMenu');
    }

    destroy() {
        console.log('LoadingScene destroyed.');
    }

    /**
     * Load the Survival Pack OBJ models, normalize + compile them into GPU meshes,
     * then register each one as a drifting ocean debris type so they appear in-game.
     */
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

                // Register exact material colors from the MTL so models keep their look
                if (mtlText) {
                    const colors = parseMtl(mtlText, 'survival_' + item.id);
                    for (const [matName, color] of Object.entries(colors)) {
                        ObjParser.registerColor(matName, color);
                    }
                }

                if (!objText) continue;

                const parsed = ObjParser.parse(objText);
                // Scale down survival pack models to match smaller player character
                const adjustedScale = item.modelScale * 0.55;
                this._normalizeMeshData(parsed, adjustedScale);

                const mesh = new Mesh(gl, parsed);
                const key = 'survival:' + item.id;
                this.engine.assets.models[key] = mesh;

                // Register as a drifting debris type (reuses full pickup → inventory pipeline)
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

    /**
     * Recenter a parsed OBJ mesh on the XZ origin, drop its base to y=0,
     * and uniformly scale it to a target world height so it rests nicely on water.
     */
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
        // Scale by the LARGEST dimension so elongated items lying flat
        // (e.g. paddles, pans) don't get wildly over-scaled on a small Y axis
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
