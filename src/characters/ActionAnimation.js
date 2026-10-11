const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const radians = Math.PI / 180;

// Contact is a keyframe, shared with the gameplay clock rather than a sine-wave peak.
export function strikePose(elapsed, profile, direction = 1) {
    const contact = profile.impactTime;
    const duration = profile.duration;
    const ready = contact * 0.48;
    const hold = Math.min(0.045, (duration - contact) * 0.2);
    const tool = profile.id.includes('axe');
    const pick = profile.id.includes('pickaxe');
    const thrust = profile.id === 'spear';
    const windup = thrust ? [0, 7, 0.09] : tool || pick ? [pick ? 12 : 24, -26, 0.05] : [direction * 9, 8, 0.035];
    const hit = thrust ? [0, -3, -0.48] : tool || pick ? [pick ? -8 : -28, 24, -0.15] : [-direction * 5, -8, -0.36];
    let values;
    if (elapsed < ready) values = windup.map(v => v * ease(elapsed / ready));
    else if (elapsed < contact) values = windup.map((v, i) => mix(v, hit[i], ease((elapsed - ready) / (contact - ready))));
    else if (elapsed < contact + hold) values = hit;
    else values = hit.map(v => v * (1 - ease((elapsed - contact - hold) / (duration - contact - hold))));
    return { roll: values[0] * radians, pitch: values[1] * radians, z: values[2], charge: 0,
        shoulderSide: profile.id === 'fist' ? direction : 1 };
}

export const WORK_DURATIONS = Object.freeze({ pickup: 0.6, build: 0.95, craft: 1.05, cook: 1.1, repair: 1.1, eat: 1.2, drink: 1.2, cast: 0.65 });

export function workPose(kind, elapsed, phase = '') {
    const duration = WORK_DURATIONS[kind];
    const envelope = duration ? Math.sin(clamp(elapsed / duration) * Math.PI) : ease(elapsed / 0.2);
    const cycle = Math.sin(elapsed * (kind === 'salvage' ? 13 : 9));
    let roll = 0, pitch = 0, z = 0, x = 0, y = 0;
    if (kind === 'pickup') { pitch = 24 * envelope; z = -0.26 * envelope; y = -0.13 * envelope; }
    else if (kind === 'eat' || kind === 'drink') { pitch = -30 * envelope; y = 0.2 * envelope; z = 0.2 * envelope; x = -0.12 * envelope; }
    else if (kind === 'fish') { pitch = (phase === 'reeling' ? -18 + cycle * 5 : -7 + cycle * 1.5) * envelope; z = 0.03 * cycle * envelope; }
    else if (kind === 'hook' || kind === 'cast') { pitch = (phase === 'flying' || kind === 'cast' ? 28 : -12 + cycle * 10) * envelope; z = -0.12 * envelope; }
    else if (kind === 'swim') { roll = cycle * 10; pitch = cycle * 12; z = -0.08 * cycle; }
    else if (kind === 'cook') { x = Math.cos(elapsed * 8) * 0.055 * envelope; z = (-0.12 + cycle * 0.045) * envelope; pitch = 13 * envelope; }
    else if (kind === 'repair') { roll = cycle * 20 * envelope; pitch = 8 * envelope; z = -0.17 * envelope; }
    else if (kind === 'build') { pitch = (5 + Math.max(0, cycle) * 30) * envelope; z = -0.16 * Math.max(0, cycle) * envelope; }
    else if (kind === 'craft') { x = -0.08 * Math.abs(cycle) * envelope; pitch = (8 + cycle * 6) * envelope; z = -0.1 * envelope; }
    else { pitch = (12 + cycle * 14) * envelope; roll = cycle * (kind === 'salvage' ? 12 : 5) * envelope; z = -0.10 * envelope; }
    return { roll: roll * radians, pitch: pitch * radians, x, y, z, charge: 0, work: kind };
}

// Read actual activity state: releasing E, leaving range and cancellation stop the loop.
export function getWorkActivity(scene) {
    const campaign = scene.campaign;
    if (scene.isEscaping || scene._isGameOver || scene.isPaused || campaign?.ending.state) return null;
    if (campaign?.mineExtraction?.active) return { kind: 'mine', weapon: scene.inventory.hasItem('iron_pickaxe') ? 'iron_pickaxe' : 'stone_pickaxe' };
    if (campaign?.wreckSalvage?.active) return { kind: 'salvage' };
    if (campaign?.hook?.state) return { kind: 'hook', phase: campaign.hook.state.phase };
    const fish = campaign?.fishing?.state;
    if (fish && fish.phase !== 'landed') return { kind: 'fish', phase: fish.phase };
    if (scene.isFishing) return { kind: 'fish' };
    if (campaign?.swimY != null && scene.terrain.getHeight(scene.player.position[0], scene.player.position[2]) < -0.4) return { kind: 'swim' };
    return null;
}
