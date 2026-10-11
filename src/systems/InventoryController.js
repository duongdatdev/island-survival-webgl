import { CraftingSystem } from './CraftingSystem.js';
import { ParticleSystem } from './ParticleSystem.js';
import { getAllRecipes, getRecipeDef } from './RecipeDatabase.js';
import { getResourceDef } from './ResourceDatabase.js';

const VITAL_ACTIONS = {
    hunger: { method: 'eat', verb: 'Đã ăn', label: 'Đói' },
    thirst: { method: 'drink', verb: 'Đã uống', label: 'Khát' },
    health: { method: 'heal', verb: 'Đã dùng', label: 'HP' },
};

export class InventoryController {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.document = options.document || globalThis.document;
        this.menu = null;
        this.closeButton = null;
        this.categoryButtons = [];
        this.selectedCategory = 'tool';
        this.selectedRecipeId = null;
        this._initialized = false;
        this._categoryListeners = new Map();
        this._trashElement = null;
        this._trashListeners = null;
        this._onInventoryChange = null;
        this._onClose = null;
    }

    init() {
        if (this._initialized || !this.document) return;
        this._initialized = true;
        const scene = this.scene;

        this.menu = this.document.getElementById('inventory-menu');
        this.closeButton = this.document.getElementById('inventory-menu-close');
        this.categoryButtons = Array.from(this.document.querySelectorAll('.cat-btn'));
        scene.inventoryMenu = this.menu;

        this._onInventoryChange = () => {
            this.renderInventory();
            this.renderCraftingPanel();
        };
        scene.inventory.onChange = this._onInventoryChange;

        this._onClose = () => this.closeMenu();
        this.closeButton?.addEventListener('click', this._onClose);

        for (const button of this.categoryButtons) {
            const listener = () => {
                this.categoryButtons.forEach(item => item.classList.remove('active'));
                button.classList.add('active');
                this.selectedCategory = button.getAttribute('data-category');
                this.selectedRecipeId = null;
                this.renderCraftingPanel();
                scene.engine.audio.playClick();
            };
            this._categoryListeners.set(button, listener);
            button.addEventListener('click', listener);
        }

        this._bindTrashEvents();
        this.renderInventory();
    }

    dispose() {
        if (!this._initialized) return;
        this.closeButton?.removeEventListener('click', this._onClose);
        for (const [button, listener] of this._categoryListeners) {
            button.removeEventListener('click', listener);
        }
        this._categoryListeners.clear();
        this._unbindTrashEvents();
        if (this.scene.inventory?.onChange === this._onInventoryChange) {
            this.scene.inventory.onChange = null;
        }
        this._initialized = false;
    }

    renderInventory() {
        const scene = this.scene;
        const inventory = scene.inventory;
        const gridEl = this.document?.getElementById('inventory-grid');
        const hotbarEl = this.document?.getElementById('hotbar-hud');
        const counterEl = this.document?.getElementById('slot-counter');

        if (counterEl) counterEl.textContent = `${inventory.getUsedSlots()}/${inventory.maxSlots}`;

        if (gridEl) {
            let html = '';
            for (let index = 0; index < 20; index++) {
                const slot = inventory.slots[index];
                if (slot) {
                    const definition = getResourceDef(slot.id);
                    const icon = definition ? definition.icon : '📦';
                    const name = definition ? definition.name : slot.id;
                    const consumableClass = definition?.consumable ? ' consumable' : '';
                    html += `
                        <div class="inv-slot${consumableClass}" data-index="${index}" draggable="true" title="${name}">
                            <span class="slot-icon">${icon}</span>
                            <span class="slot-count">${slot.count}</span>
                            <div class="slot-tooltip">${name}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="inv-slot empty" data-index="${index}">
                            <span class="slot-icon">·</span>
                        </div>
                    `;
                }
            }
            gridEl.innerHTML = html;
        }

        if (hotbarEl) {
            let html = '';
            for (let index = 0; index < 8; index++) {
                const slotIndex = 20 + index;
                const slot = inventory.slots[slotIndex];
                const activeClass = index === inventory.selectedHotbarIndex ? ' active' : '';
                if (slot) {
                    const definition = getResourceDef(slot.id);
                    const icon = definition ? definition.icon : '📦';
                    const name = definition ? definition.name : slot.id;
                    const consumableClass = definition?.consumable ? ' consumable' : '';
                    html += `
                        <div class="hotbar-slot${activeClass}${consumableClass}" data-index="${slotIndex}" draggable="true" title="${name}">
                            <span class="hotbar-key">${index + 1}</span>
                            <span class="slot-icon">${icon}</span>
                            <span class="slot-count">${slot.count}</span>
                            <div class="slot-tooltip">${name}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="hotbar-slot empty${activeClass}" data-index="${slotIndex}">
                            <span class="hotbar-key">${index + 1}</span>
                            <span class="slot-icon">·</span>
                        </div>
                    `;
                }
            }
            hotbarEl.innerHTML = html;
            this._renderAmmoCounter(hotbarEl);
        }

        this._bindSlotEvents();
    }

    _renderAmmoCounter(hotbarEl) {
        const inventory = this.scene.inventory;
        const equipped = inventory.slots[20 + inventory.selectedHotbarIndex];
        let ammoEl = this.document.getElementById('ammo-counter');
        if (equipped?.id === 'bow') {
            if (!ammoEl) {
                ammoEl = this.document.createElement('div');
                ammoEl.id = 'ammo-counter';
                ammoEl.className = 'ammo-counter';
                hotbarEl.parentNode?.appendChild(ammoEl);
            }
            ammoEl.innerHTML = `➵ ${inventory.getCount('arrow')}`;
            ammoEl.style.display = '';
        } else if (ammoEl) {
            ammoEl.style.display = 'none';
        }
    }

    _bindSlotEvents() {
        const slots = this.document?.querySelectorAll('.inv-slot, .hotbar-slot') || [];
        for (const slot of slots) {
            slot.addEventListener('dragstart', event => {
                const index = slot.getAttribute('data-index');
                if (index === null) return;
                event.dataTransfer.setData('text/plain', index);
                event.dataTransfer.effectAllowed = 'move';
                slot.classList.add('dragging');
            });
            slot.addEventListener('dragend', () => {
                slot.classList.remove('dragging');
                this._trashElement?.classList.remove('drag-over');
            });
            slot.addEventListener('dragover', event => event.preventDefault());
            slot.addEventListener('dragenter', event => {
                event.preventDefault();
                if (!slot.classList.contains('dragging')) slot.classList.add('drag-over');
            });
            slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
            slot.addEventListener('drop', event => {
                event.preventDefault();
                slot.classList.remove('drag-over');
                const source = event.dataTransfer.getData('text/plain');
                if (source === '') return;
                const sourceIndex = Number.parseInt(source, 10);
                const destinationIndex = Number.parseInt(slot.getAttribute('data-index'), 10);
                if (sourceIndex !== destinationIndex) {
                    this.scene.inventory.moveOrMerge(sourceIndex, destinationIndex);
                    this.scene.engine.audio.playClick();
                }
            });
            slot.addEventListener('contextmenu', event => {
                event.preventDefault();
                const index = Number.parseInt(slot.getAttribute('data-index'), 10);
                const item = this.scene.inventory.slots[index];
                if (!item || this.consumeItemAt(index)) return;
                const definition = getResourceDef(item.id);
                if (definition && (item.id === 'campfire' || item.id === 'water_collector' || item.id === 'shelter')) {
                    const hotbarOffset = index - 20;
                    if (hotbarOffset >= 0 && hotbarOffset < 8) {
                        this.scene.inventory.selectedHotbarIndex = hotbarOffset;
                    }
                    this.closeMenu();
                    this.scene._showNotification(`🔧 Đã chọn ${definition.name}. Nhấn Q để đặt!`);
                }
            });
            slot.addEventListener('dblclick', () => {
                const index = Number.parseInt(slot.getAttribute('data-index'), 10);
                this.consumeItemAt(index);
            });
        }
    }

    _bindTrashEvents() {
        const trash = this.document?.getElementById('trash-slot');
        if (!trash || this._trashListeners) return;
        const dragover = event => event.preventDefault();
        const dragenter = () => trash.classList.add('drag-over');
        const dragleave = () => trash.classList.remove('drag-over');
        const drop = event => {
            event.preventDefault();
            trash.classList.remove('drag-over');
            const source = event.dataTransfer.getData('text/plain');
            if (source === '') return;
            const sourceIndex = Number.parseInt(source, 10);
            const item = this.scene.inventory.slots[sourceIndex];
            if (!item) return;
            const definition = getResourceDef(item.id);
            const name = definition ? definition.name : item.id;
            this.scene.inventory.slots[sourceIndex] = null;
            this.scene.inventory.onChange?.();
            this.scene._showNotification(`🗑️ Đã vứt bỏ: ${item.count}x ${name}`);
            this.scene.engine.audio.playClick();
        };
        this._trashElement = trash;
        this._trashListeners = { dragover, dragenter, dragleave, drop };
        for (const [type, listener] of Object.entries(this._trashListeners)) {
            trash.addEventListener(type, listener);
        }
    }

    _unbindTrashEvents() {
        if (!this._trashElement || !this._trashListeners) return;
        for (const [type, listener] of Object.entries(this._trashListeners)) {
            this._trashElement.removeEventListener(type, listener);
        }
        this._trashElement = null;
        this._trashListeners = null;
    }

    consumeItemAt(index) {
        const scene = this.scene;
        const item = scene.inventory.slots[index];
        if (!item) return false;
        const definition = getResourceDef(item.id);
        const effect = definition?.consumable ? definition.vitalEffect : null;
        if (!effect) return false;
        const action = VITAL_ACTIONS[effect.type];
        if (!action) {
            console.warn(`InventoryController: '${item.id}' has an unknown vitalEffect type '${effect.type}'.`);
            return false;
        }

        scene.inventory.removeItemAt(index, 1);
        scene.vitals[action.method](effect.amount);
        if (effect.type === 'thirst') scene.campaign?.events.emit('drank', { id: 'fresh_water' });
        scene.campaign?.saveMilestone();
        scene._showNotification(`${definition.icon} ${action.verb} ${definition.name}! ${action.label} +${effect.amount}`);
        if (effect.type === 'hunger') scene.engine.audio.playEat();
        else if (effect.type === 'thirst') scene.engine.audio.playDrink();
        else if (effect.type === 'health') scene.engine.audio.playHeal();
        scene.engine.audio.setHealthFraction(scene.vitals.health / 100);
        this.renderInventory();
        return true;
    }

    useActiveItem() {
        const scene = this.scene;
        if (scene.campaign?.useActiveItem()) return;
        const activeIndex = 20 + scene.inventory.selectedHotbarIndex;
        const activeItem = scene.inventory.slots[activeIndex];
        if (!activeItem) {
            scene._showNotification('❌ Ô hotbar đang chọn trống!');
            scene.engine.audio.playError();
            return;
        }
        const definition = getResourceDef(activeItem.id);
        if (!definition) return;

        if (definition.consumable) {
            if (this.consumeItemAt(activeIndex)) return;
            if (activeItem.id === 'shelter') this.placeStructure('shelter');
            else if (activeItem.id === 'campfire') this.placeStructure('campfire');
            else if (activeItem.id === 'water_collector') this.placeStructure('water_collector');
        } else if (activeItem.id === 'stone_axe') {
            scene._showNotification('🪓 Đang trang bị Rìu Đá! Nhấn chuột trái để chặt cây hoặc tấn công.');
        } else {
            scene._showNotification(`📦 Không thể sử dụng trực tiếp ${definition.name}!`);
        }
    }

    placeStructure(type) {
        const scene = this.scene;
        if (type === 'campfire' && scene.campfire?.isBuilt) {
            scene._showNotification('🔥 Đã có Lửa Trại rồi! Không thể đặt thêm.');
            scene.engine.audio.playError();
            return false;
        }
        if (type === 'water_collector' && scene.waterCollector?.isBuilt) {
            scene._showNotification('💧 Đã có Bẫy Nước rồi! Không thể đặt thêm.');
            scene.engine.audio.playError();
            return false;
        }

        if (type === 'shelter' && scene.shelter?.isBuilt) {
            scene._showNotification('⛺ Đã có Mái Trú Ẩn trong thế giới này.');
            return false;
        }
        const yaw = scene.player.rotation[1];
        let placeX = scene.player.position[0] + Math.sin(yaw) * 2;
        let placeZ = scene.player.position[2] + Math.cos(yaw) * 2;
        const island = scene.worldGenerator && scene.world?.terrainGenerator
            ? scene.world.terrainGenerator.island
            : null;
        const maxRadius = island ? Math.max(2, island.radius - 2) : 22;
        const distanceFromCenter = Math.hypot(placeX, placeZ);
        if (distanceFromCenter > maxRadius && distanceFromCenter > 0.0001) {
            const scale = maxRadius / distanceFromCenter;
            placeX *= scale;
            placeZ *= scale;
        }
        const placeY = scene.terrain.getHeight(placeX, placeZ);
        if (type === 'shelter') {
            const heights = [-1.9, 0, 1.9].flatMap(x => [-1.9, 0, 1.9].map(z =>
                scene.terrain.getHeight(placeX + x, placeZ + z)));
            if (Math.min(...heights) < 0.5 || Math.max(...heights) - Math.min(...heights) > 0.65) {
                scene._showNotification('⛺ Cần nền đất khô, bằng phẳng để dựng mái.');
                return false;
            }
        }
        const activeIndex = 20 + scene.inventory.selectedHotbarIndex;
        if (scene.inventory.slots[activeIndex]?.id !== type) return false;
        const buildPosition = [placeX, placeY + 0.5, placeZ];

        if (type === 'shelter') {
            scene.shelter.position.set([placeX, placeY, placeZ]);
            scene.shelter.isBuilt = true;
            scene.shelter.updateModelMatrix();
            scene.inventory.removeItemAt(activeIndex, 1);
            scene._showNotification('⛺ Đã dựng mái! Vào bên dưới để tránh mưa; nhấn E ban đêm để ngủ.');
        } else if (type === 'campfire') {
            scene.campfire.position.set([placeX, placeY, placeZ]);
            scene.campfire.isBuilt = true;
            scene.campfire.updateModelMatrix();
            scene.inventory.removeItemAt(activeIndex, 1);
            scene._showNotification('🔥 Đã đặt Lửa Trại! Đến gần để nấu ăn.');
            scene.engine.audio.addEmitter('campfire', 'campfire', buildPosition, true);
        } else if (type === 'water_collector') {
            scene.waterCollector.position.set([placeX, placeY, placeZ]);
            scene.waterCollector.isBuilt = true;
            scene.waterCollector.updateModelMatrix();
            scene.inventory.removeItemAt(activeIndex, 1);
            scene._showNotification('💧 Đã đặt Bẫy Nước Mưa! Nước hứng tự động.');
        } else {
            return false;
        }

        scene.engine.audio.playRaftBuild(buildPosition);
        scene.particleSystem.emit(buildPosition, ParticleSystem.PRESET.BUILD);
        return true;
    }

    toggleMenu() {
        if (!this.menu) return;
        if (this.menu.classList.contains('hidden')) {
            if (this.scene.campaign?.wreckSalvage?.active) {
                this.scene.campaign.wreckSalvage.pause();
                this.scene.campaign.saveMilestone();
            }
            this.menu.classList.remove('hidden');
            this.scene.engine.input.releasePointerLock();
            this.renderCraftingPanel();
            this.renderInventory();
            this.scene.tutorial.notifyCraftingOpened();
            this.scene.engine.audio.playOpenPanel();
            this.scene.engine.audio.setDucked(true);
        } else {
            this.closeMenu();
        }
    }

    closeMenu() {
        if (!this.menu) return;
        this.menu.classList.add('hidden');
        this.scene.engine.audio.playClosePanel();
        this.scene.engine.audio.setDucked(false);
        this.scene.engine.input.requestPointerLock();
        this.scene._syncPointerLockHint?.();
    }

    renderCraftingPanel() {
        if (this.scene.campaign) { this.scene.campaign.ui.renderCraftingPanel(); return; }
        const recipesListEl = this.document?.getElementById('crafting-recipes-list');
        const detailsEl = this.document?.getElementById('recipe-details-panel');
        if (!recipesListEl || !detailsEl) return;
        const scene = this.scene;
        const filteredRecipes = getAllRecipes().filter(recipe => {
            if (recipe.id === 'shelter' && scene.shelter?.isBuilt) return false;
            if (recipe.id === 'campfire' && scene.campfire?.isBuilt) return false;
            if (recipe.id === 'water_collector' && scene.waterCollector?.isBuilt) return false;
            if (recipe.requiresBlueprint && !scene.unlockedBlueprints.has(recipe.requiresBlueprint)) return false;
            return recipe.category === this.selectedCategory;
        });

        recipesListEl.innerHTML = filteredRecipes.map(recipe => {
            const canCraft = CraftingSystem.canCraft(recipe.id, scene.inventory);
            const canCraftClass = canCraft ? ' can-craft' : '';
            const selectedClass = recipe.id === this.selectedRecipeId ? ' selected' : '';
            return `
                <div class="recipe-item-card${canCraftClass}${selectedClass}" data-recipe-id="${recipe.id}">
                    <div class="recipe-item-icon">${recipe.icon}</div>
                    <div class="recipe-item-info">
                        <div class="recipe-item-name">${recipe.name}</div>
                        <div class="recipe-item-desc">${recipe.description}</div>
                    </div>
                    <div class="recipe-item-status">${canCraft ? '✔️' : '❌'}</div>
                </div>
            `;
        }).join('') || '<div class="details-placeholder" style="margin-top: 20px;">Không có công thức nào trong nhóm này</div>';

        for (const card of recipesListEl.querySelectorAll('.recipe-item-card')) {
            card.addEventListener('click', () => {
                this.selectedRecipeId = card.getAttribute('data-recipe-id');
                this.renderCraftingPanel();
            });
        }
        this._renderRecipeDetails(detailsEl);
    }

    _renderRecipeDetails(detailsEl) {
        const scene = this.scene;
        const recipe = this.selectedRecipeId ? getRecipeDef(this.selectedRecipeId) : null;
        if (!recipe) {
            detailsEl.innerHTML = '<div class="details-placeholder">Chọn một công thức để xem chi tiết & chế tạo</div>';
            return;
        }
        if ((recipe.id === 'shelter' && scene.shelter?.isBuilt)
            || (recipe.id === 'campfire' && scene.campfire?.isBuilt)
            || (recipe.id === 'water_collector' && scene.waterCollector?.isBuilt)) {
            this.selectedRecipeId = null;
            detailsEl.innerHTML = '<div class="details-placeholder">Chọn một công thức để xem chi tiết & chế tạo</div>';
            return;
        }

        const canCraft = CraftingSystem.canCraft(recipe.id, scene.inventory);
        const isPinned = scene.objectiveTracker?.getPinnedRecipeId() === recipe.id;
        const ingredients = Object.entries(recipe.ingredients).map(([id, required]) => {
            const current = scene.inventory.getCount(id);
            const definition = getResourceDef(id);
            return `
                <span class="ingredient-badge ${current >= required ? 'met' : 'missing'}">
                    ${definition?.icon || ''} ${definition?.name || id} ${current}/${required}
                </span>
            `;
        }).join('');
        detailsEl.innerHTML = `
            <div class="details-header">
                <div class="details-icon">${recipe.icon}</div>
                <div class="details-meta">
                    <div class="details-name">${recipe.name}</div>
                    <div class="details-desc">${recipe.description}</div>
                </div>
            </div>
            <div class="details-ingredients">${ingredients}</div>
            <div class="details-craft-btn-row">
                <button id="details-pin-btn" class="recipe-pin-btn" aria-pressed="${isPinned ? 'true' : 'false'}">
                    ${isPinned ? 'Bỏ ghim' : 'Ghim công thức'}
                </button>
                <button id="details-craft-btn" class="craft-btn" ${canCraft ? '' : 'disabled'}>Chế tạo</button>
            </div>
        `;
        this.document.getElementById('details-pin-btn')?.addEventListener('click', () => {
            scene.objectiveTracker?.togglePinnedRecipe(recipe.id);
            scene.engine.audio.playClick();
            this._renderRecipeDetails(detailsEl);
        });
        this.document.getElementById('details-craft-btn')?.addEventListener('click', () => {
            this.craftItem(recipe.id);
        });
    }

    craftItem(recipeId) {
        const scene = this.scene;
        if (scene.campaign) return scene.campaign.craft(recipeId).ok;
        const recipe = getRecipeDef(recipeId);
        if (!recipe) return false;
        if (!CraftingSystem.craft(recipeId, scene.inventory)) {
            console.warn(`InventoryController: Crafting failed for ${recipeId}`);
            scene.engine.audio.playError();
            return false;
        }
        scene.stats.itemsCrafted++;
        scene._showNotification(`🔨 Đã chế tạo: ${recipe.icon} ${recipe.name}!`);
        scene.engine.audio.playCraft();
        scene.particleSystem.emit(
            [scene.player.position[0], scene.player.position[1] + 0.5 * scene.player.scaleFactor, scene.player.position[2]],
            ParticleSystem.PRESET.CRAFT
        );
        scene.tutorial.notifyCrafted();
        this.renderCraftingPanel();
        return true;
    }
}
