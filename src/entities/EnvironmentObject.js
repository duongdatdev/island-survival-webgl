import { Entity } from './Entity.js';
import { Vec3 } from '../math/Vec3.js';
import { ColliderFactory } from '../systems/ColliderFactory.js';

export const TREE_HITS_TO_FELL = 3;
const TREE_FALL_SPEED = Math.PI * 0.42;
const TREE_MAX_FALL_ANGLE = Math.PI * 0.5;
const TREE_GROUND_EPSILON = 0.08;

export class EnvironmentObject extends Entity {
    constructor(gl, mesh, position, rotation, scale, collision = true, navigationBlocker = true, category = '') {
        super();
        this.gl = gl;
        this.mesh = mesh;
        this.collision = collision;
        this.navigationBlocker = navigationBlocker;
        this.category = category;

        Vec3.set(this.position, position[0], position[1], position[2]);
        Vec3.set(this.rotation, rotation[0], rotation[1], rotation[2]);
        Vec3.set(this.scale, scale[0], scale[1], scale[2]);

        this.collider = ColliderFactory.createCollider(category, scale);
        this.collisionRadius = this.collider.radius;

        this.isHarvestableTree = category === 'Tree' || category === 'Palm';
        this.treeHitsRemaining = this.isHarvestableTree ? TREE_HITS_TO_FELL : 0;
        this.treeState = this.isHarvestableTree ? 'standing' : 'none';
        this.woodDropsSpawned = false;
        this._fallAngle = 0;
        this._fallYaw = this.rotation[1];
        this._fallHeight = this._getTreeHeight();

        this.updateModelMatrix();
        this._updateCullingBounds();
    }

    draw(shaderProgram, drawMode) {
        if (!this.mesh) return;
        shaderProgram.setUniformMatrix4fv('uModelMatrix', this.modelMatrix);
        this.mesh.draw(drawMode);
    }

    chop(attackerPosition) {
        if (!this.isHarvestableTree || this.treeState !== 'standing') {
            return { hit: false, felled: false, hitsRemaining: this.treeHitsRemaining };
        }

        this.treeHitsRemaining = Math.max(0, this.treeHitsRemaining - 1);
        const felled = this.treeHitsRemaining === 0;

        if (felled) {
            const dx = this.position[0] - attackerPosition[0];
            const dz = this.position[2] - attackerPosition[2];
            if (dx * dx + dz * dz > 0.0001) {
                this._fallYaw = Math.atan2(dx, dz);
            }
            this.rotation[0] = 0;
            this.rotation[1] = this._fallYaw;
            this.rotation[2] = 0;
            this.treeState = 'falling';

            this.collider.type = 'none';
            this.collider.radius = 0;
            this.collider.height = 0;
            this.collisionRadius = 0;
        }

        return { hit: true, felled, hitsRemaining: this.treeHitsRemaining };
    }

    updateTreeFall(deltaTime, terrain) {
        if (this.treeState !== 'falling') return false;

        this._fallAngle = Math.min(
            TREE_MAX_FALL_ANGLE,
            this._fallAngle + TREE_FALL_SPEED * Math.max(0, deltaTime)
        );
        this.rotation[0] = this._fallAngle;
        this.updateModelMatrix();
        this._updateCullingBounds();

        const tip = this.getTreePoint(1);
        const groundY = terrain && typeof terrain.getHeight === 'function'
            ? terrain.getHeight(tip[0], tip[2])
            : this.position[1];
        const touchedGround = tip[1] <= groundY + TREE_GROUND_EPSILON;

        if (touchedGround || this._fallAngle >= TREE_MAX_FALL_ANGLE) {
            this.treeState = 'fallen';
            return true;
        }
        return false;
    }

    getTreePoint(fraction) {
        const t = Math.max(0, Math.min(1, fraction));
        const alongGround = Math.sin(this._fallAngle) * this._fallHeight * t;
        return [
            this.position[0] + Math.sin(this._fallYaw) * alongGround,
            this.position[1] + Math.cos(this._fallAngle) * this._fallHeight * t,
            this.position[2] + Math.cos(this._fallYaw) * alongGround,
        ];
    }

    _getTreeHeight() {
        const bounds = this.mesh && this.mesh.bounds;
        if (!bounds) return Math.max(2, this.collider.height || 2);

        const localHeight = Math.max(bounds.max[1], bounds.max[1] - bounds.min[1]);
        return Math.max(2, localHeight * Math.abs(this.scale[1]));
    }

    _updateCullingBounds() {
        const bounds = this.mesh && this.mesh.bounds;
        if (!bounds || bounds.radius <= 0) {
            this.cullingCenter = this.position;
            this.cullingRadius = Math.max(1, this.collisionRadius || 0);
            return;
        }

        const c = bounds.center;
        const m = this.modelMatrix;
        this.cullingCenter = Vec3.create(
            m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12],
            m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13],
            m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14]
        );
        this.cullingRadius = bounds.radius * Math.max(
            Math.abs(this.scale[0]),
            Math.abs(this.scale[1]),
            Math.abs(this.scale[2])
        );
    }

    delete() {
    }
}
