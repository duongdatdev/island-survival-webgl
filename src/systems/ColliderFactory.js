import { CollisionLayers } from './CollisionLayers.js';

const COLLIDER_DEFS = {
    Tree: {
        type: 'capsule',
        trigger: false,
        layer: CollisionLayers.Environment,
        radius: 0.42,
        height: 1.4,
    },
    Palm: {
        type: 'capsule',
        trigger: false,
        layer: CollisionLayers.Environment,
        radius: 0.38,
        height: 1.88,
    },
    Rock: {
        type: 'box',
        trigger: false,
        layer: CollisionLayers.Environment,
        halfExtents: [0.54, 0.36, 0.54],
    },
    Bush: {
        type: 'sphere',
        trigger: true,
        layer: CollisionLayers.Trigger,
        radius: 0.18,
    },
    Grass: {
        type: 'none',
        trigger: false,
        layer: CollisionLayers.Environment,
    },
    Flower: {
        type: 'none',
        trigger: false,
        layer: CollisionLayers.Environment,
    },
    Plant: {
        type: 'none',
        trigger: false,
        layer: CollisionLayers.Environment,
    },
    Unknown: {
        type: 'none',
        trigger: false,
        layer: CollisionLayers.Environment,
    },
};

export class ColliderFactory {
    static getColliderDef(category) {
        return COLLIDER_DEFS[category] || COLLIDER_DEFS.Unknown;
    }

    static createCollider(category, scale) {
        const def = this.getColliderDef(category);
        const avgScale = scale ? (scale[0] + scale[2]) * 0.5 : 1.0;

        const collider = {
            type: def.type,
            trigger: def.trigger,
            layer: def.layer,
            radius: 0,
            halfExtents: [0, 0, 0],
            height: 0,
        };

        switch (def.type) {
            case 'capsule':
                collider.radius = def.radius * avgScale;
                collider.height = def.height * (scale ? scale[1] : 1.0);
                break;
            case 'box':
                collider.halfExtents = [
                    def.halfExtents[0] * (scale ? scale[0] : 1.0),
                    def.halfExtents[1] * (scale ? scale[1] : 1.0),
                    def.halfExtents[2] * (scale ? scale[2] : 1.0),
                ];
                collider.radius = Math.max(collider.halfExtents[0], collider.halfExtents[2]);
                break;
            case 'sphere':
                collider.radius = def.radius * avgScale;
                break;
            case 'none':
                break;
        }

        return collider;
    }

    static getColliderRadius(category, scale) {
        const def = this.getColliderDef(category);
        if (def.type === 'none') return 0;
        const avgScale = scale ? (scale[0] + scale[2]) * 0.5 : 1.0;
        return def.radius * avgScale;
    }
}
