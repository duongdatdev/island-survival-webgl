# Game Design Document (GDD)

## Island Survival: Escape

**Version:** 1.0 (Release)

# 1. High Concept

## Elevator Pitch

Island Survival: Escape is a first-person 3D survival and crafting game
built with WebGL. The player wakes up alone on a deserted island after a
shipwreck. Instead of surviving forever, the objective is to gather
resources, collect floating debris carried by ocean currents, craft raft
modules, assemble a raft, and escape.

## Genre

-   Survival
-   Crafting
-   Exploration
-   First Person

## Platform

-   Desktop Browser
-   Keyboard + Mouse

## Target Session

10--20 minutes (MVP)

# 2. Core Pillars

1.  Exploration
2.  Resource Management
3.  Crafting Progression
4.  Clear Goal (Escape)
5.  Relaxed Survival

# 3. Player Experience

The player explores the island, collects wood and stone, patrols the
beach for floating debris, crafts better equipment, assembles raft
modules, and finally escapes.

# 4. Gameplay Loop

Explore → Gather Resources → Collect Floating Debris → Return to Base →
Craft Equipment → Craft Raft Modules → Assemble Raft → Escape

# 5. Controls

-   WASD: Move
-   Mouse: First-person camera while pointer-locked
-   Left Mouse: Attack / Chop
-   Mouse Wheel: Select hotbar slot
-   E: Interact / Pickup
-   Tab / C: Inventory and Crafting
-   Q: Use / Place active item
-   Esc: Pause and release pointer lock
-   ESC: Pause

# 6. World

## Island

-   Beach
-   Forest
-   Rock Area
-   Build Area

## Ocean

-   Infinite visual ocean
-   Floating debris spawn zone

# 7. Resources

## Natural

-   Wood
-   Stone

## Floating Debris

-   Wood
-   Stone
-   Rope
-   Barrel

# 8. Inventory

-   Unlimited stacks (MVP)
-   Count-based inventory
-   Instant pickup
-   Resource categories

# 9. Floating Debris System

Every 30 seconds, debris spawns outside the island and drifts toward
shore. Debris types are selected randomly. Expired debris despawns and
new debris is spawned.

# 10. Crafting

## Recipes

### Stone Axe

-   Wood x2
-   Stone x2

### Raft Frame

-   Wood x10

### Paddle

-   Wood x5
-   Rope x2

### Barrel Floats

-   Barrel x3
-   Rope x1

# 11. Build System

The raft is built in a dedicated beach area.

Assembly order: 1. Place Raft Frame 2. Place Barrel Floats 3. Place
Paddle

After all modules are installed: - Play completion animation - Enable
Escape interaction - End game

# 12. Win Condition

Escape the island by launching the completed raft.

# 13. UI

-   Main Menu
-   HUD
-   Inventory
-   Craft Window
-   Pause Menu
-   Win Screen

# 14. Audio

Ambient: - Ocean - Wind - Birds

SFX: - Pickup - Craft - Build - Victory

# 15. Visual Style

-   Low Poly
-   Stylized
-   Bright Colors
-   Clean Materials

# 16. Technical Constraints

-   WebGL
-   60 FPS target
-   Browser-first
-   Low memory usage

# 17. Release Scope

Version 1.0 includes exploration, gathering, drifting debris, grid inventory,
crafting, survival vitals, cooking, fishing, treasure, procedural biomes,
day/night and weather, wildlife combat, raft upgrades, achievements, settings,
multiple local worlds, save/load, and the final escape sequence.

# 18. Post-Release Direction

- Connect weather more deeply to survival structures and wildlife behavior.
- Add difficulty presets, scoring, and shareable challenge seeds.
- Expand browser integration tests and save migration coverage.
- Continue runtime asset compression and rendering performance work.
