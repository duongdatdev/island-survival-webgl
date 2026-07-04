# Coding Guidelines

This document establishes the style guide and engineering standards for the **Island Survival: Escape** project. Adhering to these guidelines ensures clean, maintainable, and leak-free code.

---

## 1. Module and File Standards
*   **One Class Per File:** Every JavaScript file must define and export exactly one class as a default or named export (e.g., `export class Engine`).
*   **ES6 Modules:** Use native browser `import`/`export` syntax. Avoid build pipelines (Webpack, Rollup) in the MVP branch to allow running the source code directly in modern browsers.
*   *Path Rules:* Always append the `.js` extension explicitly in import statements (e.g., `import { Mesh } from '../renderer/Mesh.js';`).

---

## 2. Naming Conventions
*   **Classes:** Use **PascalCase** (e.g., `SceneManager`, `WorldResource`).
*   **Methods & Variables:** Use **camelCase** (e.g., `addItem()`, `currentSpeed`, `updateModelMatrix()`).
*   **Constants & Static Data:** Use **UPPER_CASE** (e.g., `PRESET`, `DEFAULT_DENSITY`).
*   **Internal / Private Members:** Prefix with a single underscore `_` to denote that the member or method is private to the class (e.g., `this._footstepTimer`, `this._updateTip()`).

---

## 3. WebGL Resource Management (GPU Memory Cleanup)
WebGL acts as a state machine managing assets inside GPU memory. To avoid memory leaks:
*   Classes wrapping WebGL resources (`Mesh`, `Texture`, `ShaderProgram`) must implement a `delete()` or `destroy()` method.
*   Cleanup methods must invoke the respective WebGL API delete calls:
    *   `Mesh.js` -> `gl.deleteBuffer(this.vbo)`, `gl.deleteBuffer(this.ibo)`, `gl.deleteVertexArray(this.vao)`
    *   `Texture.js` -> `gl.deleteTexture(this.texture)`
    *   `ShaderProgram.js` -> `gl.deleteProgram(this.program)`
*   When a scene is unloaded (inside the scene's `destroy()` lifecycle method), it must call the cleanup routines on all active entities to free GPU resources.

---

## 4. Separation of Gameplay & UI
*   Do not mix gameplay math or state changes directly with browser DOM mutations.
*   **Event-Driven UI:** Rely on callback registers. For example, when adding items to the `Inventory`, it fires an `onChange` event. The parent `GameScene` listens to this event and handles the DOM updates (redrawing the HUD elements).

---

## 5. Browser Integration & Web Audio API
*   **Non-blocking Execution:** Never use blocking loops or synchronous sleep routines. Implement all periodic logic within the delta-time-driven `update` hooks powered by `requestAnimationFrame`.
*   **User Gestures for Audio:** Modern browsers block audio autoplay. Always defer initializing or resuming the `AudioContext` until the user performs an explicit gesture, such as clicking a menu button.
