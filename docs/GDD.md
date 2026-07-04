# Game Design Document (GDD)

## Island Survival: Escape

**Version:** 1.0 (Pre-Production)

# 1. High Concept

## Elevator Pitch

Island Survival: Escape is a third-person 3D survival and crafting game
built with WebGL. The player wakes up alone on a deserted island after a
shipwreck. Instead of surviving forever, the objective is to gather
resources, collect floating debris carried by ocean currents, craft raft
modules, assemble a raft, and escape.

## Genre

-   Survival
-   Crafting
-   Exploration
-   Third Person

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
-   Mouse: Camera
-   E: Interact / Pickup
-   Tab: Inventory
-   C: Craft
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

-   Rope
-   Barrel
-   Bottle
-   Scrap

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

# 17. MVP Scope

Included: - Exploration - Gathering - Debris - Inventory - Crafting -
Raft Building - Escape Ending

Excluded: - Hunger - Thirst - Weather - Wildlife - Combat - Save/Load

# 18. Future Roadmap

Version 0.2 - Hunger - Thirst - Campfire - Cooking

Version 0.3 - Fishing - Cave - Treasure

Version 0.4 - Weather - Day/Night - Dynamic Ocean

Version 0.5 - Wildlife - Combat

Version 1.0 - Polish - Optimization - Save/Load
