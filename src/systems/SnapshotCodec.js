import { assertWorldEventsSnapshot } from './CampaignWorldEvents.js';
import { assertWildlifeSnapshot } from './WildlifeSnapshot.js';
import { FishingSystem } from './FishingSystem.js';
import { assertSceneSnapshot, assertCampaignSnapshot } from './CampaignSnapshotSchema.js';

export const CAMPAIGN_SAVE_VERSION = 2;

function vector(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== CAMPAIGN_SAVE_VERSION
        || !['classic', 'campaign'].includes(snapshot.mode)
        || typeof snapshot.worldSeed !== 'string' || !snapshot.worldSeed || snapshot.worldSeed.length > 64
        || !(snapshot.mode === 'classic' ? [1] : [2, 3]).includes(snapshot.generatorVersion)
        || !vector(snapshot.player?.position) || !Number.isFinite(snapshot.player.yaw)
        || !Number.isFinite(snapshot.survivalSeconds) || snapshot.survivalSeconds < 0
        || !['health', 'hunger', 'thirst', 'stamina'].every(key => Number.isFinite(snapshot.vitals?.[key])
            && snapshot.vitals[key] >= 0 && snapshot.vitals[key] <= 100)
        || !Array.isArray(snapshot.inventory?.slots) || snapshot.inventory.slots.length !== 28
        || !Number.isInteger(snapshot.inventory.selectedHotbarIndex)
        || snapshot.inventory.selectedHotbarIndex < 0 || snapshot.inventory.selectedHotbarIndex > 7
        || snapshot.inventory.slots.some(slot => slot && (typeof slot.id !== 'string'
            || !slot.id || !Number.isInteger(slot.count) || slot.count < 1 || slot.count > 999))) return false;
    try { assertSceneSnapshot(snapshot); } catch { return false; }
    if (snapshot.mode === 'campaign') {
        const campaign = snapshot.campaign;
        try {
            assertCampaignSnapshot(campaign, snapshot.worldSeed);
            if (campaign.islandEvents !== undefined) assertWorldEventsSnapshot(campaign.islandEvents);
            if (campaign.wildlife != null) assertWildlifeSnapshot(campaign.wildlife);
            if (campaign.fishing != null) new FishingSystem().restore(campaign.fishing);
        } catch { return false; }
    }
    return true;
}

export function upgradeClassicSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1) return null;
    const upgraded = { ...structuredClone(snapshot), version: CAMPAIGN_SAVE_VERSION,
        mode: 'classic', generatorVersion: 1 };
    return validateSnapshot(upgraded) ? upgraded : null;
}

function checksum(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

export function encodeSnapshot(worldId, slot, snapshot) {
    if (!validateSnapshot(snapshot)) throw new Error('Bản lưu không hợp lệ.');
    const json = JSON.stringify(snapshot);
    return { key: `${worldId}:${slot}`, worldId, slot, json, checksum: checksum(json),
        savedAt: snapshot.savedAt || Date.now() };
}

export function decodeSnapshot(record) {
    if (!record || typeof record.json !== 'string' || checksum(record.json) !== record.checksum) return null;
    try {
        const snapshot = JSON.parse(record.json);
        return validateSnapshot(snapshot) ? snapshot : null;
    } catch { return null; }
}
