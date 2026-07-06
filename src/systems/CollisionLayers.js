export const CollisionLayers = {
    Player:      1 << 0,
    Terrain:     1 << 1,
    Environment: 1 << 2,
    Resource:    1 << 3,
    Debris:      1 << 4,
    BuildArea:   1 << 5,
    Trigger:     1 << 6,
    UI:          1 << 7,
};

export const LayerNames = {
    1: 'Player',
    2: 'Terrain',
    4: 'Environment',
    8: 'Resource',
    16: 'Debris',
    32: 'BuildArea',
    64: 'Trigger',
    128: 'UI',
};

export function layerNameFromMask(mask) {
    return LayerNames[mask] || 'Unknown';
}
