import { getResourceDef } from './ResourceDatabase.js';
import { getWeaponProfile } from './CombatConfig.js';

const COOLDOWN_EPSILON = 1e-6;

export class CombatSystem {
    constructor() {
        this._globalCooldown = 0;
        this._lastWeaponType = null;
    }

    attack(playerPosition, playerYaw, equippedItem, creatures, inventory) {
        const weaponData = this._getWeaponData(equippedItem);
        if (!weaponData) {
            return { hit: false, creature: null, damage: 0 };
        }

        if (this._globalCooldown > 0) {
            return { hit: false, creature: null, damage: 0, onCooldown: true };
        }

        if (weaponData.type === 'ranged') {
            return this._rangedAttack(playerPosition, playerYaw, weaponData, creatures, inventory);
        }

        this._startCooldown(weaponData);
        return this._resolveMeleeAttack(playerPosition, playerYaw, weaponData, creatures);
    }

    beginMeleeAttack(playerPosition, playerYaw, equippedItem, creatures) {
        return this.beginAttack({
            origin: playerPosition,
            yaw: playerYaw,
            equippedItem,
            creatures,
        });
    }

    beginAttack({ origin, direction = null, yaw = 0, equippedItem = null, creatures = [] }) {
        const weaponData = this._getWeaponData(equippedItem);
        if (!weaponData || weaponData.type !== 'melee') {
            return null;
        }
        if (this._globalCooldown > 0) {
            return null;
        }

        this._startCooldown(weaponData);
        const aimDirection = this._normalizeDirection(direction, yaw);
        return {
            origin: [origin[0], origin[1], origin[2]],
            direction: aimDirection,
            yaw,
            weaponData,
            target: this._findMeleeTarget(origin, yaw, aimDirection, weaponData, creatures),
            resolved: false,
        };
    }

    resolveMeleeImpact(pendingAttack) {
        return this.resolveImpact(pendingAttack);
    }

    resolveImpact(pendingAttack) {
        if (!pendingAttack || pendingAttack.resolved) {
            return { hit: false, creature: null, damage: 0, swung: false };
        }
        pendingAttack.resolved = true;
        const target = pendingAttack.target;
        if (!target || !this._isMeleeTargetValid(
            target,
            pendingAttack.origin,
            pendingAttack.yaw,
            pendingAttack.direction,
            pendingAttack.weaponData
        )) {
            return { hit: false, creature: null, damage: 0, swung: true };
        }

        target.takeDamage(pendingAttack.weaponData.damage);
        return {
            hit: true,
            creature: target,
            damage: pendingAttack.weaponData.damage,
            swung: true,
        };
    }

    _resolveMeleeAttack(playerPosition, playerYaw, weaponData, creatures) {
        const direction = this._normalizeDirection(null, playerYaw);
        const closestCreature = this._findMeleeTarget(
            playerPosition,
            playerYaw,
            direction,
            weaponData,
            creatures
        );

        if (closestCreature) {
            closestCreature.takeDamage(weaponData.damage);
            return { hit: true, creature: closestCreature, damage: weaponData.damage, swung: true };
        }

        return { hit: false, creature: null, damage: 0, swung: true };
    }

