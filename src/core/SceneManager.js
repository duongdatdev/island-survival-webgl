export class SceneManager {
    constructor(engine) {
        this.engine = engine;
        this.scenes = new Map();
        this.activeScene = null;
        this.activeSceneName = '';
    }

    addScene(name, sceneClass) {
        this.scenes.set(name, sceneClass);
    }

    switchScene(name) {
        if (!this.scenes.has(name)) {
            console.error(`SceneManager: Scene '${name}' is not registered.`);
            return;
        }

        console.log(`SceneManager: Transitioning to scene '${name}'...`);

        if (this.activeScene) {
            this.activeScene.destroy();
            this.activeScene = null;
        }

        this.activeSceneName = name;

        const SceneClass = this.scenes.get(name);
        this.activeScene = new SceneClass(this.engine);
        this.activeScene.init();

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
