import { Mat4 } from '../math/Mat4.js';
import { Mesh } from '../renderer/Mesh.js';
import { CollisionLayers } from './CollisionLayers.js';

const PROJECTILE_MASK = CollisionLayers.Creature | CollisionLayers.Environment;

export class ProjectileSystem {
    constructor(gl = null, collisionSystem = null, terrain = null) {
        this.gl = gl;
        this.collisionSystem = collisionSystem;
        this.terrain = terrain;
        this.projectiles = [];
        this.onImpact = null;
        this.modelCollision = null;
        this._modelMatrix = Mat4.create();
        this._arrowMesh = gl ? new Mesh(gl, this._createArrowData()) : null;
    }

    spawnArrow(spec) {
        if (!spec) return null;
        const arrow = {
            position: [...spec.origin],
            velocity: spec.direction.map(component => component * spec.speed),
            damage: spec.damage,
            gravity: spec.gravity,
            radius: spec.radius,
            lifetime: spec.lifetime,
        };
        this.projectiles.push(arrow);
        return arrow;
    }

    update(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const arrow = this.projectiles[i];
            arrow.lifetime -= deltaTime;
            if (arrow.lifetime <= 0) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const start = [...arrow.position];
            const end = [
                start[0] + arrow.velocity[0] * deltaTime,
                start[1] + arrow.velocity[1] * deltaTime - 0.5 * arrow.gravity * deltaTime * deltaTime,
                start[2] + arrow.velocity[2] * deltaTime,
            ];
            const displacement = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
            const distance = Math.hypot(displacement[0], displacement[1], displacement[2]);
            const direction = distance > 0.0001
                ? displacement.map(component => component / distance)
                : [0, 0, 1];
            const colliderHit = this.collisionSystem?.sphereCast(
                start,
                direction,
                arrow.radius,
                distance,
                PROJECTILE_MASK
            ) || null;
            const terrainHit = this._findTerrainHit(start, end, distance);
            const modelHit = this.modelCollision?.segmentHit(start, end);
            const hit = [colliderHit, terrainHit, modelHit].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];

            if (hit) {
                const creature = hit.entity && (hit.entity.collider?.layer & CollisionLayers.Creature)
                    ? hit.entity
                    : null;
                if (creature && creature.state !== 'dead' && typeof creature.takeDamage === 'function') {
                    creature.takeDamage(arrow.damage);
                }
                if (this.onImpact) {
                    this.onImpact({
                        entity: hit.entity || null,
                        creature,
                        point: hit.point,
                        damage: creature ? arrow.damage : 0,
                    });
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            arrow.position = end;
            arrow.velocity[1] -= arrow.gravity * deltaTime;
        }
    }

    _findTerrainHit(start, end, distance) {
        if (!this.terrain || typeof this.terrain.getHeight !== 'function') return null;
        const steps = Math.max(1, Math.ceil(distance / 0.25));
        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const point = [
                start[0] + (end[0] - start[0]) * t,
                start[1] + (end[1] - start[1]) * t,
                start[2] + (end[2] - start[2]) * t,
            ];
            if (point[1] <= this.terrain.getHeight(point[0], point[2])) {
                return { entity: null, point, distance: distance * t };
            }
        }
        return null;
    }

    draw(shader, drawMode) {
        if (!this._arrowMesh) return;
        for (const arrow of this.projectiles) {
            const speed = Math.hypot(arrow.velocity[0], arrow.velocity[1], arrow.velocity[2]);
            const yaw = Math.atan2(arrow.velocity[0], arrow.velocity[2]);
            const pitch = speed > 0.0001 ? -Math.asin(arrow.velocity[1] / speed) : 0;
            Mat4.identity(this._modelMatrix);
            Mat4.translate(this._modelMatrix, this._modelMatrix, arrow.position);
            Mat4.rotateY(this._modelMatrix, this._modelMatrix, yaw);
            Mat4.rotateX(this._modelMatrix, this._modelMatrix, pitch);
            shader.setUniformMatrix4fv('uModelMatrix', this._modelMatrix);
            this._arrowMesh.draw(drawMode);
        }
    }

    clear() {
        this.projectiles.length = 0;
    }

    delete() {
        this.clear();
        this._arrowMesh?.delete();
        this._arrowMesh = null;
        this.modelCollision = null;
    }

    _createArrowData() {
        const positions = new Float32Array([
            -0.015, -0.015, -0.40,  0.015, -0.015, -0.40,  0.015,  0.015, -0.40, -0.015,  0.015, -0.40,
            -0.015, -0.015,  0.40, -0.015,  0.015,  0.40,  0.015,  0.015,  0.40,  0.015, -0.015,  0.40,
            -0.015,  0.015, -0.40, -0.015,  0.015,  0.40,  0.015,  0.015,  0.40,  0.015,  0.015, -0.40,
            -0.015, -0.015, -0.40,  0.015, -0.015, -0.40,  0.015, -0.015,  0.40, -0.015, -0.015,  0.40,
             0.015, -0.015, -0.40,  0.015,  0.015, -0.40,  0.015,  0.015,  0.40,  0.015, -0.015,  0.40,
            -0.015, -0.015, -0.40, -0.015, -0.015,  0.40, -0.015,  0.015,  0.40, -0.015,  0.015, -0.40,
        ]);
        const normals = new Float32Array([
             0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
             0, 0,  1,  0, 0,  1,  0, 0,  1,  0, 0,  1,
             0, 1,  0,  0, 1,  0,  0, 1,  0,  0, 1,  0,
             0,-1,  0,  0,-1,  0,  0,-1,  0,  0,-1,  0,
             1, 0,  0,  1, 0,  0,  1, 0,  0,  1, 0,  0,
            -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,  0,
        ]);
        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) colors.set([0.50, 0.30, 0.12, 1], i * 4);
        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
            8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
            16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
        ]);
        return { positions, normals, colors, indices };
    }
}
