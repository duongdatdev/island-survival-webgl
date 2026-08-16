
function note(semitones) {
    return 440 * Math.pow(2, semitones / 12);
}

const MOODS = {
    calm: {
        level: 0.10,
        filter: 820,
        wave: 'triangle',
        chordSeconds: 9.0,
        glide: 0.9,
        tremoloRate: 0.07,
        tremoloDepth: 0.22,
        chords: [
            [-24, -21, -17, -12],
            [-28, -24, -21, -16],
            [-21, -17, -14, -9],
            [-26, -22, -19, -14],
        ],
    },
    night: {
        level: 0.085,
        filter: 480,
        wave: 'sine',
        chordSeconds: 12.0,
        glide: 1.4,
        tremoloRate: 0.05,
        tremoloDepth: 0.3,
        chords: [
            [-36, -29, -26, -22],
            [-31, -28, -24, -19],
            [-29, -26, -22, -17],
            [-28, -24, -21, -17],
        ],
    },
    danger: {
        level: 0.115,
        filter: 1250,
        wave: 'sawtooth',
        chordSeconds: 3.5,
        glide: 0.18,
        tremoloRate: 5.0,
        tremoloDepth: 0.5,
        chords: [
            [-36, -23, -18, -12],
            [-36, -21, -15, -10],
        ],
    },
};

export class MusicDirector {
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

    start() {
        if (this._running) return;
        const ctx = this.ctx;

        this._levelGain = ctx.createGain();
        this._levelGain.gain.value = 0;
        this._levelGain.connect(this.bus);

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
            voiceGain.gain.value = 0.32 / (1 + i * 0.45);
            voiceGain.connect(this._filter);

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

        this._levelGain.gain.setTargetAtTime(mood.level, now, 2.5);
    }

    stop() {
        if (!this._running) return;
        const now = this.ctx.currentTime;

        this._levelGain.gain.setTargetAtTime(0, now, 0.4);
        const stopAt = now + 2.0;
        for (const voice of this._voices) {
            try { voice.oscA.stop(stopAt); voice.oscB.stop(stopAt); } catch (e) { }
        }
        try { this._tremoloOsc.stop(stopAt); } catch (e) { }

        this._voices = [];
        this._running = false;
    }

    setMood(name) {
        if (name === this._mood || !MOODS[name]) return;
        this._mood = name;

        if (!this._running) return;
        const mood = MOODS[name];
        this._applyMood(mood, mood.glide);

        this._chordIndex = 0;
        this._chordTimer = mood.chordSeconds;
        this._applyChord(mood, mood.glide);
    }

    update(deltaTime) {
        if (!this._running) return;
        const mood = MOODS[this._mood];

        this._chordTimer -= Math.min(deltaTime, 0.1);
        if (this._chordTimer > 0) return;

        this._chordIndex = (this._chordIndex + 1) % mood.chords.length;
        this._chordTimer = mood.chordSeconds;
        this._applyChord(mood, mood.glide);
    }


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