    _findMeleeTarget(playerPosition, playerYaw, direction, weaponData, creatures) {
        const range = weaponData.range;
        let closestCreature = null;
        let closestDist = range;

        for (const creature of creatures) {
            if (!this._isMeleeTargetValid(
                creature,
                playerPosition,
                playerYaw,
                direction,
                weaponData
            )) continue;
            const dx = creature.position[0] - playerPosition[0];
            const dy = creature.position[1] - playerPosition[1];
            const dz = creature.position[2] - playerPosition[2];
            const dist = weaponData.shape === 'thrust'
                ? dx * direction[0] + dy * direction[1] + dz * direction[2]
                : Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
                closestDist = dist;
                closestCreature = creature;
            }
        }
        return closestCreature;
    }

    _isMeleeTargetValid(creature, playerPosition, playerYaw, direction, weaponData) {
        if (!creature || creature.state === 'dead') return false;
        const dx = creature.position[0] - playerPosition[0];
        const dz = creature.position[2] - playerPosition[2];
        const dy = creature.position[1] - playerPosition[1];

        if (weaponData.shape === 'thrust') {
            const hitDirection = direction || this._normalizeDirection(null, playerYaw);
            const along = dx * hitDirection[0] + dy * hitDirection[1] + dz * hitDirection[2];
            const radius = (creature.collider?.radius ?? 0.3) + (weaponData.hitRadius ?? 0);
            if (along < -radius || along > weaponData.range + radius) return false;
            const perpendicularX = dx - hitDirection[0] * along;
            const perpendicularY = dy - hitDirection[1] * along;
            const perpendicularZ = dz - hitDirection[2] * along;
            return Math.hypot(perpendicularX, perpendicularY, perpendicularZ) <= radius;
        }

        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > weaponData.range || Math.abs(dy) > weaponData.range) return false;
        if (dist <= 0.0001) return true;

        const facingX = Math.sin(playerYaw);
        const facingZ = Math.cos(playerYaw);
        const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        return angle <= (weaponData.halfArc ?? Math.PI * 0.35);
    }

    _normalizeDirection(direction, yaw) {
        const source = direction || [Math.sin(yaw), 0, Math.cos(yaw)];
        const length = Math.hypot(source[0], source[1], source[2]);
        if (length <= 0.0001) return [Math.sin(yaw), 0, Math.cos(yaw)];
        return [source[0] / length, source[1] / length, source[2] / length];
    }

    _startCooldown(weaponData) {
        this._globalCooldown = weaponData.cooldown;
        this._lastWeaponType = weaponData.type;
    }

    _rangedAttack(playerPosition, playerYaw, weaponData, creatures, inventory) {
        if (inventory) {
            if (!inventory.hasItem('arrow', 1)) {
                return { hit: false, creature: null, damage: 0, reason: 'no_ammo' };
            }
            inventory.removeItem('arrow', 1);
        }

        const range = weaponData.range;
        const damage = weaponData.damage;
        const facingX = Math.sin(playerYaw);
        const facingZ = Math.cos(playerYaw);

        let closestCreature = null;
        let closestDist = range;

        for (const creature of creatures) {
            if (creature.state === 'dead') continue;

            const dx = creature.position[0] - playerPosition[0];
            const dz = creature.position[2] - playerPosition[2];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > range) continue;

            const t = dx * facingX + dz * facingZ;
            if (t <= 0) continue;

            const perpX = dx - t * facingX;
            const perpZ = dz - t * facingZ;
            const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);
            const hitRadius = (creature.collider ? creature.collider.radius : 0.3) + 0.3;

            if (perpDist > hitRadius) continue;

            if (t < closestDist) {
                closestDist = t;
                closestCreature = creature;
            }
        }

        this._startCooldown(weaponData);

        if (closestCreature) {
            closestCreature.takeDamage(damage);
            return { hit: true, creature: closestCreature, damage, swung: true };
        }

        return { hit: false, creature: null, damage: 0, swung: true };
    }

    _getWeaponData(equippedItem) {
        if (!equippedItem) return getWeaponProfile('fist');

        const def = getResourceDef(equippedItem.id);
        if (!def || !def.weaponType) return getWeaponProfile('fist');
        return getWeaponProfile(equippedItem.id) || getWeaponProfile('fist');
    }

    update(deltaTime) {
        if (this._globalCooldown > 0) {
            this._globalCooldown -= deltaTime;
            if (this._globalCooldown <= COOLDOWN_EPSILON) {
                this._globalCooldown = 0;
            }
        }
    }

    canAttack() {
        return this._globalCooldown <= 0;
    }

    getCooldown() {
        return Math.max(0, this._globalCooldown);
    }
}
