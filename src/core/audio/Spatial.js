/**
 * Spatial audio helpers (v1.1).
 *
 * The positional API exists in two generations: the original setter methods
 * (`panner.setPosition`, `listener.setPosition`) and the AudioParam form
 * (`panner.positionX`, `listener.forwardX`). Firefox and Safari still ship the
 * old one on some versions, so every call goes through these wrappers rather
 * than picking a single spelling and breaking on the other browser.
 */

/**
 * Distance profiles per emitter class. `ref` is the radius inside which the
 * sound plays at full level; `max` is where it stops attenuating further.
 * @type {Record<string, {ref: number, max: number, rolloff: number}>}
 */
export const SpatialProfiles = {
    /** Point-source props the player walks up to (campfire, water collector). */
    prop: { ref: 2.5, max: 26, rolloff: 1.3 },
    /** Landmarks audible from across the island. */
    landmark: { ref: 7.0, max: 70, rolloff: 1.0 },
    /** Creatures and combat impacts — audible but never dominant. */
    creature: { ref: 4.0, max: 45, rolloff: 1.2 },
};

/**
 * Create a panner wired to `destination`, positioned at `position`.
 * @param {AudioContext} ctx
 * @param {number[]} position World-space [x, y, z]
 * @param {AudioNode} destination
 * @param {{ref: number, max: number, rolloff: number}} [profile]
 * @returns {PannerNode}
 */
export function createPanner(ctx, position, destination, profile = SpatialProfiles.creature) {
    const panner = ctx.createPanner();
    // `equalpower` costs a fraction of `HRTF` and is plenty for a third-person
    // camera where direction only needs to read as left/right/behind.
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = profile.ref;
    panner.maxDistance = profile.max;
    panner.rolloffFactor = profile.rolloff;
    setPannerPosition(ctx, panner, position);
    panner.connect(destination);
    return panner;
}

/**
 * Move a panner. Ramps rather than jumps so a moving emitter doesn't click.
 * @param {AudioContext} ctx
 * @param {PannerNode} panner
 * @param {number[]} position
 * @param {number} [smoothing] Time constant in seconds; 0 snaps.
 */
export function setPannerPosition(ctx, panner, position, smoothing = 0) {
    const [x, y, z] = position;
    if (panner.positionX) {
        const t = ctx.currentTime;
        if (smoothing > 0) {
            panner.positionX.setTargetAtTime(x, t, smoothing);
            panner.positionY.setTargetAtTime(y, t, smoothing);
            panner.positionZ.setTargetAtTime(z, t, smoothing);
        } else {
            panner.positionX.setValueAtTime(x, t);
            panner.positionY.setValueAtTime(y, t);
            panner.positionZ.setValueAtTime(z, t);
        }
    } else if (panner.setPosition) {
        panner.setPosition(x, y, z);
    }
}

/**
 * Point the listener at the world. Called once per frame from the camera, so
 * everything is smoothed — a hard jump on a fast camera turn is audible as a
 * zipper artefact on sustained emitters.
 * @param {AudioContext} ctx
 * @param {number[]} position Camera position
 * @param {number[]} forward Normalised camera forward vector
 */
export function setListenerPose(ctx, position, forward) {
    const listener = ctx.listener;
    const t = ctx.currentTime;
    const smoothing = 0.02;

    if (listener.positionX) {
        listener.positionX.setTargetAtTime(position[0], t, smoothing);
        listener.positionY.setTargetAtTime(position[1], t, smoothing);
        listener.positionZ.setTargetAtTime(position[2], t, smoothing);
        listener.forwardX.setTargetAtTime(forward[0], t, smoothing);
        listener.forwardY.setTargetAtTime(forward[1], t, smoothing);
        listener.forwardZ.setTargetAtTime(forward[2], t, smoothing);
        listener.upX.setValueAtTime(0, t);
        listener.upY.setValueAtTime(1, t);
        listener.upZ.setValueAtTime(0, t);
    } else if (listener.setPosition) {
        listener.setPosition(position[0], position[1], position[2]);
        listener.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
}
