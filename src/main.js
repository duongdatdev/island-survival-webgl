import { Engine } from './core/Engine.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { GameScene } from './scenes/GameScene.js';

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('App: Bootstrapping Island Survival: Escape foundation...');

        const engine = new Engine('game-canvas');

        engine.scenes.addScene('Loading', LoadingScene);
        engine.scenes.addScene('MainMenu', MainMenuScene);
        engine.scenes.addScene('Game', GameScene);

        engine.scenes.switchScene('Loading');

        engine.start();

        window.__GAME_ENGINE__ = engine;

    } catch (error) {
        console.error('App: Initialization crash:', error);
        
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
