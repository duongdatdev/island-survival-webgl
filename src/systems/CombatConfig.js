import { COMBAT_BALANCE } from '../gameplay/BalanceConfig.js';
import { CAMPAIGN_TOOL_PROFILES } from '../gameplay/CampaignDatabase.js';

export const WEAPON_PROFILES = Object.freeze({ ...COMBAT_BALANCE, ...CAMPAIGN_TOOL_PROFILES });
export const AXE_SWING_DURATION = WEAPON_PROFILES.stone_axe.duration;
export const AXE_IMPACT_TIME = WEAPON_PROFILES.stone_axe.impactTime;

export function getWeaponProfile(weaponId) {
    return WEAPON_PROFILES[weaponId] || null;
}
