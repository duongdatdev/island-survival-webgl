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
        uniform float uWaveAmplitude;
        uniform float uWaveSpeed;
        uniform float uWaveAttenStart;
        uniform float uWaveAttenEnd;

        out vec3 vWorldPosition;
        out vec4 vColor;
        out vec2 vTexCoord;

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);

            if (uWaveEnable > 0.5) {
                float frequency = 0.4;
                float amplitude = 0.12 * uWaveAmplitude;
                float speed = 1.6 * uWaveSpeed;

                float dist = length(worldPos.xz);
                float attenuation = clamp((dist - uWaveAttenStart) / (uWaveAttenEnd - uWaveAttenStart), 0.0, 1.0);
                amplitude *= attenuation;

                float primaryCoord = worldPos.x * frequency + worldPos.z * frequency + uTime * speed;
                float primaryWave = sin(primaryCoord) * amplitude;

                float secondaryCoord = worldPos.z * frequency * 1.5 - uTime * speed * 0.8;
                float secondaryWave = cos(secondaryCoord) * amplitude * 0.4;

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

        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        uniform vec3 uViewPosition;
        uniform float uTime;
        uniform float uLightningFlash;

        out vec4 fragColor;

        void main() {
            vec3 dx = dFdx(vWorldPosition);
            vec3 dy = dFdy(vWorldPosition);
            vec3 N = normalize(cross(dx, dy));

            if (N.y < 0.0) {
                N = -N;
            }

            vec3 L = normalize(uLightDirection);

            vec3 ambient = uAmbientColor * uAmbientIntensity;

            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * uLightColor * uLightIntensity;

            vec3 V = normalize(uViewPosition - vWorldPosition);
            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 128.0);
            vec3 specular = spec * uLightColor * uLightIntensity * 0.75;

            vec3 baseColor = vColor.rgb;

            float heightPattern = fract(vWorldPosition.y * 8.0 + uTime * 0.2);
            if (heightPattern > 0.95) {
                baseColor = mix(baseColor, vec3(0.7, 0.9, 1.0), 0.4);
            }

            vec3 finalColor = (ambient + diffuse) * baseColor + specular;

            finalColor += uLightningFlash * vec3(0.8, 0.9, 1.0) * 0.5;

            fragColor = vec4(finalColor, 0.85);
        }
    `
};
