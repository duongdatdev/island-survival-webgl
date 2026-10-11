import { CAMPAIGN_CHAPTERS, CAMPAIGN_SIDE_QUESTS, CAMPAIGN_JOURNALS } from '../gameplay/CampaignStory.js';
import { transactCraft } from './ItemContainer.js';

const UNIQUE_EVENTS = new Set(['poiVisited', 'journalRead', 'optionalJournalRead', 'deviceRepaired', 'shortcutOpened', 'endingCompleted']);
const keyOf = (event, id = '') => `${event}:${id}`;

export class CampaignProgression {
    constructor(events, options = {}) {
        this.events = events;
        this.chapter = 1;
        this.tier = 1;
        this.facts = {};
        this.completedChapters = new Set();
        this.completedSideQuests = new Set();
        this.journals = new Set();
        this.blueprints = options.blueprints || new Set();
        this.questItems = new Set();
        this.pendingRewards = [];
        this.lastMilestone = 'Dạt vào bờ';
        this._evaluating = false;
        this._unsubscribe = events?.on('*', event => this.record(event.eventType, event));
    }

    record(type, payload = {}) {
        if (!['drank', 'structurePlaced', 'journalRead', 'poiVisited', 'crafted', 'deviceRepaired',
            'endingCompleted', 'slept', 'fishCaught', 'cropHarvested', 'shortcutOpened',
            'stormCargoClaimed', 'optionalJournalRead'].includes(type)) return;
        const id = ['structurePlaced', 'cropHarvested'].includes(type) ? payload.type || '' : payload.id || '';
        const key = keyOf(type, id);
        const count = Number.isFinite(payload.count) && payload.count > 0 ? payload.count : 1;
        if (UNIQUE_EVENTS.has(type) && this.facts[key]) return;
        this.facts[key] = UNIQUE_EVENTS.has(type) ? 1 : (this.facts[key] || 0) + count;
        if (id) this.facts[keyOf(type)] = (this.facts[keyOf(type)] || 0) + count;
        this.evaluate();
    }

    readJournal(id) {
        const journal = CAMPAIGN_JOURNALS[id];
        if (!journal) return null;
        if (!this.journals.has(id)) {
            this.journals.add(id);
            this.record(journal.optional ? 'optionalJournalRead' : 'journalRead', { id });
            if (id === 'station_coordinates') this.questItems.add('island_coordinates');
            this.events?.emit('journalUnlocked', { id, journal });
        }
        return journal;
    }

    progress(objective) {
        if (objective.anyOf) return Math.min(objective.count, Math.max(...objective.anyOf.map(choice => this.progress(choice))));
        return Math.min(objective.count, this.facts[keyOf(objective.event, objective.id)] || 0);
    }

    complete(objectives) { return objectives.every(objective => this.progress(objective) >= objective.count); }

    evaluate() {
        if (this._evaluating) return;
        this._evaluating = true;
        try {
            for (const chapter of CAMPAIGN_CHAPTERS) {
                if (this.completedChapters.has(chapter.id)) continue;
                if (!this.complete(chapter.objectives)) break;
                this.completedChapters.add(chapter.id);
                this.chapter = Math.min(CAMPAIGN_CHAPTERS.length, chapter.id + 1);
                this.tier = Math.max(this.tier, chapter.reward.tier || 1);
                for (const blueprint of chapter.reward.blueprints || []) this.blueprints.add(blueprint);
                if (chapter.reward.items?.length) this.pendingRewards.push({ id: `chapter-${chapter.id}`, items: chapter.reward.items });
                this.lastMilestone = chapter.title;
                this.events?.emit('chapterCompleted', { id: chapter.id, title: chapter.title, nextChapter: this.chapter, tier: this.tier });
            }
            for (const quest of CAMPAIGN_SIDE_QUESTS) {
                if (this.chapter < quest.chapter || this.completedSideQuests.has(quest.id) || !this.complete(quest.objectives)) continue;
                this.completedSideQuests.add(quest.id);
                this.pendingRewards.push({ id: quest.id, items: quest.reward });
                this.lastMilestone = quest.title;
                this.events?.emit('sideQuestCompleted', { id: quest.id, title: quest.title });
            }
        } finally { this._evaluating = false; }
    }

    claimRewards(inventory) {
        let claimed = 0;
        while (this.pendingRewards.length) {
            const reward = this.pendingRewards[0];
            if (!transactCraft([inventory], {}, reward.items)) break;
            this.pendingRewards.shift();
            claimed++;
        }
        return claimed;
    }

    currentChapter() { return CAMPAIGN_CHAPTERS[this.chapter - 1]; }
    objectives() {
        return this.currentChapter().objectives.map(objective => ({ ...objective, progress: this.progress(objective) }));
    }
    sideQuests() {
        return CAMPAIGN_SIDE_QUESTS.filter(quest => this.chapter >= quest.chapter).map(quest => ({ ...quest,
            completed: this.completedSideQuests.has(quest.id),
            objectives: quest.objectives.map(objective => ({ ...objective, progress: this.progress(objective) })) }));
    }

    snapshot() {
        return { chapter: this.chapter, tier: this.tier, facts: { ...this.facts },
            completedChapters: [...this.completedChapters], completedSideQuests: [...this.completedSideQuests],
            journals: [...this.journals], blueprints: [...this.blueprints], questItems: [...this.questItems],
            pendingRewards: structuredClone(this.pendingRewards), lastMilestone: this.lastMilestone };
    }

    restore(snapshot = {}) {
        this.chapter = Math.max(1, Math.min(6, Number(snapshot.chapter) || 1));
        this.tier = Math.max(1, Math.min(3, Number(snapshot.tier) || 1));
        this.facts = Object.fromEntries(Object.entries(snapshot.facts || {}).filter(([, value]) => Number.isFinite(value) && value >= 0));
        this.completedChapters = new Set((snapshot.completedChapters || []).filter(id => CAMPAIGN_CHAPTERS.some(chapter => chapter.id === id)));
        this.completedSideQuests = new Set((snapshot.completedSideQuests || []).filter(id => CAMPAIGN_SIDE_QUESTS.some(quest => quest.id === id)));
        this.journals = new Set((snapshot.journals || []).filter(id => CAMPAIGN_JOURNALS[id]));
        this.blueprints.clear();
        for (const id of snapshot.blueprints || []) this.blueprints.add(id);
        this.questItems = new Set(snapshot.questItems || []);
        this.pendingRewards = structuredClone(snapshot.pendingRewards || []);
        this.lastMilestone = snapshot.lastMilestone || this.currentChapter().title;
        this.evaluate();
    }

    dispose() { this._unsubscribe?.(); }
}
