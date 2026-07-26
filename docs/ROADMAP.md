# Development Roadmap

This document outlines the milestones and release plan for **Island Survival: Escape**, tracking features from the initial Minimum Viable Product (MVP) to full launch.

---

## 🚀 Version 0.1 – MVP ✅
*Goal: Deliver a fully playable game loop with a clear win condition.*

### Core Features
- Basic procedural island terrain.
- Third-person orbital character controller.
- Dynamic camera following and rotation.
- Basic lighting (Directional + Ambient Light).
- Resource harvesting (Wood, Stone) scattered on the island.
- Floating debris (Ropes, Barrels) spawning and drifting in the ocean.
- Crafting system (Stone Axe, Raft Frame, Paddle, Barrel Floats).
- Basic numerical inventory tracker HUD.
- Beach assembly site with sequential placement mechanics.
- Escape cutscene and victory overlay screen.
- Advanced debug panel overlay.

### MVP Recipes
- **Stone Axe:** 2 Wood + 2 Stone
- **Raft Frame:** 10 Wood
- **Paddle:** 5 Wood + 2 Rope
- **Barrel Floats:** 3 Barrel + 1 Rope
- **Raft Assembly:** Placed sequentially at the build site (Frame -> Floats -> Paddle).

---

## 🪵 Version 0.2 – Survival Systems ✅
*Goal: Make survival meaningful and introduce survival pressures.*

### Implemented Features
- **Vitals HUD:** Hunger, Thirst, Stamina, and Health indicators with drain mechanics. Hunger drains 1/30s, Thirst 1/20s; Health drains 1/5s when starving or dehydrated.
- **Campfire:** Placeable structure crafted from 5 Stone + 3 Wood. Allows cooking raw food into Cooked Meals.
- **Water Collector:** Placeable structure crafted from 4 Wood + 2 Barrel. Captures rainwater over time.
- **Cooking:** Process Coconuts and Raw Fish into Cooked Meals at the Campfire to restore Hunger.
- **New Resources:** Coconut (island), Raw Fish (ocean debris), Cooked Meal, Fresh Water.
- **Grid Inventory:** Visual slot grid with 20-slot carrying limit, tooltip hover, consumable highlighting.
- **Game-Themed UI:** Complete CSS overhaul from glassmorphism to rustic survival RPG style (wood, leather, earthy tones).
- **Consume System:** Press Q to eat/drink consumable items, restoring vitals.
- **Game Over:** Health reaches 0 when starving/dehydrated → death screen with retry.

### v0.2 Recipes
- **Campfire:** 5 Stone + 3 Wood
- **Water Collector:** 4 Wood + 2 Barrel

---

## 🏝️ Version 0.3 – Island Expansion ✅
*Goal: Encourage deep exploration and expand world scale.*

### Implemented Features
- **Larger Terrain:** Dynamically generated larger islands (100x100 world bounds).
- **Biomes & POIs:** Forest, dense rocky areas, caverns, and interactive waterfall cliffs with thirst-restoring water.
- **Fishing:** Craftable fishing rod to catch fish along the coastline for food.
- **Treasure Chests:** Hidden chests containing rare resources and Crafting Blueprints.
- **Raft Upgrades:** Progress from a basic wooden raft to a sail-powered or engine-powered vessel.

---

## ⛈️ Version 0.4 – Dynamic World ✅
*Goal: Enhance atmospheric immersion and environment feedback.*

### Implemented Features
- **Day/Night Cycle:** Dynamic sun progression changing lighting angles, colors, and shadows with smooth transitions through dawn, day, dusk, and night phases.
- **Weather System:** Dynamic weather states (Clear → Cloudy → Rain → Storm) with smooth interpolation, cloud cover affecting sky color, and lightning flashes during storms.
- **Dynamic Waves:** Weather-influenced wave amplitude and speed multipliers affecting the water shader's procedural vertex displacement.
- **Rain Particles:** Procedural rain particle system spawning around the player during wet weather.
- **Dynamic Audio:** Procedural wind (band-passed noise), rain (high-passed noise), and thunder (low-frequency burst) synthesized at runtime, with smooth gain transitions tied to weather intensity.

