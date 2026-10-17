import { test, expect } from '@playwright/test';

test('post processing creates sampleable depth targets and releases WebGL resources', async ({ page }) => {
    await page.goto('/tests/browser/graphics-post-fixture.html');
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            result = await page.evaluate(async () => {
        const { PostProcessing } = await import('/src/renderer/PostProcessing.js');
        const { Texture } = await import('/src/renderer/Texture.js');
        const { ShaderProgram } = await import('/src/renderer/ShaderProgram.js');
        const { SkyShader } = await import('/src/shaders/SkyShader.js');
        const { ParticleShader } = await import('/src/shaders/ParticleShader.js');
        const { UnlitShader } = await import('/src/shaders/UnlitShader.js');
        const { ParticleSystem } = await import('/src/systems/ParticleSystem.js');
        const { RainSystem } = await import('/src/systems/RainSystem.js');
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) throw new Error('WebGL2 is required for the renderer');
        const nativeGetExtension = gl.getExtension.bind(gl);
        gl.getExtension = name => name === 'EXT_color_buffer_float' ? null : nativeGetExtension(name);
        const post = new PostProcessing(gl);
        post.resize(64, 48);
        const baseColor = new Texture(gl);
        const dataMap = new Texture(gl, { colorSpace: 'linear' });
        const skyShader = new ShaderProgram(gl, SkyShader.vertex, SkyShader.fragment);
        const particleShader = new ShaderProgram(gl, ParticleShader.vertex, ParticleShader.fragment);
        const unlitShader = new ShaderProgram(gl, UnlitShader.vertex, UnlitShader.fragment);
        const particles = new ParticleSystem(gl, 4);
        const rain = new RainSystem(gl, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, post._sceneFbo);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        const depthObjectType = gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE
        );
        const hasDepthTexture = depthObjectType === gl.TEXTURE;
        const sceneColor = post._sceneColor;
        const sceneDepth = post._sceneDepth;
        const sceneFbo = post._sceneFbo;
        post.composite({ bloom: false, fxaa: true, underwater: true, ambientOcclusion: true });
        const error = gl.getError();
        post.delete();
        baseColor.delete();
        dataMap.delete();
        skyShader.delete();
        particleShader.delete();
        unlitShader.delete();
        particles.delete();
        rain.delete();
        return {
            available: post.available,
            rgba8Fallback: !post._useFloat,
            complete: status === gl.FRAMEBUFFER_COMPLETE,
            hasDepthTexture,
            srgbTextureFormat: baseColor.internalFormat === gl.SRGB8_ALPHA8,
            linearTextureFormat: dataMap.internalFormat === gl.RGBA8,
            error,
            colorDeleted: !gl.isTexture(sceneColor),
            depthDeleted: !gl.isTexture(sceneDepth),
            framebufferDeleted: !gl.isFramebuffer(sceneFbo),
        };
            });
            break;
        } catch (error) {
            if (!String(error.message).includes('Execution context was destroyed') || attempt === 2) throw error;
            await page.goto('/tests/browser/graphics-post-fixture.html');
        }
    }
    expect(result).toEqual({
        available: true,
        rgba8Fallback: true,
        complete: true,
        hasDepthTexture: true,
        srgbTextureFormat: true,
        linearTextureFormat: true,
        error: 0,
        colorDeleted: true,
        depthDeleted: true,
        framebufferDeleted: true,
    });
});
