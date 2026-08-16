
const STORAGE_KEY = 'island_survival_achievements_v1';

export const Achievements = [
    {
        id: 'first_pickup',
        icon: '🪵',
        name: 'Bước Đầu Sinh Tồn',
        description: 'Nhặt tài nguyên đầu tiên.',
        check: (s) => s.resourcesPicked >= 1,
    },
    {
        id: 'gatherer',
        icon: '🎒',
        name: 'Tay Săn Lượm',
        description: 'Nhặt 50 tài nguyên.',
        check: (s) => s.resourcesPicked >= 50,
    },
    {
        id: 'craftsman',
        icon: '🔨',
        name: 'Thợ Thủ Công',
        description: 'Chế tạo 10 vật phẩm.',
        check: (s) => s.itemsCrafted >= 10,
    },
    {
        id: 'chef',
        icon: '🍖',
        name: 'Đầu Bếp Đảo Hoang',
        description: 'Nấu 5 món ăn tại lửa trại.',
        check: (s) => s.mealsCooked >= 5,
    },
    {
        id: 'angler',
        icon: '🎣',
        name: 'Ngư Phủ',
        description: 'Câu được 5 con cá.',
        check: (s) => s.fishCaught >= 5,
    },
    {
        id: 'hunter',
        icon: '🏹',
        name: 'Thợ Săn',
        description: 'Hạ gục 5 sinh vật hoang dã.',
        check: (s) => s.creaturesKilled >= 5,
    },
    {
        id: 'treasure_hunter',
        icon: '📦',
        name: 'Săn Kho Báu',
        description: 'Mở đủ 4 rương kho báu trên đảo.',
        check: (s) => s.chestsOpened >= 4,
    },
    {
        id: 'survivor_5',
        icon: '⏳',
        name: 'Trụ Vững',
        description: 'Sinh tồn 5 phút liên tục.',
        check: (s) => s.survivalSeconds >= 300,
    },
    {
        id: 'survivor_15',
        icon: '🗿',
        name: 'Kẻ Bất Khuất',
        description: 'Sinh tồn 15 phút liên tục.',
        check: (s) => s.survivalSeconds >= 900,
    },
    {
        id: 'night_owl',
        icon: '🌙',
        name: 'Qua Một Đêm Dài',
        description: 'Sống sót trọn một đêm trên đảo.',
        check: (s) => s.nightsSurvived >= 1,
    },
    {
        id: 'storm_rider',
        icon: '⛈️',
        name: 'Vượt Bão',
        description: 'Trụ lại qua một cơn bão.',
        check: (s) => s.stormsSurvived >= 1,
    },
    {
        id: 'raft_builder',
        icon: '⛵',
        name: 'Thợ Đóng Bè',
        description: 'Hoàn thành chiếc bè cứu sinh.',
        check: (s) => s.raftCompleted >= 1,
    },
    {
        id: 'speed_demon',
        icon: '🚀',
        name: 'Tốc Độ Tối Đa',
        description: 'Lắp động cơ phản lực lên bè.',
        check: (s) => s.motorInstalled >= 1,
    },
    {
        id: 'escaped',
        icon: '🏆',
        name: 'Thoát Khỏi Đảo',
        description: 'Rời khỏi đảo hoang và trở về đất liền.',
        check: (s) => s.escaped >= 1,
    },
];

export function createStats() {
    return {
        resourcesPicked: 0,
        itemsCrafted: 0,
        mealsCooked: 0,
        fishCaught: 0,
        creaturesKilled: 0,
        chestsOpened: 0,
        survivalSeconds: 0,
        nightsSurvived: 0,
        stormsSurvived: 0,
        raftCompleted: 0,
        motorInstalled: 0,
        escaped: 0,
    };
}

export class AchievementSystem {
    constructor() {
        this.unlocked = new Set();

        this._queue = [];
        this._toastTimer = 0;
        this._activeToast = null;

        this._load();
    }

    evaluate(stats) {
        for (const def of Achievements) {
            if (this.unlocked.has(def.id)) continue;
            if (def.check(stats)) {
                this.unlock(def.id);
            }
        }
    }

    unlock(id) {
        if (this.unlocked.has(id)) return;
        const def = Achievements.find(a => a.id === id);
        if (!def) return;

        this.unlocked.add(id);
        this._persist();
        this._queue.push(def);
        console.log(`AchievementSystem: unlocked '${def.name}'`);
    }

    isUnlocked(id) {
        return this.unlocked.has(id);
    }

    getProgress() {
        return { unlocked: this.unlocked.size, total: Achievements.length };
    }

    resetAll() {
        this.unlocked.clear();
        this._persist();
    }

    update(deltaTime) {
        if (this._activeToast) {
            this._toastTimer -= deltaTime;
            if (this._toastTimer <= 0) {
                this._hideToast();
            }
            return;
        }

        if (this._queue.length > 0) {
            this._showToast(this._queue.shift());
        }
    }


    _showToast(def) {
        this._activeToast = def;
        this._toastTimer = 4.0;

        const el = document.getElementById('achievement-toast');
        if (!el) return;

        el.innerHTML = `
            <div class="achv-toast-icon">${def.icon}</div>
            <div class="achv-toast-body">
                <div class="achv-toast-label">THÀNH TỰU MỞ KHÓA</div>
                <div class="achv-toast-name">${def.name}</div>
                <div class="achv-toast-desc">${def.description}</div>
            </div>
        `;
        el.classList.remove('hidden');
        void el.offsetWidth;
        el.classList.add('visible');
    }

    _hideToast() {
        this._activeToast = null;
        const el = document.getElementById('achievement-toast');
        if (!el) return;

        el.classList.remove('visible');
        setTimeout(() => {
            if (!this._activeToast) el.classList.add('hidden');
        }, 350);
    }


    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const ids = JSON.parse(raw);
            if (Array.isArray(ids)) {
                for (const id of ids) this.unlocked.add(id);
            }
        } catch (e) {
            console.warn('AchievementSystem: could not read unlocks.', e);
        }
    }

    _persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.unlocked)));
        } catch (e) { }
    }
}