---

## 🐗 Version 0.5 – Wildlife & Combat ✅
*Goal: Introduce threats, risk, and combat systems.*

### Implemented Features
- **Base Creature AI:** Shared state machine (Idle/Patrol/Chase/Attack/Flee/Dead) with per-type behavior overrides.
- **Passive Creatures:** Crabs crawling on the beach (scuttle sideways, flee from player, drop raw crab meat).
- **Sky Creatures:** Seagulls circling above the island (flee when approached, drop raw seagull meat).
- **Hostile Wildlife:** Boars in the forest (charge attack, chase player, drop raw boar meat). Spawned by real Forest-biome lookup, not an approximation.
- **Water Threats:** Sharks patrolling deep waters (attack when player swims, circle-and-rush AI, disengage once the player reaches dry land).
- **Combat System:** Melee (spear) and ranged (bow) weapon support with cooldowns, hit detection, and damage application.
- **Weapons:** Craftable Spear (melee, 25 dmg) and Bow (ranged, 15 dmg, consumes arrows).
- **Ammunition:** Craftable Arrows (3 per craft from wood + stone).
- **Healing Items:** Craftable Bandages (3 herbs → heals 25 HP).
- **New Resources:** Raw Crab Meat, Raw Seagull Meat, Raw Boar Meat (cookable at campfire), Herbs (forest spawn), Bandages.
- **Combat Feedback:** Hit/miss notifications, particle effects on impact, creature damage to player, ammo counter HUD.
- **Creature Loot:** Dead creatures drop meat as pickable world resources (reuses existing pickup system).
- **Left-click Attack:** Attack with equipped weapon when hotbar item is Spear, Bow, or empty-handed (fist).
- **Creature Collision:** Creatures collide with terrain and environment, registered in the collision system.

### v0.5 Recipes
- **Spear:** 3 Wood + 1 Rope
- **Bow:** 3 Wood + 2 Rope
- **Arrow (x3):** 1 Wood + 1 Stone
- **Bandage:** 3 Herb

### v0.5 Combat Balance
| Creature | HP | Damage | Attack CD | Speed | Detection | Behaviour |
|---|---|---|---|---|---|---|
| Crab | 20 | – | – | 1.5 | 2.5 | Passive, flees on sight |
| Seagull | 15 | – | – | 4.0 | 6.0 | Passive, flees and climbs |
| Boar | 45 | 12 | 2.0s | 2.8 (charge 6.0) | 7.0 | Hostile, flees below 15 HP |
| Shark | 50 | 15 | 2.5s | 4.5 | 8.0 | Hostile in water only, flees below 15 HP |

Detection radii are deliberately short so the island stays explorable — the
chase leash (`detectionRadius × 2`) and flee cut-off (`× 3`) scale from them, so
a boar disengages at 14 units instead of hounding the player across the map.

| Weapon | Damage | Range | Cooldown |
|---|---|---|---|
| Fist | 5 | 1.5 | 0.4s |
| Stone Axe | 10 | 2.0 | 0.7s |
| Spear | 25 | 3.0 | 0.8s |
| Bow | 15 | 20.0 | 1.2s |

Player has 100 HP with no passive regeneration, so a Bandage (+25 HP) is the
only heal. Melee is capped to a ±63° cone with a vertical reach limit — only the
Bow can bring down a circling seagull.

---

## 🏆 Version 1.0 – Release Polish ✅
*Goal: Performance optimizations, save system, and final release.*

