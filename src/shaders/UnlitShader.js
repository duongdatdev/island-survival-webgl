export const UnlitShader = {
    vertex: `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec3 aNormal;
        layout(location = 2) in vec4 aColor;
        layout(location = 3) in vec2 aTexCoord;

        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;

        out vec4 vColor;
        out vec2 vTexCoord;

        void main() {
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
            vColor = aColor;
            vTexCoord = aTexCoord;
            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec4 vColor;
        in vec2 vTexCoord;

        out vec4 fragColor;

        void main() {
            fragColor = vColor;
        }
    `
};
