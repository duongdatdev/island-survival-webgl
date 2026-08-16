import { getResourceDef } from './ResourceDatabase.js';

const FIST = { type: 'melee', damage: 5, range: 1.5, cooldown: 0.4 };
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

        const range = weaponData.range;
        const damage = weaponData.damage;
        const halfArc = Math.PI * 0.35;

        const facingX = Math.sin(playerYaw);
        const facingZ = Math.cos(playerYaw);

        let closestCreature = null;
        let closestDist = range;

        for (const creature of creatures) {
            if (creature.state === 'dead') continue;

            const dx = creature.position[0] - playerPosition[0];
            const dz = creature.position[2] - playerPosition[2];
            const dy = creature.position[1] - playerPosition[1];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > range) continue;
            if (Math.abs(dy) > range) continue;

            if (dist > 0.0001) {
                const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle > halfArc) continue;
            }

            if (dist < closestDist) {
                closestDist = dist;
                closestCreature = creature;
            }
        }

        this._globalCooldown = weaponData.cooldown;
        this._lastWeaponType = weaponData.type;

        if (closestCreature) {
            closestCreature.takeDamage(damage);
            return { hit: true, creature: closestCreature, damage, swung: true };
        }

        return { hit: false, creature: null, damage: 0, swung: true };
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

        this._globalCooldown = weaponData.cooldown;
        this._lastWeaponType = weaponData.type;

        if (closestCreature) {
            closestCreature.takeDamage(damage);
            return { hit: true, creature: closestCreature, damage, swung: true };
        }

        return { hit: false, creature: null, damage: 0, swung: true };
    }

    _getWeaponData(equippedItem) {
        if (!equippedItem) return FIST;

        const def = getResourceDef(equippedItem.id);
        if (!def || !def.weaponType) return FIST;

        return {
            type: def.weaponType,
            damage: def.weaponDamage,
            range: def.weaponRange,
            cooldown: def.weaponCooldown,
        };
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
