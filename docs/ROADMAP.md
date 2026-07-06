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

## 🪵 Version 0.2 – Survival Systems ✅ (Current Version)
*Goal: Make survival meaningful and introduce survival pressures.*

### Implemented Features
- **Vitals HUD:** Hunger, Thirst, Stamina, and Health indicators with drain mechanics.
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

## 🏝️ Version 0.3 – Island Expansion ✅ (Current Version)
*Goal: Encourage deep exploration and expand world scale.*

### Implemented Features
- **Larger Terrain:** Dynamically generated larger islands (100x100 world bounds).
- **Biomes & POIs:** Forest, dense rocky areas, caverns, and interactive waterfall cliffs with thirst-restoring water.
- **Fishing:** Craftable fishing rod to catch fish along the coastline for food.
- **Treasure Chests:** Hidden chests containing rare resources and Crafting Blueprints.
- **Raft Upgrades:** Progress from a basic wooden raft to a sail-powered or engine-powered vessel.

---

## ⛈️ Version 0.4 – Dynamic World
*Goal: Enhance atmospheric immersion and environment feedback.*

### Planned Features
- **Day/Night Cycle:** Dynamic sun progression changing lighting angles, colors, and shadows.
- **Weather System:** Storms, heavy downpours, wind effects, and lightning.
- **Dynamic Waves:** Weather-influenced wave heights that affect raft sailing and debris drift speed.
- **Dynamic Audio:** Adaptive ambient soundscapes that change with time and weather.

---

## 🐗 Version 0.5 – Wildlife & Combat
*Goal: Introduce threats, risk, and combat systems.*

### Planned Features
- **Passive Creatures:** Crabs crawling on the beach, seagulls circling the sky (can be hunted for food).
- **Hostile Wildlife:** Boars in the forest that charge when approached, sharks patrolling deep waters.
- **Combat System:** Craft weapons (Spears, Bows) to defend against threats.
- **Healing Items:** Craftable bandages using forest herbs.

---

## 🏆 Version 1.0 – Release Polish
*Goal: Performance optimizations, save system, and final release.*

### Planned Features
- **Save/Load System:** Persist progression locally using browser `localStorage` or save files.
- **Settings Menu:** Audio volume controls, controls remapping, and graphics quality configurations.
- **Optimization:** Minimizing WebGL draw calls, garbage collection reduction, and code-splitting.
- **Advanced VFX:** Post-processing shaders (bloom, screen-space reflections, shadow maps).
- **Achievements:** In-game milestone accomplishments.
- **Main Menu / Credits:** Structured startup scene with credits.
