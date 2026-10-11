import test from 'node:test';
import assert from 'node:assert/strict';
import { EndingChallenge, oceanLane } from '../src/systems/EndingChallenge.js';

function oceanInput(s) {
    let target = oceanLane(s.along + 35);
    const rock = s.rocks.find(rock => rock.along > s.along && rock.along - s.along < 45);
    if (rock && Math.abs(rock.across - target) < rock.radius + 2) target = rock.across + (target < rock.across ? -1 : 1) * (rock.radius + 3);
    const heading = Math.atan2(target - s.across, 25);
    return { steer: Math.abs(heading - s.heading) > 0.025 ? Math.sign(heading - s.heading) : 0,
        throttle: true, repair: s.hull < 65 };
}
function radioInput(s) {
    return { tune: Math.abs(s.target - s.tuning) > 0.25 ? Math.sign(s.target - s.tuning) : 0,
        transmit: true, refuel: s.power < 45, repair: s.strikeWarning < 4 && s.protection <= 0 };
}

test('controllable ocean course with rocks and repairs takes 8–12 active minutes, motor remains optional', () => {
    for (const motor of [false, true]) {
        const challenge = new EndingChallenge(); challenge.start('raft', { seed: 'ocean-test', motor });
        while (challenge.state.status === 'active') challenge.update(0.1, oceanInput(challenge.state));
        assert.equal(challenge.state.status, 'completed', challenge.state.reason);
        assert.ok(challenge.state.elapsed >= 480 && challenge.state.elapsed <= 720);
        assert.ok(challenge.state.along >= 1800);
    }
});

test('radio requires transmitting, tracking frequency, fuel and surviving lightning over 8–12 minutes', () => {
    const challenge = new EndingChallenge(); challenge.start('rescue', { seed: 'radio-test' });
    while (challenge.state.status === 'active') challenge.update(0.1, radioInput(challenge.state));
    assert.equal(challenge.state.status, 'completed', challenge.state.reason);
    assert.ok(challenge.state.elapsed >= 480 && challenge.state.elapsed <= 720);
    assert.ok(challenge.state.fuel < 16);
    assert.ok(challenge.state.repairs < 3);
    const unattended = new EndingChallenge(); unattended.start('rescue'); unattended.update(721);
    assert.equal(unattended.state.status, 'failed');
});

test('both active challenges resume exactly; pauses/closed worlds have no wall-clock catch-up', () => {
    for (const route of ['raft', 'rescue']) {
        const a = new EndingChallenge(); a.start(route, { seed: 'resume' });
        const input = route === 'raft' ? oceanInput : radioInput;
        for (let i = 0; i < 100; i++) a.update(0.1, input(a.state));
        const b = new EndingChallenge(); b.restore(a.snapshot());
        const saved = b.snapshot();
        assert.deepEqual(b.snapshot(), saved);
        for (let i = 0; i < 500; i++) { a.update(0.1, input(a.state)); b.update(0.1, input(b.state)); }
        assert.deepEqual(a.snapshot(), b.snapshot());
        a.fail('abandoned'); assert.equal(a.state.status, 'failed');
        a.start(route, { seed: 'resume' }); assert.equal(a.state.status, 'active'); assert.equal(a.state.elapsed, 0);
    }
});

test('failed repairs and depleted supplies cannot fabricate hull or power', () => {
    const challenge = new EndingChallenge(); challenge.start('raft', { repairs: 0 });
    challenge.state.hull = 25; challenge.update(1, { repair: true });
    assert.ok(challenge.state.hull < 25);
    challenge.start('rescue'); challenge.state.power = 0; challenge.state.fuel = 0; challenge.state.repairs = 0;
    challenge.update(1, { refuel: true, repair: true, transmit: true });
    assert.equal(challenge.state.status, 'failed'); assert.equal(challenge.state.signal, 0);
});
