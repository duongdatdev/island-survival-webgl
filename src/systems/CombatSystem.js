import { getResourceDef } from './ResourceDatabase.js';

/**
 * Bare hands. Not a resource, so it can't come from the database like every
 * other weapon does.
 */
const FIST = { type: 'melee', damage: 5, range: 1.5, cooldown: 0.4 };

/**
 * CombatSystem — Handles melee and ranged attacks against creatures.
 * Detects weapon type from equipped hotbar item and applies damage.
 */
export class CombatSystem {
    constructor() {
        // Cooldown state shared across all weapons
        this._globalCooldown = 0;
        this._lastWeaponType = null;
    }

    /**
     * Perform a melee attack in the player's forward direction.
     * @param {Float32Array|number[]} playerPosition
     * @param {number} playerYaw — rotation[1] from Player
     * @param {object|null} equippedItem — hotbar item { id, count } or null
     * @param {Creature[]} creatures — array of living creatures
     * @param {object} [inventory] — for arrow consumption
     * @returns {{ hit: boolean, creature: object|null, damage: number }}
     */
    attack(playerPosition, playerYaw, equippedItem, creatures, inventory) {
        // Determine weapon stats from equipped item
        const weaponData = this._getWeaponData(equippedItem);
        if (!weaponData) {
            return { hit: false, creature: null, damage: 0 };
        }

        // Check cooldown — nothing happened, so the caller shows no feedback
        if (this._globalCooldown > 0) {
            return { hit: false, creature: null, damage: 0, onCooldown: true };
        }

        // Ranged weapon check
        if (weaponData.type === 'ranged') {
            return this._rangedAttack(playerPosition, playerYaw, weaponData, creatures, inventory);
        }

        // Melee attack — arc check in front of player
        const range = weaponData.range;
        const damage = weaponData.damage;
        const halfArc = Math.PI * 0.35; // ~126-degree total swing cone

        // Direction the player is facing
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
            // Melee can't reach a gull circling overhead
            if (Math.abs(dy) > range) continue;

            // Point blank: always a hit, and dividing by dist would be NaN
            if (dist > 0.0001) {
                const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle > halfArc) continue;
            }

            // Pick closest in range
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

        // Miss — cooldown still applied (the swing happened)
        return { hit: false, creature: null, damage: 0, swung: true };
    }

    /**
     * Ranged attack — fires a projectile in camera direction.
     * Alternatively called internally from attack() for bow.
     * @private
     */
    _rangedAttack(playerPosition, playerYaw, weaponData, creatures, inventory) {
        // Consume arrow
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

        // Raycast: check all creatures along the firing line
        let closestCreature = null;
        let closestDist = range;

        for (const creature of creatures) {
            if (creature.state === 'dead') continue;

            const dx = creature.position[0] - playerPosition[0];
            const dz = creature.position[2] - playerPosition[2];
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > range) continue;

            // Project creature position onto firing direction
            const t = dx * facingX + dz * facingZ;
            if (t <= 0) continue; // Behind player

            // Perpendicular distance from ray to creature center
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

    /**
     * Get weapon stats for the equipped item.
     *
     * Stats live in ResourceDatabase (`weaponType`/`weaponDamage`/`weaponRange`/
     * `weaponCooldown`) so balance changes land in one place. Anything without
     * those fields — a coconut, a plank — swings as a fist.
     * @private
     */
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

    /**
     * Call every frame to reduce cooldown timer
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (this._globalCooldown > 0) {
            this._globalCooldown -= deltaTime;
        }
    }

    /**
     * Check if any attack can be performed
     */
    canAttack() {
        return this._globalCooldown <= 0;
    }

    /**
     * Get remaining cooldown
     */
    getCooldown() {
        return Math.max(0, this._globalCooldown);
    }
}
