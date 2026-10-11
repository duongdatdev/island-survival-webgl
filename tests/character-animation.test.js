import test from 'node:test';
import assert from 'node:assert/strict';
import { strikePose, workPose, getWorkActivity, WORK_DURATIONS } from '../src/characters/ActionAnimation.js';
import { FirstPersonViewModel } from '../src/characters/FirstPersonViewModel.js';
import { getWeaponProfile } from '../src/systems/CombatConfig.js';

function view() {
    return Object.assign(Object.create(FirstPersonViewModel.prototype), {
        weaponId: 'fist', _time: 0, _moveAmount: 0, _swingElapsed: Infinity,
        _swingDuration: 0.42, _bowReleaseElapsed: Infinity, _impactEmitted: true,
        _nextSwingDirection: 1, _activeSwingDirection: 1,
    });
}

test('every melee stroke reaches full extension at the actual damage keyframe and returns to rest', () => {
    for (const id of ['fist', 'spear', 'stone_axe', 'iron_axe', 'stone_pickaxe', 'iron_pickaxe']) {
        const profile = getWeaponProfile(id), hit = strikePose(profile.impactTime, profile);
        for (let time = 0; time < profile.duration; time += 0.005) {
            assert.ok(strikePose(time, profile).z >= hit.z - 1e-8, id);
        }
        for (const time of [0, profile.duration, Infinity]) {
            const pose = strikePose(time, profile);
            assert.ok(Math.abs(pose.roll) < 1e-8 && Math.abs(pose.pitch) < 1e-8 && Math.abs(pose.z) < 1e-8, id);
        }
    }
});

test('mining borrows the available pick without changing equipped weapon or emitting combat damage', () => {
    const v = view(); v.setWeapon('spear');
    v.setActivity({ kind: 'mine', weapon: 'iron_pickaxe' });
    assert.equal(v.visualWeaponId, 'iron_pickaxe');
    for (let i = 0; i < 100; i++) assert.equal(v.update(0.03, false), null);
    assert.equal(v.weaponId, 'spear');
    v.setActivity(null); v.update(0.2, false);
    assert.equal(v.visualWeaponId, 'spear');
    assert.equal(v._workBlend, 0);
});

test('work loops do not restart each frame; release blends out, and death clears them', () => {
    const v = view();
    v.setActivity({ kind: 'salvage' }); v.update(0.3, false);
    v.setActivity({ kind: 'salvage' }); assert.equal(v._workElapsed, 0.3);
    const pose = v._getWeaponPose(); v.setActivity(null);
    assert.deepEqual(v._getWeaponPose(), pose);
    v.cancelActivity(); assert.equal(v._work, null); assert.equal(v._workBlend, 0);
});

test('one-shot jobs finish and never replace an ongoing attack or held task', () => {
    const v = view();
    for (const kind of Object.keys(WORK_DURATIONS)) {
        v.playAction(kind); assert.equal(v._work.kind, kind);
        v.update(WORK_DURATIONS[kind] + 0.2, false); assert.equal(v._work, null);
    }
    v.beginAttack('stone_axe'); v.playAction('pickup'); assert.equal(v._work, null);
    v.cancel(); v.setActivity({ kind: 'mine', weapon: 'stone_pickaxe' });
    v.playAction('craft'); assert.equal(v._work.kind, 'mine');
    v.beginAttack('fist'); assert.equal(v._work, null); assert.equal(v._workBlend, 0);
});

test('activity selection follows gameplay cancellation and fishing phases', () => {
    const scene = { campaign: { ending: {}, mineExtraction: { active: 'iron' }, wreckSalvage: {}, hook: {}, fishing: {} }, inventory: { hasItem: id => id === 'iron_pickaxe' } };
    assert.deepEqual(getWorkActivity(scene), { kind: 'mine', weapon: 'iron_pickaxe' });
    scene.campaign.mineExtraction.active = null;
    scene.campaign.fishing.state = { phase: 'reeling' };
    assert.deepEqual(getWorkActivity(scene), { kind: 'fish', phase: 'reeling' });
    scene.campaign.fishing.state.phase = 'landed'; assert.equal(getWorkActivity(scene), null);
    scene.campaign.wreckSalvage.active = 'wiring'; assert.equal(getWorkActivity(scene).kind, 'salvage');
    scene._isGameOver = true; assert.equal(getWorkActivity(scene), null);
});

test('jobs have distinct poses and all remain finite across entry and recovery', () => {
    const kinds = ['build', 'craft', 'cook', 'repair', 'salvage', 'pickup', 'eat', 'drink', 'fish', 'hook', 'swim'];
    const poses = kinds.slice(0, 5).map(kind => JSON.stringify(workPose(kind, 0.32)));
    assert.equal(new Set(poses).size, poses.length);
    for (const kind of kinds) for (const t of [0, 0.1, 0.5, 1, 10]) {
        for (const field of ['roll', 'pitch', 'x', 'y', 'z']) assert.ok(Number.isFinite(workPose(kind, t)[field]));
    }
});
