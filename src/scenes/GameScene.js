import { Scene } from '../core/Scene.js';
import { Camera } from '../renderer/Camera.js';
import { DirectionalLight, AmbientLight } from '../renderer/Light.js';
import { ShaderProgram } from '../renderer/ShaderProgram.js';
import { Mesh } from '../renderer/Mesh.js';
import { BasicShader } from '../shaders/BasicShader.js';
import { WaterShader } from '../shaders/WaterShader.js';
import { Player } from '../entities/Player.js';
import { Terrain } from '../entities/Terrain.js';
import { Water } from '../entities/Water.js';
import { Mat4 } from '../math/Mat4.js';
import { Vec3 } from '../math/Vec3.js';
import { ResourceManager } from '../systems/ResourceManager.js';
import { DebrisManager } from '../systems/DebrisManager.js';
import { Inventory } from '../systems/Inventory.js';

/**
 * Main active gameplay scene
 */
export class GameScene extends Scene {
    init() {
        console.log('GameScene: Initializing gameplay state...');
        const gl = this.gl;

        // 1. Shaders Initialisation
        this.basicShader = new ShaderProgram(gl, BasicShader.vertex, BasicShader.fragment);
        this.waterShader = new ShaderProgram(gl, WaterShader.vertex, WaterShader.fragment);

        // 2. Camera Setup
        this.camera = new Camera(45 * Math.PI / 180, gl.canvas.width / gl.canvas.height, 0.1, 1000.0);

        // 3. Lighting Setup
        this.dirLight = new DirectionalLight([0.6, 1.0, 0.3], [1.0, 0.95, 0.85], 1.0);
        this.ambientLight = new AmbientLight([0.22, 0.28, 0.38], 0.4);
        this.lightTime = 0.0;

        // 4. Entities Setup
        this.player = new Player();
        this.terrain = new Terrain(gl, 80, 50.0); // 80x80 divisions, size 50
        this.water = new Water(gl, 60, 100.0);   // 60x60 divisions, size 100

        // 5. Build Player Meshes (Cube data)
        const redBodyData = this._createCubeData(0.9, 0.25, 0.25); // Red body
        this.bodyMesh = new Mesh(gl, redBodyData);

        const skinHeadData = this._createCubeData(0.98, 0.80, 0.65); // Skin colored head
        this.headMesh = new Mesh(gl, skinHeadData);

        const blackVisorData = this._createCubeData(0.1, 0.12, 0.18); // Dark visor
        this.visorMesh = new Mesh(gl, blackVisorData);

        // 6. Resource System Initialization
        this.inventory = new Inventory();
        this.resourceManager = new ResourceManager();
        this.debrisManager = new DebrisManager();

        // Spawn resources scattered across the island
        this.resourceManager.spawnRandomResources(gl, this.terrain, 30);

        // Bind inventory changes to UI updates
        this.inventory.onChange = (resourceId, newCount, delta) => {
            this._updateResourceHUD(resourceId, newCount);
        };

        // 7. Running properties
        this.time = 0.0;
        this.tempMatrix = Mat4.create();

        // Configure depth states
        gl.clearColor(0.53, 0.74, 0.90, 1.0); // Nice sky blue clear color
    }

    update(deltaTime) {
        this.time += deltaTime;

        // Rescale aspect ratio if canvas resized
        this.camera.setAspect(this.gl.canvas.width / this.gl.canvas.height);

        // Update player movements using keyboards and camera reference
        this.player.update(deltaTime, this.engine.input, this.camera, this.terrain);

        // Snap camera tracking around player
        this.camera.update(this.engine.input, this.player.position);

        // Update resource system (animations, pickup detection)
        this.resourceManager.update(deltaTime, this.player.position, this.inventory, this.engine.input);

        // Update drifting debris system (skip pickup if resource pickup is available)
        this.debrisManager.update(deltaTime, this.player.position, this.inventory, this.engine.input, this.terrain, this.gl, this.resourceManager.nearestPickable);

        // Manage light rotation from Debug UI checkbox
        const rotLightEl = document.getElementById('toggle-light-rot');
        const rotateLight = rotLightEl ? rotLightEl.checked : true;
        if (rotateLight) {
            this.lightTime += deltaTime * 0.15;
            const lx = Math.cos(this.lightTime) * 0.6;
            const lz = Math.sin(this.lightTime) * 0.6;
            this.dirLight.setDirection(lx, 1.0, lz);
        }

        // Push light direction to Debug panel
        const lightDirEl = document.getElementById('debug-light-dir');
        if (lightDirEl) {
            const dir = this.dirLight.direction;
            lightDirEl.textContent = `X: ${dir[0].toFixed(2)}, Y: ${dir[1].toFixed(2)}, Z: ${dir[2].toFixed(2)}`;
        }
    }

    render() {
        const gl = this.gl;

        // Fetch display controls from DOM checkboxes
        const wireframeEl = document.getElementById('toggle-wireframe');
        const drawWireframe = wireframeEl ? wireframeEl.checked : false;
        const drawMode = drawWireframe ? gl.LINES : gl.TRIANGLES;

        const waterAnimEl = document.getElementById('toggle-water');
        const animateWater = waterAnimEl ? waterAnimEl.checked : true;

        // Clear Color and Depth Buffers
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // --- DRAW TERRAIN & PLAYER & RESOURCES (Solid Geometry, BasicShader) ---
        this.basicShader.use();
        
        // Load Camera matrices
        this.basicShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.basicShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.basicShader.setUniform3fv('uViewPosition', this.camera.position);

        // Load Lighting uniforms
        this.basicShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.basicShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.basicShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.basicShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.basicShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);

