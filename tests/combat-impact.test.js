import test from 'node:test';
import assert from 'node:assert/strict';

import { FirstPersonViewModel } from '../src/characters/FirstPersonViewModel.js';
import { CombatSystem } from '../src/systems/CombatSystem.js';
import { getWeaponProfile } from '../src/systems/CombatConfig.js';

function createCreature(position = [0, 0, 1]) {
    return {
        position,
        state: 'idle',
        health: 30,
        takeDamage(amount) {
            this.health -= amount;
        },
    };
}

test('weapon combat profiles centralize timing and damage values', () => {
    assert.deepEqual(
        ['fist', 'stone_axe', 'spear', 'bow'].map(id => getWeaponProfile(id)?.id),
        ['fist', 'stone_axe', 'spear', 'bow']
    );
    assert.equal(getWeaponProfile('fist').range, 1.4);
    assert.equal(getWeaponProfile('stone_axe').impactTime, 0.24);
    assert.equal(getWeaponProfile('spear').damage, 25);
    assert.equal(getWeaponProfile('bow').maxDamage, 18);
    assert.equal(getWeaponProfile('missing'), null);
});

test('axe damage waits for impact and resolves only once', () => {
    const combat = new CombatSystem();
    const creature = createCreature();
    const pending = combat.beginMeleeAttack([0, 0, 0], 0, { id: 'stone_axe' }, [creature]);

    assert.ok(pending);
    assert.equal(creature.health, 30);
    assert.equal(combat.canAttack(), false);

    const impact = combat.resolveMeleeImpact(pending);
    assert.equal(impact.hit, true);
    assert.equal(creature.health, 20);

    const duplicate = combat.resolveMeleeImpact(pending);
    assert.equal(duplicate.swung, false);
    assert.equal(creature.health, 20);
});

test('axe impact misses when the locked target leaves its range', () => {
    const combat = new CombatSystem();
    const creature = createCreature();
    const pending = combat.beginMeleeAttack([0, 0, 0], 0, { id: 'stone_axe' }, [creature]);
    creature.position[2] = 3;

    const impact = combat.resolveMeleeImpact(pending);
    assert.equal(impact.hit, false);
    assert.equal(creature.health, 30);
});

test('first person axe view model emits one impact event per swing', () => {
    const viewModel = Object.create(FirstPersonViewModel.prototype);
    viewModel._time = 0;
    viewModel._moveAmount = 0;
    viewModel._swingElapsed = Infinity;
    viewModel._impactEmitted = false;
    viewModel._activeSwingDirection = 1;
    viewModel._nextSwingDirection = 1;

    viewModel.triggerSwing();
    assert.equal(viewModel.update(0.23, false), null);
    assert.deepEqual(viewModel.update(0.02, false), { type: 'impact', weaponId: 'stone_axe' });
    assert.equal(viewModel.update(0.1, false), null);
});

test('fist and spear attacks resolve once at their configured impact', () => {
    for (const weaponId of ['fist', 'spear']) {
        const combat = new CombatSystem();
        const creature = createCreature([0, 0, weaponId === 'fist' ? 1 : 2.5]);
        const pending = combat.beginAttack({
            origin: [0, 0, 0],
            direction: [0, 0, 1],
            yaw: 0,
            equippedItem: weaponId === 'fist' ? null : { id: weaponId },
            creatures: [creature],
        });

        assert.ok(pending);
        assert.equal(creature.health, 30);
        const impact = combat.resolveImpact(pending);
        assert.equal(impact.hit, true);
        assert.equal(creature.health, 30 - getWeaponProfile(weaponId).damage);
        assert.equal(combat.resolveImpact(pending).swung, false);
    }
});

test('spear uses the locked 3d aim ray instead of a horizontal cone', () => {
    const combat = new CombatSystem();
    const onRay = createCreature([0, 1.5, 2.5]);
    onRay.collider = { radius: 0.15 };
    const besideRay = createCreature([0.8, 0, 2.5]);
    besideRay.collider = { radius: 0.15 };
    const directionLength = Math.hypot(0, 1.5, 2.5);
    const pending = combat.beginAttack({
        origin: [0, 0, 0],
        direction: [0, 1.5 / directionLength, 2.5 / directionLength],
        yaw: 0,
        equippedItem: { id: 'spear' },
        creatures: [besideRay, onRay],
    });

    assert.equal(pending.target, onRay);
    assert.equal(combat.resolveImpact(pending).hit, true);
    assert.equal(besideRay.health, 30);
});

test('first person view model exposes fist spear and bow states', () => {
    const viewModel = Object.create(FirstPersonViewModel.prototype);
    Object.assign(viewModel, {
        weaponId: 'fist',
        _time: 0,
        _moveAmount: 0,
        _swingElapsed: Infinity,
        _swingDuration: 0.42,
        _impactEmitted: true,
        _activeSwingDirection: 1,
        _nextSwingDirection: 1,
        _bowCharging: false,
        _bowChargeElapsed: 0,
        _bowReleaseElapsed: Infinity,
    });

    assert.equal(viewModel.beginAttack('fist'), true);
    assert.equal(viewModel.weaponId, 'fist');
    assert.equal(viewModel.beginAttack('spear'), true);
    assert.equal(viewModel.weaponId, 'spear');

    viewModel.beginBowCharge();
    viewModel.update(0.5, false);
    assert.equal(viewModel.weaponId, 'bow');
    assert.equal(viewModel.getBowCharge(), 0.5);
    assert.equal(viewModel.releaseBow(), 0.5);
    assert.equal(viewModel._bowCharging, false);
});

test('fist and spear viewmodels emit impact at their own timing', () => {
    for (const weaponId of ['fist', 'spear']) {
        const profile = getWeaponProfile(weaponId);
        const viewModel = Object.create(FirstPersonViewModel.prototype);
        Object.assign(viewModel, {
            weaponId,
            _time: 0,
            _moveAmount: 0,
            _swingElapsed: Infinity,
            _swingDuration: profile.duration,
            _impactEmitted: true,
            _activeSwingDirection: 1,
            _nextSwingDirection: 1,
            _bowCharging: false,
            _bowChargeElapsed: 0,
            _bowReleaseElapsed: Infinity,
        });

        viewModel.beginAttack(weaponId);
        assert.equal(viewModel.update(profile.impactTime - 0.01, false), null);
        assert.deepEqual(viewModel.update(0.02, false), { type: 'impact', weaponId });
        assert.equal(viewModel.update(profile.duration, false), null);
    }
});
