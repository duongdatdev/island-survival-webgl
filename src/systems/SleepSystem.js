// Sleeping uses 35% of awake metabolism; weather and exposure still progress.
const SLEEP_METABOLISM = 0.35;

export function getSleepPlan(scene) {
    const time = scene.dayNight.timeOfDay;
    const dawn = scene.dayNight.dawnTime;
    const night = time >= scene.dayNight.duskTime || time < dawn;
    let reason = '';
    if (!scene.shelter?.covers(scene.player.position)) reason = 'Hãy vào dưới mái trú ẩn.';
    else if (!night) reason = 'Chỉ ngủ được vào ban đêm.';
    else if (scene._isGameOver || scene.isEscaping || scene.isFishing) reason = 'Không thể ngủ lúc này.';
    else if (scene._isPlayerInExposureWater()) reason = 'Hãy lên nền đất khô.';
    else if (scene.exposure.warmth < 40 || scene.exposure.wetness > 40) reason = 'Cần sưởi ấm và hong khô trước khi ngủ.';
    else if ((scene.creatures || []).some(creature => creature.health > 0 && creature.attackDamage > 0
        && Math.hypot(creature.position[0] - scene.player.position[0],
            creature.position[2] - scene.player.position[2]) < Math.max(12, creature.detectionRadius || 0))) {
        reason = 'Có thú nguy hiểm gần trại. Chưa thể ngủ.';
    }
    const seconds = ((dawn - time + 1) % 1) / scene.dayNight.daySpeed;
    const hungerCost = seconds * SLEEP_METABOLISM * scene.vitals.hungerDrainRate;
    const thirstCost = seconds * SLEEP_METABOLISM * scene.vitals.thirstDrainRate;
    if (!reason && (scene.vitals.hunger <= hungerCost + 5 || scene.vitals.thirst <= thirstCost + 5)) {
        reason = 'Cần ăn uống đủ trước khi ngủ (giữ lại ít nhất 5 điểm).';
    }
    return { allowed: !reason, reason, seconds, hungerCost, thirstCost };
}

export function sleepUntilDawn(scene) {
    const plan = getSleepPlan(scene);
    if (!plan.allowed) return plan;
    // Advance in bounded steps so changing weather and rain collection stay consistent.
    let remaining = plan.seconds;
    while (remaining > 0.000001) {
        const step = Math.min(1, remaining);
        scene.weather.update(step);
        const effects = scene.weather.getGameplayEffects();
        const fireProtected = scene.shelter.covers(scene.campfire.position);
        scene.campfire.update(step, fireProtected ? { ...effects, campfireIntensityMultiplier: 1 } : effects);
        scene.waterCollector.update(step, effects.rainFactor);
        scene.vitals.update(step * SLEEP_METABOLISM, false);
        const exposure = scene.exposure.update(step, {
            sheltered: true, isNight: true, rainFactor: effects.rainFactor,
            nearCampfire: scene.campfire.isPlayerInWarmthRange(scene.player.position),
            fireIntensityMultiplier: fireProtected ? 1 : effects.campfireIntensityMultiplier,
        });
        if (exposure.damage > 0) scene.vitals.applyDamage(exposure.damage, 'cold');
        remaining -= step;
        if (scene.vitals.health <= 0) break;
    }
    const elapsed = plan.seconds - remaining;
    scene.dayNight.timeOfDay = remaining <= 0.000001 ? scene.dayNight.dawnTime
        : (scene.dayNight.timeOfDay + elapsed * scene.dayNight.daySpeed) % 1;
    scene.survivalSeconds += elapsed;
    if (remaining <= 0.000001) {
        scene.stats.nightsSurvived++;
        scene._wasNight = false;
    }
    scene._exposureModifiers = scene.exposure.getModifiers();
    scene._updateExposureStatus();
    if (scene.vitals.health <= 0) return { ...plan, elapsed };
    scene._showNotification('🌅 Đã thức dậy! Đói −' + Math.ceil(plan.hungerCost)
        + ' · Khát −' + Math.ceil(plan.thirstCost) + '.');
    scene.saveController.save(true);
    return { ...plan, elapsed };
}
