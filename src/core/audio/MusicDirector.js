/**
 * MusicDirector (v1.1) — procedural ambient score.
 *
 * The game ships no audio files, so the soundtrack is a synthesised pad rather
 * than a streamed track: four chord voices (each a detuned oscillator pair)
 * running through one lowpass filter and a tremolo. Nothing ever restarts —
 * changing mood retunes the same voices and re-grades the filter, which is why
 * the transition from a calm afternoon into a boar charging at you is a slide
 * rather than a cut.
 */

/** Equal-tempered frequency, in semitones relative to A4 = 440 Hz. */
function note(semitones) {
    return 440 * Math.pow(2, semitones / 12);
}

/**
 * Per-mood scoring. `chords` are voiced low — the pad sits under the ambience,
 * it does not compete with it.
 */
const MOODS = {
    /** Daytime exploration: open, consonant, slow. */
    calm: {
        level: 0.10,
        filter: 820,
        wave: 'triangle',
        chordSeconds: 9.0,
        glide: 0.9,
        tremoloRate: 0.07,
        tremoloDepth: 0.22,
        chords: [
            [-24, -21, -17, -12], // Am
            [-28, -24, -21, -16], // F
            [-21, -17, -14, -9],  // C
            [-26, -22, -19, -14], // G
        ],
    },
    /** Night: an octave lower, darker filter, barely moving. */
    night: {
        level: 0.085,
        filter: 480,
        wave: 'sine',
        chordSeconds: 12.0,
        glide: 1.4,
        tremoloRate: 0.05,
        tremoloDepth: 0.3,
        chords: [
            [-36, -29, -26, -22], // Am add9
            [-31, -28, -24, -19], // Dm
            [-29, -26, -22, -17], // Em
            [-28, -24, -21, -17], // Fmaj7
        ],
    },
    /** A predator has locked on: tritones, fast tremolo, bright and unstable. */
    danger: {
        level: 0.115,
        filter: 1250,
        wave: 'sawtooth',
        chordSeconds: 3.5,
        glide: 0.18,
        tremoloRate: 5.0,
        tremoloDepth: 0.5,
        chords: [
            [-36, -23, -18, -12], // A / Bb / Eb — tritone against the root
            [-36, -21, -15, -10], // A / C / F# / B
        ],
    },
};

