
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

        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;

        uniform vec3 uPointLightPosition;
        uniform vec3 uPointLightColor;
        uniform float uPointLightIntensity;
        uniform float uPointLightRange;

        uniform sampler2D uBaseColorTexture;
        uniform int uUseBaseColorTexture;

        uniform float uFirstPersonHeadCutoff;

        uniform vec3 uViewPosition;

        out vec4 fragColor;

        void main() {
            if (vWorldPosition.y > uFirstPersonHeadCutoff) discard;

            vec3 N = normalize(vNormal);
            vec3 L = normalize(uLightDirection);
            
            vec3 ambient = uAmbientColor * uAmbientIntensity;
            
            float diff = max(dot(N, L), 0.0);
            vec3 diffuse = diff * uLightColor * uLightIntensity;
            
            vec3 V = normalize(uViewPosition - vWorldPosition);
            vec3 H = normalize(L + V);
            float spec = pow(max(dot(N, H), 0.0), 32.0);
            vec3 specular = spec * uLightColor * uLightIntensity * 0.25;

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

            vec3 finalColor = (ambient + diffuse + specular + pointLight) * surfaceColor.rgb;
            
            fragColor = vec4(finalColor, surfaceColor.a);
        }
    `
};
