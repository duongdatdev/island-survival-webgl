/**
 * Base Scene class representing a game state
 */
export class Scene {
    /**
     * @param {Engine} engine - Reference to the core game engine
     */
    constructor(engine) {
        this.engine = engine;
        this.gl = engine.gl;
    }

    /**
     * Called when the scene is loaded and set active
     */
    init() {}

    /**
     * Called on every logic tick
     * @param {number} deltaTime - Time elapsed since last frame in seconds
     */
    update(deltaTime) {}

    /**
     * Called on every frame paint
     */
    render() {}

    /**
     * Called when the scene is being unloaded or switched out
     */
    destroy() {}
}
