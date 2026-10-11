import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldSurvey, assertFieldSurveySnapshot, waterSurveyStates, pressureReadings, SURVEY_STATIONS } from '../src/systems/FieldSurvey.js';
import { CampaignController } from '../src/systems/CampaignController.js';
import { CampaignProgression } from '../src/systems/CampaignProgression.js';
import { GameEvents } from '../src/systems/GameEvents.js';
import { CAMPAIGN_CHAPTERS } from '../src/gameplay/CampaignStory.js';
import { worldSnapshot } from './fixtures/world-snapshot.js';
import { validateSnapshot } from '../src/systems/SnapshotCodec.js';

const pressureSolution = ([x, y, z]) => { const a = (4 * x - 2 * y + z) / 9, b = x - 2 * a; return [a, b, y - 2 * b]; };
function solve(survey, act = (...args) => survey.act(...args)) {
    for (const angle of survey.layout.wind) { assert.equal(act('wind', 'angle', angle).ok, true); assert.equal(act('wind', 'measure').ok, true); }
    const node = waterSurveyStates().find(n => n.levels.every((v, i) => v === survey.layout.water[i]));
    for (const transfer of node.route) assert.equal(act('water', 'pour', transfer).ok, true);
    assert.equal(act('water', 'test').ok, true);
    pressureSolution(survey.layout.pressure).forEach((value, index) => {
        for (let step = 0; step < value; step++) assert.equal(act('pressure', 'turn', [index, 1]).ok, true);
    });
    assert.equal(act('pressure', 'test').ok, true);
}

test('100 field survey seeds have solvable distinct instruments, conserve water and never require time gates', () => {
    const layouts = new Set();
    for (let seed = 0; seed < 100; seed++) {
        const survey = new FieldSurvey('survey-' + seed); layouts.add(JSON.stringify(survey.layout));
        assert.equal(survey.allComplete(), false); assert.equal(survey.act('water', 'test').ok, false);
        assert.equal(survey.act('pressure', 'test').ok, false);
        solve(survey); assert.equal(survey.allComplete(), true);
        assert.equal(survey.water.levels.reduce((sum, v) => sum + v, 0), 8);
        assert.deepEqual(pressureReadings(survey.pressure.valves), survey.layout.pressure);
        assertFieldSurveySnapshot(survey.snapshot(), 'survey-' + seed);
        const complete = survey.snapshot();
        for (const station of SURVEY_STATIONS) assert.equal(survey.act(station.id, 'reset').ok, false);
        assert.deepEqual(survey.snapshot(), complete);
    }
    assert.ok(layouts.size > 95);
});

test('partial instruments restore independently and invalid snapshots cannot replace a valid survey', () => {
    const survey = new FieldSurvey('partial'); survey.act('wind', 'angle', survey.layout.wind[0]); survey.act('wind', 'measure');
    survey.act('water', 'pour', [0, 1]); survey.act('pressure', 'turn', [2, 1]);
    const partial = survey.snapshot(), resumed = new FieldSurvey('partial'); resumed.restore(partial);
    assert.deepEqual(resumed.snapshot(), partial); partial.water.levels[0] = 99; assert.equal(resumed.water.levels[0], 3);
    const valid = resumed.snapshot();
    for (const change of [s => { s.wind.readings[0] = (s.wind.readings[0] + 45) % 360; }, s => { s.wind.angle = 3; },
        s => { s.water.levels = [8, 1, 0]; }, s => { s.water.complete = true; }, s => { s.pressure.complete = true; },
        s => { s.pressure.valves[0] = 10; }, s => { s.wind.moves = -1; }]) {
        const broken = structuredClone(valid); change(broken); assert.throws(() => resumed.restore(broken)); assert.deepEqual(resumed.snapshot(), valid);
    }
    resumed.act('pressure', 'reset'); assert.deepEqual(resumed.wind, valid.wind); assert.deepEqual(resumed.water, valid.water);
});

test('field readings persist as unique early facts, gate coordinates and preserve completed pre-survey campaigns', () => {
    const c = Object.create(CampaignController.prototype); c.events = new GameEvents(); c.progress = new CampaignProgression(c.events);
    c.fieldSurvey = new FieldSurvey('controller'); c.saveMilestone = () => {};
    c.scene = { player: { position: [0, 1, 0] }, engine: { audio: { playCraft() {} } } };
    c.landmarks = { surveyStations: Object.fromEntries(SURVEY_STATIONS.map(s => [s.id, { ...s, position: [0, 1, 0] }])) };
    c.ui = { open(kind) { this.kind = kind; } }; c.journals = { station_coordinates: { position: [0, 1, 0], poi: 'weather_station' } };
    c.scene.player.position = [10, 1, 0]; assert.equal(c.surveyCommand('water', 'pour', [0, 1]).ok, false);
    c.scene.player.position = [0, 1, 0]; c.events.emit('deviceRepaired', { id: 'station_gate' }); c.events.emit('deviceRepaired', { id: 'station_console' });
    c.readJournal('station_coordinates'); assert.equal(c.ui.kind, 'survey-report'); assert.equal(c.progress.journals.has('station_coordinates'), false);
    solve(c.fieldSurvey, (...args) => c.surveyCommand(...args));
    for (const station of SURVEY_STATIONS) { assert.equal(c.progress.facts['deviceRepaired:' + station.eventId], 1); assert.equal(c.surveyCommand(station.id, 'test').ok, false); }
    for (const chapter of CAMPAIGN_CHAPTERS.slice(0, 3)) for (const item of chapter.objectives) {
        const objective = item.anyOf?.[0] || item; c.progress.record(objective.event, { id: objective.id, type: objective.id, count: objective.count });
    }
    c.events.emit('poiVisited', { id: 'weather_station' }); c.readJournal('station_coordinates');
    assert.equal(c.progress.chapter, 5); assert.equal(c.progress.tier, 3); assert.equal(c.progress.questItems.has('island_coordinates'), true);
    const old = Object.create(CampaignController.prototype); old.progress = new CampaignProgression(); old.progress.completedChapters.add(4); old.fieldSurvey = new FieldSurvey('old');
    assert.equal(old.fieldReadingsReady(), true); assert.equal(old.fieldSurvey.allComplete(), false);
});

test('save codec cross-checks completed survey data against its progression facts', () => {
    const snapshot = worldSnapshot({ mode: 'campaign', generatorVersion: 2, seed: 'codec' }), survey = new FieldSurvey('codec');
    snapshot.campaign.fieldSurvey = survey.snapshot(); assert.equal(validateSnapshot(snapshot), true);
    solve(survey); snapshot.campaign.fieldSurvey = survey.snapshot(); assert.equal(validateSnapshot(snapshot), false);
    for (const station of SURVEY_STATIONS) snapshot.campaign.facts['deviceRepaired:' + station.eventId] = 1;
    assert.equal(validateSnapshot(snapshot), true);
    snapshot.campaign.fieldSurvey.wind.readings[0] = (survey.layout.wind[0] + 90) % 360; assert.equal(validateSnapshot(snapshot), false);
    delete snapshot.campaign.fieldSurvey; assert.equal(validateSnapshot(snapshot), true);
});
