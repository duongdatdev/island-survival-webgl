/**
 * Subtle vertex motion for rigid low-poly wildlife. Coordinates are the raw
 * glTF mesh coordinates; bounds are supplied per drawable by ModelAsset.
 */
export const SURFACE_MOTION_GLSL = `
    uniform float uCreatureMotion;
    uniform float uMotionTime;
    uniform float uMotionPhase;
    uniform float uMotionGait;
    uniform float uMotionSpecies;
    uniform vec3 uMotionBoundsMin;
    uniform vec3 uMotionBoundsMax;

    void applyCreatureMotion(inout vec3 localPosition, inout vec3 localNormal) {
        if (uCreatureMotion < 0.5) return;

        // These wildlife assets are authored Z-up before their per-node
        // normalization matrix turns them into the game's Y-up convention.
        vec3 size = max(uMotionBoundsMax - uMotionBoundsMin, vec3(0.0001));
        vec3 q = clamp((localPosition - uMotionBoundsMin) / size, 0.0, 1.0);
        float speedClass = mix(1.0, 1.2, step(2.5, uMotionSpecies));
        float phase = uMotionTime * speedClass * 7.4 + uMotionPhase;
        float gait = clamp(uMotionGait, 0.0, 1.0);

        // Low vertices move in opposing phases along the body's length. The
        // grounded root and upper body remain stable, avoiding whole-body slide.
        float footMask = 1.0 - smoothstep(0.10, 0.43, q.z);
        float leftRight = sin(q.x * 10.0 + uMotionPhase * 0.7);
        float frontBack = sin(q.y * 7.0 + phase);
        float stride = sin(phase + q.y * 5.2 + leftRight * 0.7);
        float footWeight = footMask * gait;
        localPosition.z += size.z * (0.006 * footWeight * max(stride, 0.0));
        localPosition.x += size.x * (0.018 * footWeight * stride);
        localPosition.y += size.y * (0.012 * footWeight * frontBack);

        // Idle breathing and a small head/tail response are weighted toward
        // the upper and end regions, with no translation of the entity root.
        float idle = 1.0 - gait;
        float breath = sin(uMotionTime * 1.7 + uMotionPhase) * 0.0035 * idle;
        float head = smoothstep(0.50, 0.84, q.z) * smoothstep(0.42, 0.86, q.y);
        float tail = smoothstep(0.56, 0.94, q.y) * (1.0 - smoothstep(0.22, 0.52, q.z));
        localPosition.x += size.x * (breath * q.x + head * sin(uMotionTime * 1.1 + uMotionPhase) * 0.008);
        localPosition.y += size.y * tail * sin(uMotionTime * 2.4 + uMotionPhase) * 0.012;

        // First-order normal correction for the low-amplitude vertical slope.
        localNormal = normalize(localNormal + vec3(-0.025 * footWeight * stride,
                                                   -0.018 * footWeight * frontBack,
                                                   0.0));
    }
`;
