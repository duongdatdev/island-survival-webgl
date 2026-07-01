/**
 * Scene Manager for coordinating state switches and game screens
 */
export class SceneManager {
    /**
     * @param {Engine} engine - Reference to the core game engine
     */
    constructor(engine) {
        this.engine = engine;
        this.scenes = new Map(); // Name -> Scene class
        this.activeScene = null;
        this.activeSceneName = '';
    }

    /**
     * Register a scene class with a unique name
     */
    addScene(name, sceneClass) {
        this.scenes.set(name, sceneClass);
    }

    /**
     * Switch to a registered scene by name
     */
    switchScene(name) {
        if (!this.scenes.has(name)) {
            console.error(`SceneManager: Scene '${name}' is not registered.`);
            return;
        }

        console.log(`SceneManager: Transitioning to scene '${name}'...`);

        // Destroy current active scene
        if (this.activeScene) {
            this.activeScene.destroy();
            this.activeScene = null;
        }

        this.activeSceneName = name;

        // Instantiate and initialize new scene
        const SceneClass = this.scenes.get(name);
        this.activeScene = new SceneClass(this.engine);
        this.activeScene.init();

        // Update active scene in the debug panel DOM
        const sceneEl = document.getElementById('debug-scene');
        if (sceneEl) {
            sceneEl.textContent = name;
        }
    }

    update(deltaTime) {
        if (this.activeScene) {
            this.activeScene.update(deltaTime);
        }
    }

    render() {
        if (this.activeScene) {
            this.activeScene.render();
        }
    }

    destroy() {
        if (this.activeScene) {
            this.activeScene.destroy();
            this.activeScene = null;
        }
        this.scenes.clear();
    }
}
