/**
 * Basic Diffuse + Blinn-Phong Specular Shader source for WebGL 2 (GLSL 3.00 es)
 */

export const BasicShader = {
    vertex: `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
        layout(location = 3) in vec2 aTexCoord;

        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;

        out vec3 vWorldPosition;
        out vec3 vNormal;
        out vec4 vColor;
        out vec2 vTexCoord;

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
            vWorldPosition = worldPos.xyz;
            
            // Transform normals using inverse transpose of model matrix (correct for non-uniform scaling)
            vNormal = transpose(inverse(mat3(uModelMatrix))) * aNormal;
            
            vColor = aColor;
            vTexCoord = aTexCoord;
            
            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec3 vWorldPosition;
        in vec3 vNormal;
        in vec4 vColor;
        in vec2 vTexCoord;

        // Lighting Uniforms
        uniform vec3 uLightDirection; // Vector pointing TOWARDS the sun
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        // Local campfire point light. Range-limited attenuation keeps the glow
        // concentrated around the fire instead of brightening the whole island.
        uniform vec3 uPointLightPosition;
        uniform vec3 uPointLightColor;
        uniform float uPointLightIntensity;
        uniform float uPointLightRange;

        // Optional glTF base-color texture. Procedural meshes leave this off
        // and continue using vertex colors only.
        uniform sampler2D uBaseColorTexture;
        uniform int uUseBaseColorTexture;

        // Used only while drawing the local first-person character. It removes
        // the head above the neck so the camera can sit at eye level.
        uniform float uFirstPersonHeadCutoff;

        // Camera Uniforms
        uniform vec3 uViewPosition;

        out vec4 fragColor;

        void main() {
            if (vWorldPosition.y > uFirstPersonHeadCutoff) discard;

            // Re-normalize normal interpolated across polygon face
            vec3 N = normalize(vNormal);
            vec3 L = normalize(uLightDirection);
            
            // 1. Ambient lighting term
            vec3 ambient = uAmbientColor * uAmbientIntensity;
            
            // 2. Diffuse lighting term (Lambertian reflection)
            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * uLightColor * uLightIntensity;
            
            // 3. Specular lighting term (Blinn-Phong)
            vec3 V = normalize(uViewPosition - vWorldPosition);
            vec3 H = normalize(L + V); // Halfway vector
            float spec = pow(max(dot(N, H), 0.0), 32.0); // Shininess factor
            vec3 specular = spec * uLightColor * uLightIntensity * 0.25; // 0.25 specular factor

            // Range-limited point light following the standard WebGL lighting
            // model: direction comes from fragment → light, then its strength
            // falls off smoothly with distance. A small fill term lets the
            // orange glow wrap naturally around low-poly surfaces.
            vec3 toPointLight = uPointLightPosition - vWorldPosition;
            float pointDistance = length(toPointLight);
            vec3 pointDirection = toPointLight / max(pointDistance, 0.0001);
            float pointDiffuse = max(dot(N, pointDirection), 0.0);
            float pointFalloff = max(1.0 - pointDistance / max(uPointLightRange, 0.0001), 0.0);
            pointFalloff *= pointFalloff;
            vec3 pointLight = uPointLightColor
                * uPointLightIntensity
                * pointFalloff
                * (0.16 + pointDiffuse * 0.84);
            
            vec4 surfaceColor = vColor;
            if (uUseBaseColorTexture == 1) {
                surfaceColor *= texture(uBaseColorTexture, vTexCoord);
            }

            // Combine lighting contributions with vertex/material colors and texture
            vec3 finalColor = (ambient + diffuse + specular + pointLight) * surfaceColor.rgb;
            
            fragColor = vec4(finalColor, surfaceColor.a);
        }
    `
};
