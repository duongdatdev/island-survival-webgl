
export const SpatialProfiles = {
    prop: { ref: 2.5, max: 26, rolloff: 1.3 },
    landmark: { ref: 7.0, max: 70, rolloff: 1.0 },
    creature: { ref: 4.0, max: 45, rolloff: 1.2 },
};

export function createPanner(ctx, position, destination, profile = SpatialProfiles.creature) {
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = profile.ref;
    panner.maxDistance = profile.max;
    panner.rolloffFactor = profile.rolloff;
    setPannerPosition(ctx, panner, position);
    panner.connect(destination);
    return panner;
}

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