export class MusicDirector {
    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} bus Music bus — already routed through the mixer.
     */
    constructor(ctx, bus) {
        this.ctx = ctx;
        this.bus = bus;

        this._voices = [];
        this._filter = null;
        this._tremoloGain = null;
        this._tremoloOsc = null;
        this._tremoloDepth = null;
        this._levelGain = null;

        this._mood = 'calm';
        this._chordIndex = 0;
        this._chordTimer = 0;
        this._running = false;
    }

    get isRunning() {
        return this._running;
    }

    /** Build the voice graph and fade in on the current mood's first chord. */
    start() {
        if (this._running) return;
        const ctx = this.ctx;

        this._levelGain = ctx.createGain();
        this._levelGain.gain.value = 0;
        this._levelGain.connect(this.bus);

        // Tremolo: a gain oscillating around 1 - depth/2. Depth is itself an
        // AudioParam so a mood change can ramp it instead of stepping.
        this._tremoloGain = ctx.createGain();
        this._tremoloGain.gain.value = 1;
        this._tremoloGain.connect(this._levelGain);

        this._tremoloOsc = ctx.createOscillator();
        this._tremoloOsc.type = 'sine';
        this._tremoloDepth = ctx.createGain();
        this._tremoloOsc.connect(this._tremoloDepth);
        this._tremoloDepth.connect(this._tremoloGain.gain);

        this._filter = ctx.createBiquadFilter();
        this._filter.type = 'lowpass';
        this._filter.Q.value = 0.6;
        this._filter.connect(this._tremoloGain);

        const mood = MOODS[this._mood];
        for (let i = 0; i < 4; i++) {
            const voiceGain = ctx.createGain();
            // Upper voices sit back so the chord reads as one pad rather than
            // four separate tones.
            voiceGain.gain.value = 0.32 / (1 + i * 0.45);
            voiceGain.connect(this._filter);

            // A detuned pair per chord tone: the beating between them is what
            // stops the pad sounding like a test-tone generator.
            const oscA = ctx.createOscillator();
            const oscB = ctx.createOscillator();
            oscA.type = mood.wave;
            oscB.type = mood.wave;
            oscB.detune.value = 7;
            oscA.detune.value = -7;
            oscA.connect(voiceGain);
            oscB.connect(voiceGain);

            this._voices.push({ oscA, oscB, gain: voiceGain });
        }

        this._running = true;
        this._chordIndex = 0;
        this._chordTimer = mood.chordSeconds;
        this._applyMood(mood, 0.01);
        this._applyChord(mood, 0.01);

        const now = ctx.currentTime;
        for (const voice of this._voices) {
            voice.oscA.start(now);
            voice.oscB.start(now);
        }
        this._tremoloOsc.start(now);

        // Long fade-in: music appearing abruptly is more noticeable than music
        // that was seemingly always there.
        this._levelGain.gain.setTargetAtTime(mood.level, now, 2.5);
    }

    stop() {
        if (!this._running) return;
        const now = this.ctx.currentTime;

        this._levelGain.gain.setTargetAtTime(0, now, 0.4);
        // Let the fade finish before tearing the oscillators down.
        const stopAt = now + 2.0;
        for (const voice of this._voices) {
            try { voice.oscA.stop(stopAt); voice.oscB.stop(stopAt); } catch (e) { /* ignore */ }
        }
        try { this._tremoloOsc.stop(stopAt); } catch (e) { /* ignore */ }

        this._voices = [];
        this._running = false;
    }

    /**
     * Switch scoring. Unknown names are ignored so callers can pass a computed
     * mood without guarding.
     * @param {'calm'|'night'|'danger'} name
     */
    setMood(name) {
        if (name === this._mood || !MOODS[name]) return;
        this._mood = name;

        if (!this._running) return;
        const mood = MOODS[name];
        this._applyMood(mood, mood.glide);

        // Land on the new mood's opening chord immediately — waiting out the
        // old chord timer would delay a danger cue by up to nine seconds.
        this._chordIndex = 0;
        this._chordTimer = mood.chordSeconds;
        this._applyChord(mood, mood.glide);
    }

    /** @param {number} deltaTime */
    update(deltaTime) {
        if (!this._running) return;
        const mood = MOODS[this._mood];

        this._chordTimer -= Math.min(deltaTime, 0.1);
        if (this._chordTimer > 0) return;

        this._chordIndex = (this._chordIndex + 1) % mood.chords.length;
        this._chordTimer = mood.chordSeconds;
        this._applyChord(mood, mood.glide);
    }

    // ── Internals ────────────────────────────────────────────────

    _applyMood(mood, timeConstant) {
        const now = this.ctx.currentTime;
        this._filter.frequency.setTargetAtTime(mood.filter, now, timeConstant);
        this._levelGain.gain.setTargetAtTime(mood.level, now, timeConstant);
        this._tremoloOsc.frequency.setTargetAtTime(mood.tremoloRate, now, timeConstant);
        this._tremoloDepth.gain.setTargetAtTime(mood.tremoloDepth * 0.5, now, timeConstant);
        this._tremoloGain.gain.setTargetAtTime(1 - mood.tremoloDepth * 0.5, now, timeConstant);

        for (const voice of this._voices) {
            voice.oscA.type = mood.wave;
            voice.oscB.type = mood.wave;
        }
    }

    _applyChord(mood, timeConstant) {
        const chord = mood.chords[this._chordIndex];
        const now = this.ctx.currentTime;
        for (let i = 0; i < this._voices.length; i++) {
            const frequency = note(chord[i % chord.length]);
            this._voices[i].oscA.frequency.setTargetAtTime(frequency, now, timeConstant);
            this._voices[i].oscB.frequency.setTargetAtTime(frequency, now, timeConstant);
        }
    }
}
