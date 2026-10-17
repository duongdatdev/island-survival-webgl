import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ viewport: { width: 1600, height: 900 } });

test('graphics remain coherent across biomes, quality presets, night and diving', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
    });
    page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') errors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    const output = '.cache/graphics-after';
    await mkdir(output, { recursive: true });
    await page.goto('/');
    await expect(page.locator('#main-menu')).toBeVisible({ timeout: 45000 });
    await page.locator('#menu-play-btn').click();
    await page.locator('#world-create-btn').click();
    await page.locator('#world-name-input').fill('Graphics verification');
    await page.locator('#world-seed-input').fill('biome-wildlife-qa');
    await page.locator('#world-form button[type="submit"]').click();
    await page.locator('#world-play-btn').click();
    await expect(page.locator('.campaign-toolbar')).toBeVisible({ timeout: 60000 });
    await page.addStyleTag({ content: '#pointer-lock-hint { display: none !important; }' });
    await page.evaluate(() => {
        const s = window.__GAME_ENGINE__.scenes.activeScene;
        s.tutorial.skip(); s.engine.input.setPointerLockEnabled(false);
        s.engine.settings.applyQualityPreset('high');
        s.dayNight.isPaused = true; s.dayNight.timeOfDay = .45;
        s.weather.forceWeather('clear'); s.update(.01); s.isPaused = true;
    });
    const captures = [];
    for (const [label, lx, lz, elevation, time] of [
        ['beach', 0, 242, 1.7, .45], ['savanna', 150, -25, 1.7, .45],
        ['jungle', -130, 80, 1.7, .45], ['mangrove', 183, 139, 1.7, .45],
        ['savanna-wide', 150, -25, 17, .45], ['beach-dusk', 0, 242, 1.7, .75],
        ['jungle-night', -130, 80, 1.7, .98],
        ['ocean-shore', 0, 242, 1.7, .45], ['abandoned-camp', 0, 0, 0, .45],
        ['waterfall', 0, 0, 0, .45], ['underwater', 0, 0, 0, .45],
    ]) {
        const state = await page.evaluate(async ({ label, lx, lz, elevation, time }) => {
            const s = window.__GAME_ENGINE__.scenes.activeScene, g = s.world.terrainGenerator;
            const { Mat4 } = await import('/src/math/Mat4.js');
            s.dayNight.timeOfDay = time; s.isPaused = false; s.update(.001); s.isPaused = true;
            const rotate = (x,z) => [x*Math.cos(g.rotation)-z*Math.sin(g.rotation), x*Math.sin(g.rotation)+z*Math.cos(g.rotation)];
            const [x,z] = rotate(lx,lz), h = g.getHeight(x,z);
            const [tx,tz] = rotate(lx+(elevation>2?-25:-8),lz+(elevation>2?-27:-18));
            let eye = [x,h+elevation,z], target = [tx,h+(elevation>2?-3:1),tz];
            if (label === 'ocean-shore') {
                const p=s.world.spawnPosition,r=Math.hypot(p[0],p[2]);
                eye=[p[0],p[1]+1.7,p[2]]; target=[p[0]+p[0]/r*30,p[1]+.2,p[2]+p[2]/r*30];
            } else if (label === 'abandoned-camp' || label === 'waterfall') {
                const p=s.world.pois.find(p=>p.id===(label==='waterfall'?'waterfall':'abandoned_camp')).position;
                eye=[p[0]+14,Math.max(p[1]+6,g.getHeight(p[0]+14,p[2]+17)+3),p[2]+17]; target=[p[0],p[1]+1,p[2]];
            } else if (label === 'underwater') {
                const p=s.world.pois.find(p=>p.id==='offshore_wreck').position;
                eye=[p[0],-2.2,p[2]+7]; target=[p[0],-3,p[2]];
                if (g.getHeight(eye[0],eye[2]) > -3) { eye=[340,-2.2,0];target=[350,-3,0]; }
            }
            s.player.position.set([eye[0],g.getHeight(eye[0],eye[2])+.9,eye[2]]);
            s.camera.position.set(eye);s.camera.target.set(target);
            Mat4.lookAt(s.camera.viewMatrix,eye,target,[0,1,0]);s._updateInvViewProj();
            s.engine.renderStats.beginFrame(); s.render();
            const gl=s.gl,uniform=(shader,name)=>gl.getUniform(shader.program,gl.getUniformLocation(shader.program,name));
            return {label,eye,target,glError:gl.getError(),drawCalls:s._drawCalls,triangles:s.engine.renderStats.triangles,
                shadowDrawCalls:s.engine.renderStats.shadowDrawCalls,terrainDraws:s.terrain.lastChunkDraws,
                environmentInstances:s.environmentBatch.lastDrawnInstances,cover:s.groundCover.activeGrass.length,
                landmarkInstances:s.landmarkDetails.lastDrawnInstances,waterFog:uniform(s.waterShader,'uFogDensity'),
                outputLinear:s._linearScene,underwater:uniform(s.postFx._compositeProgram,'uUnderwater')};
        }, { label,lx,lz,elevation,time });
        expect(state.glError, label).toBe(0);
        expect(state.waterFog, label).toBeGreaterThan(0);
        expect(state.outputLinear, label).toBe(true);
        if (label === 'underwater') expect(state.underwater).toBe(1);
        await page.screenshot({ path: `${output}/${label}.png` });
        captures.push(state);
    }
    // Verify live simulation/rendering rather than using a frozen scene as an FPS benchmark.
    const performanceSamples = [];
    for (const quality of ['low','medium','high','ultra']) {
        const sample = await page.evaluate(async quality => {
            const s=window.__GAME_ENGINE__.scenes.activeScene;
            s.engine.settings.applyQualityPreset(quality);
            s.player.position.set(s.world.spawnPosition);s.player.position[1]+=.9;
            s.camera._firstUpdate=true;s.dayNight.timeOfDay=.45;s.isPaused=false;
            const startPlay=s.campaign.playSeconds;
            const frames=[];let previous,start;
            await new Promise(resolve=>requestAnimationFrame(function frame(now){
                if(start===undefined)start=now;
                if(previous!==undefined)frames.push(now-previous);previous=now;
                if(now-start>=2500)resolve();else requestAnimationFrame(frame);
            }));
            const sorted=[...frames].sort((a,b)=>a-b),gl=s.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');
            const result={quality,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
                viewport:[innerWidth,innerHeight],renderSize:[gl.canvas.width,gl.canvas.height],frames:frames.length,
                fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),p95ms:sorted[Math.floor(sorted.length*.95)],
                livePlaySeconds:s.campaign.playSeconds-startPlay,drawCalls:s._drawCalls,triangles:s.engine.renderStats.triangles,
                shadowDrawCalls:s.engine.renderStats.shadowDrawCalls,glError:gl.getError(),post:s._linearScene};
            s.isPaused=true;return result;
        },quality);
        expect(sample.glError,quality).toBe(0);
        expect(sample.livePlaySeconds,quality).toBeGreaterThan(1.5);
        expect(sample.post,quality).toBe(quality !== 'low');
        performanceSamples.push(sample);
    }
    await writeFile(`${output}/verification.json`,JSON.stringify({recordedAt:new Date().toISOString(),
        scope:'Fixed-camera screenshots and 2.5-second live samples per preset at the initial spawn. Short smoke/performance samples, not a hardware-wide stress benchmark.',
        captures,performanceSamples,errors},null,2));
    expect(errors).toEqual([]);
});
