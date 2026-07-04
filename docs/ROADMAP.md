# Development Roadmap

This document outlines the milestones and release plan for **Island Survival: Escape**, tracking features from the initial Minimum Viable Product (MVP) to full launch.

---

## 🚀 Version 0.1 – MVP (Current Version)
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

## 🪵 Version 0.2 – Survival Systems
*Goal: Make survival meaningful and introduce survival pressures.*

### Planned Features
- **Vitals HUD:** Hunger, Thirst, Stamina, and Health indicators.
- **Campfire:** Placeable structure using Wood + Stone. Provides warmth and cooking capabilities.
- **Cooking:** Process raw items collected into edible meals to restore hunger.
- **Water Collector:** Device to capture rainwater and restore thirst.
- **Grid Inventory:** Re-engineer inventory from simple numerical counts to a visual slot grid with carrying limits.
- **Item Icons:** Beautifully rendered 2D vector/pixel icons representing all resources and crafted gear.

---

## 🏝️ Version 0.3 – Island Expansion
*Goal: Encourage deep exploration and expand world scale.*

### Planned Features
- **Larger Terrain:** Dynamically generated larger islands.
- **Biomes & POIs:** Forest, dense rocky areas, caverns, and waterfalls.
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