        // 1. Draw Terrain
        this.terrain.draw(this.basicShader);

        // 2. Draw Player Body (using scaled modelMatrix)
        // Set scale for body: [width, height, depth] -> [0.8, 1.2, 0.8]
        // Offset Y so bottom of body sits at player.position.y
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 0.3, 0.0]); // Body offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.8, 1.2, 0.8]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.bodyMesh.draw(drawMode);

        // 3. Draw Player Head
        // Placed on top of body (height offsets Y)
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.15, 0.0]); // Head offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.55, 0.55, 0.55]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.headMesh.draw(drawMode);

        // 4. Draw Player Visor (helps distinguish forward orientation)
        // Local translation along Z axis forward [0, 1.2, 0.28] relative to player coordinate center
        Mat4.copy(this.tempMatrix, this.player.modelMatrix);
        Mat4.translate(this.tempMatrix, this.tempMatrix, [0.0, 1.2, 0.28]); // Visor offset
        Mat4.scale(this.tempMatrix, this.tempMatrix, [0.4, 0.16, 0.1]);
        this.basicShader.setUniformMatrix4fv('uModelMatrix', this.tempMatrix);
        this.visorMesh.draw(drawMode);

        // 5. Draw World Resources
        this.resourceManager.drawAll(this.basicShader, drawMode);

        // 6. Draw Drifting Debris (on water surface, before water pass)
        this.debrisManager.drawAll(this.basicShader, drawMode);

        // --- DRAW WATER (Translucent Geometry, WaterShader) ---
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Disable backface culling to draw wave interiors correctly
        gl.disable(gl.CULL_FACE);

        this.waterShader.use();

        // Load Camera matrices
        this.waterShader.setUniformMatrix4fv('uViewMatrix', this.camera.viewMatrix);
        this.waterShader.setUniformMatrix4fv('uProjectionMatrix', this.camera.projectionMatrix);
        this.waterShader.setUniform3fv('uViewPosition', this.camera.position);

        // Load Lighting uniforms
        this.waterShader.setUniform3fv('uLightDirection', this.dirLight.direction);
        this.waterShader.setUniform3fv('uLightColor', this.dirLight.color);
        this.waterShader.setUniform1f('uLightIntensity', this.dirLight.intensity);
        this.waterShader.setUniform3fv('uAmbientColor', this.ambientLight.color);
        this.waterShader.setUniform1f('uAmbientIntensity', this.ambientLight.intensity);

        // Load Time & Animation Control Uniforms
        this.waterShader.setUniform1f('uTime', this.time);
        this.waterShader.setUniform1f('uWaveEnable', animateWater ? 1.0 : 0.0);

        // Draw Water Grid
        this.water.draw(this.waterShader);

        // Restore default WebGL drawing state
        gl.enable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
    }

    /**
     * Update the Resource HUD UI when inventory changes
     * @param {string} resourceId
     * @param {number} newCount
     */
    _updateResourceHUD(resourceId, newCount) {
        const countEl = document.getElementById(`count-${resourceId}`);
        if (countEl) {
            countEl.textContent = newCount;

            // Trigger pulse animation
            countEl.classList.remove('pulse');
            void countEl.offsetWidth; // Force reflow
            countEl.classList.add('pulse');
        }
    }

    destroy() {
        console.log('GameScene: Destroying meshes and shader programs...');
        
        if (this.basicShader) this.basicShader.delete();
        if (this.waterShader) this.waterShader.delete();

        if (this.terrain) this.terrain.delete();
        if (this.water) this.water.delete();

        if (this.bodyMesh) this.bodyMesh.delete();
        if (this.headMesh) this.headMesh.delete();
        if (this.visorMesh) this.visorMesh.delete();

        // Cleanup resource system
        if (this.resourceManager) this.resourceManager.delete();
        if (this.debrisManager) this.debrisManager.delete();
        if (this.inventory) this.inventory.clear();
    }

    /**
     * Helper to output standard 24-vertex cuboid arrays for flat surface normals
     */
    _createCubeData(r, g, b) {
        const positions = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            // Back face
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            // Bottom face
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
            // Right face
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            // Left face
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
            // Front
             0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,
            // Back
             0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,
            // Top
             0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,
            // Bottom
             0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,
            // Right
             1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,  1.0,  0.0,  0.0,
            // Left
            -1.0,  0.0,  0.0, -1.0, -1.0,  0.0, -1.0,  0.0,  0.0, -1.0,  0.0,  0.0,
        ]);

        const colors = new Float32Array(24 * 4);
        for (let i = 0; i < 24; i++) {
            colors[i * 4] = r;
            colors[i * 4 + 1] = g;
            colors[i * 4 + 2] = b;
            colors[i * 4 + 3] = 1.0;
        }

        const texCoords = new Float32Array([
            // Front
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
            // Back
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Top
            0.0, 1.0,  0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
            // Bottom
            1.0, 1.0,  0.0, 1.0,  0.0, 0.0,  1.0, 0.0,
            // Right
            1.0, 0.0,  1.0, 1.0,  0.0, 1.0,  0.0, 0.0,
            // Left
            0.0, 0.0,  1.0, 0.0,  1.0, 1.0,  0.0, 1.0,
        ]);

        const indices = new Uint16Array([
            0, 1, 2,      0, 2, 3,    // Front
            4, 5, 6,      4, 6, 7,    // Back
            8, 9, 10,     8, 10, 11,  // Top
            12, 13, 14,   12, 14, 15, // Bottom
            16, 17, 18,   16, 18, 19, // Right
            20, 21, 22,   20, 22, 23  // Left
        ]);

        return { positions, normals, colors, texCoords, indices };
    }
}
