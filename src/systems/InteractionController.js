import { getSleepPlan, sleepUntilDawn } from './SleepSystem.js';
import { ParticleSystem } from './ParticleSystem.js';

const RAW_FOODS = ['raw_fish', 'raw_crab_meat', 'raw_seagull_meat', 'raw_boar_meat', 'coconut'];

export class InteractionController {
    constructor(scene) {
        this.scene = scene;
    }

    update(deltaTime) {
        const scene = this.scene;
        const input = scene.engine.input;
        const interactKey = input ? input.getBindingDisplayName('interact') : 'E';

        // Under the roof, the displayed sleep action owns the interact key.
        if (scene.shelter?.covers(scene.player.position)) {
            const plan = getSleepPlan(scene);
            const hint = scene._domCache.pickupHint;
            if (hint) {
                hint.textContent = plan.allowed
                    ? `[${interactKey}] Ngủ tới sáng · Đói −${Math.ceil(plan.hungerCost)} · Khát −${Math.ceil(plan.thirstCost)}`
                    : `⛺ Đang trú mưa · ${plan.reason}`;
                hint.classList.remove('hidden');
            }
            if (plan.allowed && input.isKeyPressed('interact')) {
                input.consumeAction('interact');
                sleepUntilDawn(scene);
                return;
            }
            // Keep cooking/collection available whenever sleeping is unavailable.
            if (plan.allowed) return;
        }
        const campfirePrompt = this._updateCampfire(interactKey);
        const waterPrompt = this._updateWaterCollector(interactKey);
        const raft = this._updateRaft(interactKey);
        const showWaterfallPrompt = this._updateWaterfall();
        const showFishingPrompt = this._updateFishing();
        const showChestPrompt = this._updateTreasureChest();

        this._updatePickups(deltaTime);
        this._renderPrompt({
            interactKey,
            showWaterfallPrompt,
            showFishingPrompt,
            showChestPrompt,
            campfirePrompt,
            waterPrompt,
            raftPrompt: raft.prompt,
        });
        this._updateEscapePrompt(raft.distance);
    }

    _updateCampfire(interactKey) {
        const scene = this.scene;
        const nearby = scene.campfire.isPlayerNear(scene.player.position);
        const inWarmthRange = scene.campfire.isPlayerInWarmthRange
            ? scene.campfire.isPlayerInWarmthRange(scene.player.position)
            : nearby;
        const hasRawFood = nearby && RAW_FOODS.some(id => scene.inventory.hasItem(id));
        const weakenedByRain = inWarmthRange && scene.campfire.fireIntensityMultiplier < 0.999;
        if (!hasRawFood && inWarmthRange) {
            const rainStatus = weakenedByRain ? ' · Lửa đang yếu vì mưa 🌧️' : '';
            return `Sưởi ấm · Hong khô 🔥${rainStatus}`;
        }
        if (!hasRawFood) return weakenedByRain ? 'Lửa đang yếu vì mưa 🌧️' : '';

        if (scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            const food = RAW_FOODS.find(id => scene.inventory.hasItem(id));
            if (food) {
                scene.inventory.removeItem(food, 1);
                scene.inventory.addItem('cooked_meal', 1);
                scene.stats.mealsCooked++;
                scene._showNotification('🔥 Đã nấu: 🍖 Thức Ăn Chín!');
                scene.engine.audio.playCraft();
                scene.particleSystem.emit(
                    [scene.campfire.position[0], scene.campfire.position[1] + 0.5, scene.campfire.position[2]],
                    ParticleSystem.PRESET.CRAFT
                );
            }
        }
        const rainStatus = weakenedByRain ? ' · Lửa yếu vì mưa 🌧️' : '';
        return `<span class="hint-key">${interactKey}</span> Nấu thức ăn 🔥${rainStatus}`;
    }

