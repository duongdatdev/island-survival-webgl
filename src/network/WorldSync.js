import { getDebrisDef } from '../systems/DebrisDatabase.js';

// Shared world records are committed atomically with compare-and-swap on the server.
// Personal inventory travels in the same transaction, so a rejected pickup cannot award loot.
export const PROTOCOL_VERSION = 1;
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => JSON.parse(JSON.stringify(value));
const campaignFields = ['registry', 'production', 'claimedCaches', 'stationCircuit', 'fieldSurvey',
    'wreckSalvage', 'mineExtraction', 'islandEvents', 'deathBags', 'nextBag'];
const progressFields = ['chapter', 'tier', 'facts', 'completedChapters', 'completedSideQuests',
    'journals', 'blueprints', 'questItems', 'lastMilestone'];

export function sharedFromSnapshot(snapshot) {
    const shared = {
        raft: snapshot.raft, structures: snapshot.structures, blueprints: snapshot.blueprints,
        removed: snapshot.environment.removedObjectIds || [],
        clock: { ...snapshot.environment, removedObjectIds: undefined },
    };
    snapshot.resources.forEach((resource, i) => {
        shared['resource:' + (resource.netId || `initial-${i}`)] = { ...resource, netId: resource.netId || `initial-${i}` };
    });
    if (snapshot.campaign) {
        for (const key of campaignFields) if (snapshot.campaign[key] !== undefined) shared['campaign:' + key] = snapshot.campaign[key];
        // Facts have separate records so unrelated objectives can advance concurrently.
        for (const key of progressFields.filter(key => key !== 'facts')) shared['progress:' + key] = snapshot.campaign[key];
        for (const [key, value] of Object.entries(snapshot.campaign.facts || {})) shared['fact:' + key] = value;
        shared['campaign:towerRepaired'] = !!snapshot.campaign.ending.towerRepaired;
    }
    return clone(shared);
}

export function personalFromSnapshot(snapshot) {
    const campaign = snapshot.campaign ? { ...snapshot.campaign } : null;
    if (campaign) {
        for (const key of [...campaignFields, ...progressFields]) delete campaign[key];
        delete campaign.wildlife;
    }
    return clone({ player: snapshot.player, inventory: snapshot.inventory, vitals: snapshot.vitals,
        exposure: snapshot.exposure, stats: snapshot.stats, survivalSeconds: snapshot.survivalSeconds,
        playSeconds: snapshot.playSeconds || 0, campaign });
}

export function snapshotFromState(template, shared, personal) {
    const snapshot = { ...clone(template), ...clone(personal), savedAt: Date.now() };
    snapshot.resources = Object.entries(shared).filter(([key]) => key.startsWith('resource:')).map(([, value]) => clone(value));
    for (const key of ['raft', 'structures', 'blueprints']) snapshot[key] = clone(shared[key]);
    snapshot.environment = { ...clone(shared.clock), removedObjectIds: clone(shared.removed) };
    if (template.campaign) {
        snapshot.campaign = { ...clone(template.campaign), ...clone(personal.campaign || {}) };
        for (const key of campaignFields) if (shared['campaign:' + key] !== undefined) snapshot.campaign[key] = clone(shared['campaign:' + key]);
        for (const key of progressFields.filter(key => key !== 'facts')) snapshot.campaign[key] = clone(shared['progress:' + key]);
        snapshot.campaign.facts = Object.fromEntries(Object.entries(shared).filter(([key]) => key.startsWith('fact:')).map(([key, value]) => [key.slice(5), value]));
        snapshot.campaign.ending.towerRepaired = !!shared['campaign:towerRepaired'];
        // Animal poses are transport records; only living animals belong in a save.
        const animals = Object.entries(shared).filter(([key]) => key.startsWith('animal:')).map(([, value]) => value);
        if (animals.length) snapshot.campaign.wildlife = { killed: animals.filter(a => a.health <= 0).map(a => a.id),
            animals: animals.filter(a => a.health > 0).map(({ id, position, health, yaw, orbit }) => ({ id, position, health, yaw, orbit })) };
    }
    return snapshot;
}

export function diffShared(before, after) {
    const changes = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const previous = before[key] ?? null, value = after[key] ?? null;
        if (!same(previous, value)) changes.push({ key, before: previous, value });
    }
    return changes;
}

export function applyChanges(shared, changes) {
    const next = { ...shared };
    for (const { key, value } of changes) {
        if (value === null) delete next[key];
        else next[key] = value;
    }
    return next;
}

export function safeRecordKey(key) {
    return typeof key === 'string' && key.length < 180 &&
        !key.split(':').some(part => ['__proto__', 'constructor', 'prototype'].includes(part)) &&
        (['raft', 'structures', 'blueprints', 'removed', 'clock', 'campaign:towerRepaired'].includes(key)
        || /^(resource|animal|debris|fact):[a-zA-Z0-9_.:-]+$/.test(key)
        || campaignFields.some(field => key === 'campaign:' + field)
        || progressFields.some(field => key === 'progress:' + field && field !== 'facts'));
}

export function validTransportRecords(shared) {
    if (!shared || typeof shared !== 'object' || Array.isArray(shared)) return false;
    const entries = Object.entries(shared);
    if (entries.length > 21000 || !entries.every(([key]) => safeRecordKey(key))) return false;
    let animals = 0, debris = 0;
    for (const [key, value] of entries) {
        if (key.startsWith('resource:') && (!value || value.netId !== key.slice(9))) return false;
        if (key.startsWith('debris:')) {
            if (++debris > 100 || !value || value.netId !== key.slice(7) || !getDebrisDef(value.type)
                || !['position', 'direction'].every(field => Array.isArray(value[field]) && value[field].length === 3
                    && value[field].every(v => Number.isFinite(v) && Math.abs(v) < 10000))
                || !['speed', 'age', 'lifetime', 'yaw'].every(field => Number.isFinite(value[field]) && Math.abs(value[field]) < 100000)
                || value.age < 0 || value.lifetime <= 0 || typeof value.onShore !== 'boolean' || typeof value.hooked !== 'boolean'
                || value.owner !== null && (typeof value.owner !== 'string' || !/^[a-f0-9]{16}$/.test(value.owner))) return false;
        }
        if (key.startsWith('animal:')) {
            if (++animals > 128 || !value || value.id !== key.slice(7) || !Array.isArray(value.position)
                || value.position.length !== 3 || !value.position.every(v => Number.isFinite(v) && Math.abs(v) < 10000)
                || !Number.isFinite(value.yaw) || !Number.isFinite(value.health) || value.health < 0 || value.health > 10000
                || !['idle', 'patrol', 'chase', 'attack', 'flee', 'dead'].includes(value.state)
                || value.orbit != null && (!Array.isArray(value.orbit) || value.orbit.length !== 5 || !value.orbit.every(Number.isFinite))) return false;
        }
    }
    return true;
}
