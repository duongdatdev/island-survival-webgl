export const ParticleShader = {
    vertex: `#version 300 es
        precision highp float;

        in vec3 aPosition;
        in vec4 aColor;
        in float aSize;

        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform float uViewportHeight;

        out vec4 vColor;

        void main() {
            vec4 viewPos = uViewMatrix * vec4(aPosition, 1.0);
            gl_Position = uProjectionMatrix * viewPos;

            float dist = length(viewPos.xyz);
            gl_PointSize = aSize * (uViewportHeight * 0.5) / max(dist, 1.0);
            gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);

            vColor = aColor;
        }
    `,

    fragment: `#version 300 es
        precision highp float;

        in vec4 vColor;
        out vec4 fragColor;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
            fragColor = vec4(vColor.rgb, vColor.a * alpha);
        }
    `
};
