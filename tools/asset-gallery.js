import { AssetManager } from '../src/core/AssetManager.js';
import { ShaderProgram } from '../src/renderer/ShaderProgram.js';
import { BasicShader } from '../src/shaders/BasicShader.js';
import { Mat4 } from '../src/math/Mat4.js';
import { Mesh } from '../src/renderer/Mesh.js';
import { createCubeData } from '../src/renderer/CubeGeometry.js';
import { CampaignWorldGenerator } from '../src/gameplay/world/CampaignWorldGenerator.js';
import { Terrain } from '../src/entities/Terrain.js';

const canvas = document.getElementById('preview');
const gl = canvas.getContext('webgl2', { antialias: true });
const status = document.getElementById('status');
const select = document.getElementById('models');
const details = document.getElementById('details');
window.__assetQA = { loaded: 0, rendered: [], errors: [], frames: 0 };

if (!gl) throw new Error('WebGL 2 không khả dụng.');
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
const shader = new ShaderProgram(gl, BasicShader.vertex, BasicShader.fragment);
const assets = new AssetManager(gl);
const floor = new Mesh(gl, createCubeData(0.31, 0.36, 0.27));
const projection = Mat4.create();
const view = Mat4.create();
const modelMatrix = Mat4.create();
const floorMatrix = Mat4.create();
let current = null;
let angle = 0.5;
let rotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let scanning = false;
let scanTimer = 0;
let scanIndex = 0;
let previousTime = 0;
let models = [];
let worldTerrain = null;

// Manifest URLs are game-root relative; this developer tool lives one level down.
const response = await fetch('../assets/campaign/manifest.json');
const manifest = await response.json();
models = manifest.models;
const loaded = await Promise.all(models.map(def => assets.loadGLTFModel(`campaign:${def.id}`, '../' + def.path, {
    targetSize: def.targetSize, preserveAspect: true, grounded: true, nativeScale: def.nativeScale,
})));
window.__assetQA.loaded = loaded.filter(Boolean).length;
window.__assetQA.errors = models.filter((_, index) => !loaded[index]).map(def => def.id);
status.textContent = `${window.__assetQA.loaded}/${models.length} model đã tải`;

function populate() {
    const query = document.getElementById('filter').value.toLowerCase();
    select.replaceChildren();
    for (const definition of models.filter(model => model.id.toLowerCase().includes(query))) {
        const option = document.createElement('option');
        option.value = option.textContent = definition.id;
        select.append(option);
    }
    if (select.options.length) choose(select.value);
}

function choose(id) {
    if (worldTerrain) { worldTerrain.delete(); worldTerrain = null; }
    current = models.find(model => model.id === id);
    if (!current) return;
    select.value = id;
    details.textContent = `${id}\n${current.triangles.toLocaleString()} tam giác · ${current.drawables} phần vẽ\n`
        + `${current.targetSize.map(size => size.toFixed(2)).join(' × ')} m · ${current.license}`;
}

select.addEventListener('change', () => choose(select.value));
document.getElementById('filter').addEventListener('input', populate);
document.getElementById('rotate').addEventListener('click', event => {
    rotate = !rotate;
    event.currentTarget.textContent = rotate ? 'Dừng xoay' : 'Xoay model';
    event.currentTarget.setAttribute('aria-pressed', String(rotate));
});
document.getElementById('scan').addEventListener('click', () => {
    scanning = true;
    scanIndex = scanTimer = 0;
    window.__assetQA.rendered = [];
});
populate();
choose('campaign_smelter');
document.getElementById('world').addEventListener('click', () => {
    scanning = false;
    worldTerrain?.delete();
    const generator = new CampaignWorldGenerator();
    const world = generator.generate('campaign-preview', {}, false, { props: false });
    worldTerrain = new Terrain(gl, generator.size, generator.width, world.terrain, generator);
    worldTerrain.setView([0, 0, 0], 500);
    window.__assetQA.worldChunks = worldTerrain.chunkMeshes.length;
    details.textContent = `Đảo chiến dịch 640 × 640 m\n${worldTerrain.chunkMeshes.length} vùng terrain · 3 mức chi tiết\n8 địa điểm chính, tuyến đường và tài nguyên theo seed`;
});

function render(now) {
    const delta = Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    if (rotate) angle += delta * 0.3;
    if (scanning) {
        scanTimer += delta;
        choose(models[scanIndex].id);
        if (scanTimer > 0.15) {
            scanTimer = 0;
            scanIndex++;
            if (scanIndex >= models.length) {
                scanning = false;
                status.textContent = `Đã vẽ ${window.__assetQA.rendered.length}/${models.length} model · lỗi GPU: ${window.__assetQA.errors.length}`;
            }
        }
    }
    canvas.width = Math.floor(canvas.clientWidth * Math.min(devicePixelRatio, 1.5));
    canvas.height = Math.floor(canvas.clientHeight * Math.min(devicePixelRatio, 1.5));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.13, 0.18, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (current) {
        const radius = worldTerrain ? 240 : Math.max(...current.targetSize, 0.5);
        const eye = [Math.sin(angle) * radius * 2, radius * 1.2, Math.cos(angle) * radius * 2];
        Mat4.perspective(projection, Math.PI / 4, canvas.width / canvas.height, 0.01, radius * 20 + 20);
        Mat4.lookAt(view, eye, [0, current.targetSize[1] * 0.4, 0], [0, 1, 0]);
        shader.use();
        shader.setUniformMatrix4fv('uViewMatrix', view);
        shader.setUniformMatrix4fv('uProjectionMatrix', projection);
        shader.setUniform3fv('uViewPosition', eye);
        shader.setUniform3fv('uLightDirection', [0.5, 0.85, 0.3]);
        shader.setUniform3fv('uLightColor', [1, 0.94, 0.83]);
        shader.setUniform1f('uLightIntensity', 0.9);
        shader.setUniform3fv('uAmbientColor', [0.78, 0.85, 0.76]);
        shader.setUniform1f('uAmbientIntensity', 0.65);
        shader.setUniform1f('uPointLightIntensity', 0);
        shader.setUniform1f('uFirstPersonHeadCutoff', 1e6);
        Mat4.identity(floorMatrix);
        Mat4.translate(floorMatrix, floorMatrix, [0, -0.06, 0]);
        Mat4.scale(floorMatrix, floorMatrix, [radius * 3, 0.1, radius * 3]);
        shader.setUniformMatrix4fv('uModelMatrix', floorMatrix);
        shader.setUniform1i('uUseBaseColorTexture', 0);
        if (!worldTerrain) floor.draw(gl.TRIANGLES);
        Mat4.identity(modelMatrix);
        const model = assets.getModel(`campaign:${current.id}`);
        if (worldTerrain) worldTerrain.draw(shader);
        else model?.draw(shader, modelMatrix, gl.TRIANGLES);
        const error = gl.getError();
        if (error !== gl.NO_ERROR) window.__assetQA.errors.push({ id: current.id, code: error });
        if (model && !window.__assetQA.rendered.includes(current.id)) window.__assetQA.rendered.push(current.id);
    }
    window.__assetQA.frames++;
    requestAnimationFrame(render);
}
requestAnimationFrame(render);
