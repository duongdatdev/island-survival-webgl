/**
 * Ocean Water Shader with procedural vertex waving, flat-shaded normals, and specular highlights
 */

export const WaterShader = {
    vertex: `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
        layout(location = 3) in vec2 aTexCoord;

        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        
        uniform float uTime;
        uniform float uWaveEnable;

        out vec3 vWorldPosition;
        out vec4 vColor;
        out vec2 vTexCoord;

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
            
            if (uWaveEnable > 0.5) {
                // Procedural Sine wave displacement
                float waveSpeed = 1.6;
                float waveFrequency = 0.4;
                float waveAmplitude = 0.12;
                
                // Primary waves traveling diagonally
                float primaryCoord = worldPos.x * waveFrequency + worldPos.z * waveFrequency + uTime * waveSpeed;
                float primaryWave = sin(primaryCoord) * waveAmplitude;
                
                // Secondary cross waves for detailing
                float secondaryCoord = worldPos.z * waveFrequency * 1.5 - uTime * waveSpeed * 0.8;
                float secondaryWave = cos(secondaryCoord) * waveAmplitude * 0.4;
                
                worldPos.y += primaryWave + secondaryWave;
            }
            
            vWorldPosition = worldPos.xyz;
            vColor = aColor;
            vTexCoord = aTexCoord;
            
            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec3 vWorldPosition;
        in vec4 vColor;
        in vec2 vTexCoord;

        // Lighting Uniforms
        uniform vec3 uLightDirection; // Vector pointing TOWARDS the sun
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        // Camera / Time Uniforms
        uniform vec3 uViewPosition;
        uniform float uTime;

        out vec4 fragColor;

        void main() {
            // Compute face normals dynamically on screen derivatives for that low-poly/faceted aesthetic
            vec3 dx = dFdx(vWorldPosition);
            vec3 dy = dFdy(vWorldPosition);
            vec3 N = normalize(cross(dx, dy));
            
            // Keep normal pointing upwards
            if (N.y < 0.0) {
                N = -N;
            }
            
            vec3 L = normalize(uLightDirection);
            
            // 1. Ambient lighting term
            vec3 ambient = uAmbientColor * uAmbientIntensity;
            
            // 2. Diffuse lighting term
            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * uLightColor * uLightIntensity;
            
            // 3. Specular lighting term (Blinn-Phong)
            vec3 V = normalize(uViewPosition - vWorldPosition);
            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 128.0); // Extremely tight high specular highlights
            vec3 specular = spec * uLightColor * uLightIntensity * 0.75;
            
            // Procedural foam effect based on sine heights
            vec3 baseColor = vColor.rgb;
            
            // Foam foam bands
            float heightPattern = fract(vWorldPosition.y * 8.0 + uTime * 0.2);
            if (heightPattern > 0.95) {
                baseColor = mix(baseColor, vec3(0.7, 0.9, 1.0), 0.4); // Highlight wave crests
            }
            
            // Combine colors
            vec3 finalColor = (ambient + diffuse) * baseColor + specular;
            
            // Output slightly transparent water (0.85 opacity)
            fragColor = vec4(finalColor, 0.85);
        }
    `
};
