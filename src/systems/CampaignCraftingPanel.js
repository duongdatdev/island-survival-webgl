import { getCampaignRecipes, STRUCTURE_DEFINITIONS } from '../gameplay/CampaignDatabase.js';
import { CAMPAIGN_CHAPTERS } from '../gameplay/CampaignStory.js';
import { getResourceDef } from './ResourceDatabase.js';
import { itemIcon } from './ItemIcons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const stationName = type => Object.values(STRUCTURE_DEFINITIONS).find(def => def.station === type)?.name || type;

/** Campaign recipes live beside the backpack; production remains authoritative. */
export class CampaignCraftingPanel {
    constructor(controller) {
        this.controller = controller;
        this.scene = controller.scene;
        this.menu = document.getElementById('inventory-menu');
        this.onClick = event => {
            const target = event.target.closest('[data-action]');
            if (!target || target.disabled) return;
            const { action, arg } = target.dataset;
            if (!['recipe', 'craft', 'pin'].includes(action)) return;
            const inventoryUI = this.scene.inventoryController;
            if (action === 'recipe') {
                inventoryUI.selectedRecipeId = arg;
                this.render();
                this.scene.engine.audio.playClick();
                document.getElementById('inventory-feedback').textContent = '';
                return;
            }
            let result;
            if (action === 'craft') result = controller.craft(arg);
            else {
                controller.pinnedRecipe = controller.pinnedRecipe === arg ? null : arg;
                result = { ok: true, message: controller.pinnedRecipe ? 'Đã ghim nguyên liệu lên màn hình.' : 'Đã bỏ ghim nguyên liệu.' };
                controller.saveMilestone();
            }
            this.render();
            controller.ui.refreshHUD();
            document.getElementById('inventory-feedback').textContent = result.ok
                ? result.message || (result.job ? 'Đã đưa vào hàng đợi. Nhận thành phẩm tại trạm.' : 'Đã chế tạo. Thành phẩm đã vào hành trang.')
                : result.error;
        };
        this.menu?.addEventListener('click', this.onClick);
    }

    unlockHint(recipe) {
        const progress = this.controller.progress;
        if (recipe.tier > progress.tier) {
            const chapter = CAMPAIGN_CHAPTERS.find(chapter => chapter.reward.tier >= recipe.tier);
            return chapter ? `Hoàn thành chương ${chapter.id} “${chapter.title}” để mở cấp ${recipe.tier}.` : `Cần công nghệ cấp ${recipe.tier}.`;
        }
        if (recipe.requiresBlueprint && !progress.blueprints.has(recipe.requiresBlueprint)) {
            const chapter = CAMPAIGN_CHAPTERS.find(chapter => chapter.reward.blueprints?.includes(recipe.requiresBlueprint));
            return chapter ? `Hoàn thành chương ${chapter.id} “${chapter.title}” để nhận bản thiết kế.` : 'Tìm bản thiết kế khi khám phá đảo.';
        }
        return '';
    }