    _updateWaterCollector(interactKey) {
        const scene = this.scene;
        if (!scene.waterCollector.isPlayerNear(scene.player.position)) return '';

        const stored = scene.waterCollector.waterStored;
        const maxWater = scene.waterCollector.maxWater;
        const rainFactor = scene.weather?.getGameplayEffects?.().rainFactor || 0;
        let prompt;
        if (stored >= maxWater) {
            prompt = `<span class="hint-key">${interactKey}</span> Lấy nước — Đã đầy (${stored}/${maxWater}) 💧`;
        } else if (stored > 0) {
            const status = rainFactor > 0 ? 'Đang hứng' : 'Cần mưa';
            prompt = `<span class="hint-key">${interactKey}</span> Lấy nước (${stored}/${maxWater}) · ${status} 💧`;
        } else if (rainFactor > 0) {
            prompt = `Đang hứng nước... (0/${maxWater}) 💧`;
        } else {
            prompt = `Cần trời mưa để hứng nước (0/${maxWater}) 💧`;
        }

        if (stored > 0 && scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            if (scene.waterCollector.collectWater()) {
                scene.inventory.addItem('fresh_water', 1);
                scene._showNotification('💧 Đã lấy: Nước Ngọt!');
                scene.engine.audio.playDrink();
            }
        }
        return prompt;
    }

    _updateRaft(interactKey) {
        const scene = this.scene;
        const distance = scene.raftAssembly.distanceTo(scene.player.position);
        if (distance >= 3.0) return { distance, prompt: '' };

        const steps = [
            ['framePlaced', 'raft_frame', 'Lắp Khung Bè 🧱', 'Cần chế tạo Khung Bè 🧱 để lắp ráp'],
            ['floatsPlaced', 'barrel_floats', 'Lắp Phao Thùng 🛢️', 'Cần chế tạo Phao Thùng 🛢️ để lắp ráp'],
            ['paddlePlaced', 'paddle', 'Lắp Mái Chèo 🛶', 'Cần chế tạo Mái Chèo 🛶 để lắp ráp'],
            ['sailPlaced', 'raft_sail', 'Nâng Cấp: Lắp Cánh Buồm ⛵', 'Chế tạo Cánh Buồm ⛵ giúp di chuyển nhanh hơn'],
            ['motorPlaced', 'raft_motor', 'Nâng Cấp: Lắp Động Cơ Bè 🚀', 'Chế tạo Động Cơ Bè 🚀 để đạt tốc độ tối đa!'],
        ];
        const step = steps.find(([flag]) => !scene.raftAssembly[flag]);
        if (!step) return { distance, prompt: '' };

        const [flag, itemId, actionText, missingText] = step;
        const hasModule = scene.inventory.hasItem(itemId);
        const prompt = hasModule ? `<span class="hint-key">${interactKey}</span> ${actionText}` : missingText;
        if (hasModule && scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            scene.inventory.removeItem(itemId, 1);
            scene.raftAssembly[flag] = true;
            const messages = {
                raft_frame: '🧱 Lắp Khung Bè thành công!',
                barrel_floats: '🛢️ Lắp Phao Thùng thành công!',
                paddle: '🛶 Lắp Mái Chèo thành công!',
                raft_sail: '⛵ Lắp Cánh Buồm thành công! Bè lướt gió nhanh hơn.',
                raft_motor: '🚀 Lắp Động Cơ thành công! Đạt công suất phản lực.',
            };
            scene._showNotification(messages[itemId]);
            scene.engine.audio.playRaftBuild(scene.raftAssembly.position);
            scene.particleSystem.emit(
                [scene.raftAssembly.position[0], scene.raftAssembly.position[1] + 0.225, scene.raftAssembly.position[2]],
                ParticleSystem.PRESET.BUILD
            );
        }
        return { distance, prompt };
    }

