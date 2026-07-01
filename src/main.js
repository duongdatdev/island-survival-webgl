import { Engine } from './core/Engine.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { GameScene } from './scenes/GameScene.js';

// Boot strap the WebGL 2 application on DOM completion
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('App: Bootstrapping Island Survival: Escape foundation...');

        // 1. Initialize core game engine with canvas ID
        const engine = new Engine('game-canvas');

        // 2. Register scenes to manager
        engine.scenes.addScene('Loading', LoadingScene);
        engine.scenes.addScene('Game', GameScene);

        // 3. Initiate first scene transition
        engine.scenes.switchScene('Loading');

        // 4. Start execution of tick loops
        engine.start();

        // Save reference globally for debugging purposes
        window.__GAME_ENGINE__ = engine;

    } catch (error) {
        console.error('App: Initialization crash:', error);
        
        // Render fall-back crash details in UI
        const loaderText = document.getElementById('loader-text');
        if (loaderText) {
            loaderText.innerHTML = `<span style="color:#ef4444; font-weight:bold;">Crash: ${error.message}</span>`;
        }
        
        const loaderBar = document.getElementById('loader-bar');
        if (loaderBar) {
            loaderBar.style.backgroundColor = '#ef4444';
            loaderBar.style.boxShadow = '0 0 10px #ef4444';
        }
    }
});