    render() {
        const c = this.controller, scene = this.scene, inventoryUI = scene.inventoryController;
        const list = document.getElementById('crafting-recipes-list');
        const details = document.getElementById('recipe-details-panel');
        if (!inventoryUI || !list || !details) return;
        const active = document.activeElement;
        const focus = this.menu.contains(active) && active.dataset.action ? { ...active.dataset } : null;
        const scrollTop = list.scrollTop;
        const recipes = getCampaignRecipes().filter(recipe => inventoryUI.selectedCategory === 'all' || recipe.category === inventoryUI.selectedCategory)
            .sort((a, b) => a.tier - b.tier);
        const selected = recipes.find(recipe => recipe.id === inventoryUI.selectedRecipeId)
            || recipes.find(recipe => recipe.id === 'stone_axe') || recipes[0];
        inventoryUI.selectedRecipeId = selected?.id || null;
        const sources = c.registry.craftingSources(scene.player.position, scene.inventory);
        const count = id => sources.reduce((sum, source) => sum + source.getCount(id), 0);
        document.getElementById('crafting-context').innerHTML = `<span>CHẾ TẠO</span><span class="crafting-tier">Cấp ${c.progress.tier} · mở theo hành trình</span>`;
        list.innerHTML = recipes.map(recipe => {
            const check = c.production.checkCraft(recipe.id, scene.inventory, scene.player.position);
            const locked = this.unlockHint(recipe);
            const status = locked ? (recipe.tier > c.progress.tier ? `Khóa · cấp ${recipe.tier}` : 'Cần bản thiết kế') : check.ok ? 'Sẵn sàng' : recipe.station && check.error === 'Hãy đứng gần trạm phù hợp.' ? stationName(recipe.station) : check.error;
            return `<button type="button" class="recipe-item-card${selected?.id === recipe.id ? ' selected' : ''}${check.ok ? ' can-craft' : ''}${locked ? ' recipe-locked' : ''}" data-action="recipe" data-arg="${recipe.id}" aria-pressed="${selected?.id === recipe.id}">
                <span class="recipe-item-icon" aria-hidden="true">${itemIcon(recipe.outputId || recipe.id)}</span><span class="recipe-item-info"><span class="recipe-item-name">${escape(recipe.name)}</span><span class="recipe-item-desc">${escape(status)}</span></span><span class="recipe-item-status" aria-hidden="true">${check.ok ? '✓' : locked ? '–' : '·'}</span></button>`;
        }).join('') || '<p class="details-placeholder">Chưa có công thức trong nhóm này.</p>';
        list.scrollTop = scrollTop;
        if (!selected) { details.innerHTML = ''; return; }
        const recipe = selected, available = c.production.checkCraft(recipe.id, scene.inventory, scene.player.position);
        const unlock = this.unlockHint(recipe);
        const reason = unlock || (recipe.station && available.error === 'Hãy đứng gần trạm phù hợp.'
            ? `Đứng trong phạm vi 3 m của ${stationName(recipe.station)} để chế tạo.` : available.error || 'Đã đủ nguyên liệu và điều kiện chế tạo.');
        details.innerHTML = `<div class="details-header"><div class="details-icon" aria-hidden="true">${itemIcon(recipe.outputId || recipe.id)}</div><div class="details-meta"><div class="details-name">${escape(recipe.name)}</div><div class="details-desc">${recipe.station ? escape(stationName(recipe.station)) : 'Chế tạo bằng tay'}${recipe.duration ? ` · ${recipe.duration} giây` : ''}</div></div></div>
            ${recipe.description ? `<p class="recipe-description">${escape(recipe.description)}</p>` : ''}
            <p class="recipe-output">Thành phẩm: ${escape(getResourceDef(recipe.outputId)?.name || recipe.outputId)} ×${recipe.yield}</p>
            <div class="ingredient-heading">NGUYÊN LIỆU <span>Đang có / cần</span></div>
            <div class="details-ingredients">${Object.entries(recipe.ingredients).map(([id, required]) => `<div class="ingredient-row ${count(id) >= required ? 'met' : 'missing'}"><span class="ingredient-label">${itemIcon(id)}${escape(getResourceDef(id)?.name || id)}</span><strong>${count(id)} / ${required}</strong></div>`).join('')}</div>
            <p class="crafting-source-note">${sources.length > 1 ? `Túi + ${sources.length - 1} rương gần đã cho phép dùng nguyên liệu.` : 'Dùng nguyên liệu trong túi và thanh trang bị.'}</p>
            ${recipe.fuel ? `<p class="recipe-fuel">Cần nhiên liệu tại trạm: tối thiểu ${recipe.fuel.minimumSeconds} giây mỗi lượt, dùng gỗ hoặc than củi. Mưa làm tốn thêm nhiên liệu nếu trạm không có mái.</p>` : ''}
            <div class="details-craft-btn-row"><p class="recipe-availability${available.ok ? ' ready' : ''}">${escape(reason)}</p><button type="button" class="craft-btn" data-action="craft" data-arg="${recipe.id}" ${available.ok ? '' : 'disabled'}>${recipe.duration ? 'Đưa vào hàng đợi' : 'Chế tạo'}</button><button type="button" class="recipe-pin-btn" data-action="pin" data-arg="${recipe.id}" aria-pressed="${c.pinnedRecipe === recipe.id}">${c.pinnedRecipe === recipe.id ? 'Bỏ ghim nguyên liệu' : 'Ghim nguyên liệu'}</button></div>`;
        if (focus) {
            const replacement = [...this.menu.querySelectorAll('[data-action]')].find(el => el.dataset.action === focus.action && el.dataset.arg === focus.arg && !el.disabled);
            (replacement || inventoryUI.closeButton)?.focus({ preventScroll: true });
        }
    }

    dispose() { this.menu?.removeEventListener('click', this.onClick); }
}