### Implemented Features
- **Save/Load System:** Full run state persisted to `localStorage` — player transform, vitals,
  all 28 inventory slots, raft modules, placed structures, unlocked blueprints, time of day,
  weather, remaining world pickups and run statistics. Autosaves every 60 s, on demand from the
  pause menu, and when leaving to the main menu. The save stores the **world seed** rather than
  terrain geometry: generation is deterministic, so the island is reproduced exactly on load.
  Death and escape both clear the save, so "Chơi tiếp" can never restore a finished run.
- **Settings Menu:** Reachable from both the main menu and pause menu. Audio (master / SFX /
  ambient / mute), controls (mouse sensitivity, invert Y, FOV), and graphics (quality preset,
  render scale, view distance, post-processing, bloom + intensity, vignette, particle density,
  frustum culling, FPS counter). Persisted to `localStorage` and applied live.
- **Optimization:** Frustum + draw-distance culling for environment props, world resources and
  creatures — typically ~90 % of the ~1 900 placed props are rejected before reaching the GPU.
  Render scale trades resolution for fill rate, per-frame `getElementById` lookups were replaced
  with cached references, and the debug panel skips its DOM writes entirely while collapsed.
- **Advanced VFX:** Full post-processing pipeline — the scene renders into a half-float
  framebuffer, followed by a soft-knee bright pass, a two-iteration separable Gaussian bloom at
  half resolution, and a composite pass with highlight rolloff, time-of-day grade tint,
  lightning-driven exposure and vignette. Falls back to direct rendering when the driver can't
  provide a float target.
- **Achievements:** 14 milestones with unlock toasts and a browsable panel. Unlocks persist at
  the profile level, so they survive a wiped save.
- **Main Menu / Credits:** Continue (with survival-time preview), Start, Tutorial, Settings,
  Achievements (with progress count) and Credits.

### v1.0 Graphics Presets
| Preset | Render Scale | Post-FX | Bloom | Particles | View Distance |
|---|---|---|---|---|---|
| Thấp | 70 % | ✗ | ✗ | 40 % | 60 m |
| Trung Bình | 85 % | ✓ | ✗ | 70 % | 90 m |
| Cao | 100 % | ✓ | ✓ | 100 % | 130 m |
| Siêu Cao | 100 % | ✓ | ✓ | 140 % | 200 m |

Changing any individual graphics switch moves the selector to *Tùy chỉnh* (custom) so the UI
never claims a preset that no longer describes the configuration.

### v1.0 Achievements
| Achievement | Requirement |
|---|---|
| Bước Đầu Sinh Tồn | Nhặt tài nguyên đầu tiên |
| Tay Săn Lượm | Nhặt 50 tài nguyên |
| Thợ Thủ Công | Chế tạo 10 vật phẩm |
| Đầu Bếp Đảo Hoang | Nấu 5 món ăn |
| Ngư Phủ | Câu được 5 con cá |
| Thợ Săn | Hạ gục 5 sinh vật |
| Săn Kho Báu | Mở đủ 4 rương kho báu |
| Trụ Vững | Sinh tồn 5 phút |
| Kẻ Bất Khuất | Sinh tồn 15 phút |
| Qua Một Đêm Dài | Sống sót trọn một đêm |
| Vượt Bão | Trụ lại qua một cơn bão |
| Thợ Đóng Bè | Hoàn thành chiếc bè |
| Tốc Độ Tối Đa | Lắp động cơ lên bè |
| Thoát Khỏi Đảo | Rời khỏi đảo hoang |

### Not Carried Forward
Two items from the original v1.0 sketch were dropped deliberately:
- **Controls remapping** — the settings menu covers sensitivity, invert-Y and FOV, but key
  rebinding would need an input-action layer that `InputManager` doesn't have yet.
- **Screen-space reflections / shadow maps** — both need a depth pre-pass and a second camera
  pass; bloom, grading and vignette deliver the visual lift at a fraction of the cost on the
  software-rendered fallback path.

Storage keys: `island_survival_save_v1`, `island_survival_settings_v1`,
`island_survival_achievements_v1`.