    _updateWaterfall() {
        const scene = this.scene;
        if (!scene.waterfall || !scene.waterfall.isPlayerInPond(scene.player.position)) return false;
        if (scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            scene.vitals.drink(100);
            scene._showNotification('💧 Đã uống nước thác! Khôi phục hết Thối Khát.');
            scene.engine.audio.playDrink();
            scene.engine.audio.playSplash(scene.player.position);
            scene.particleSystem.emit(
                [scene.player.position[0], scene.player.position[1] - 0.5 * scene.player.scaleFactor, scene.player.position[2]],
                ParticleSystem.PRESET.SPLASH
            );
        }
        return true;
    }

    _updateFishing() {
        const scene = this.scene;
        const terrainHeight = scene.terrain.getHeight(scene.player.position[0], scene.player.position[2]);
        const hotbarItem = scene.inventory.slots[20 + scene.inventory.selectedHotbarIndex];
        const available = terrainHeight <= 0.15 && hotbarItem?.id === 'fishing_rod' && !scene.isFishing;
        if (available && scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            scene.isFishing = true;
            scene.fishingTimer = 4.0;
            scene.engine.audio.playSplash(scene.player.position);
        }
        return available;
    }

    _updateTreasureChest() {
        const scene = this.scene;
        const chest = scene.resourceManager.nearestPickable;
        if (!chest || chest.resourceId !== 'treasure_chest') return false;
        if (scene.engine.input.isKeyPressed('interact')) {
            scene.engine.input.consumeAction('interact');
            scene._openTreasureChest(chest);
        }
        return true;
    }

    _updatePickups(deltaTime) {
        const scene = this.scene;
        const countBeforeResource = scene._getTotalInventoryCount();
        scene.resourceManager.update(deltaTime, scene.player.position, scene.inventory, scene.engine.input);
        this._notifyPickup(countBeforeResource);

        const countBeforeDebris = scene._getTotalInventoryCount();
        scene.debrisManager.update(
            deltaTime,
            scene.player.position,
            scene.inventory,
            scene.engine.input,
            scene.terrain,
            scene.gl,
            scene.resourceManager.nearestPickable,
            scene.weather?.getGameplayEffects?.() || null
        );
        this._notifyPickup(countBeforeDebris);
    }

    _notifyPickup(previousCount) {
        const scene = this.scene;
        if (scene._getTotalInventoryCount() <= previousCount) return;
        scene.stats.resourcesPicked++;
        scene.engine.audio.playPickup();
        scene.particleSystem.emit(scene.player.position, ParticleSystem.PRESET.PICKUP);
        scene.tutorial.notifyPickup();
    }

    _renderPrompt(prompts) {
        const hint = this.scene._domCache.pickupHint;
        if (!hint) return;
        const text = prompts.showWaterfallPrompt
            ? `<span class="hint-key">${prompts.interactKey}</span> Uống nước thác ngọt mát 💧`
            : prompts.showFishingPrompt
                ? `<span class="hint-key">${prompts.interactKey}</span> Thả cần câu cá 🎣`
                : prompts.showChestPrompt
                    ? `<span class="hint-key">${prompts.interactKey}</span> Mở Rương Kho Báu 📦`
                    : prompts.campfirePrompt || prompts.waterPrompt || prompts.raftPrompt;
        if (!text) return;
        hint.innerHTML = text;
        hint.classList.remove('hidden');
    }

    _updateEscapePrompt(distance) {
        const scene = this.scene;
        if (!scene.raftAssembly.isComplete() || scene.isEscaping || !scene.escapeHud) return;
        if (distance < 4.0) {
            if (scene.escapeHud.classList.contains('hidden')) {
                scene.escapeHud.classList.remove('hidden');
                scene.engine.input.releasePointerLock();
                scene._syncPointerLockHint?.();
            }
        } else if (!scene.escapeHud.classList.contains('hidden')) {
            scene.escapeHud.classList.add('hidden');
            scene._syncPointerLockHint?.();
        }
    }
}
