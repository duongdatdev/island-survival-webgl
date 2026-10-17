/** Authored palette colors are sRGB; lighting/render targets use linear RGB. */
export const ColorSpaceGLSL = `
    uniform int uOutputLinear;
    vec3 srgbToLinear(vec3 color) {
        color = max(color, vec3(0.0));
        return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), color));
    }
    vec3 linearToSrgb(vec3 color) {
        color = max(color, vec3(0.0));
        return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
    }
    vec3 sceneOutput(vec3 linearColor) {
        return uOutputLinear == 1 ? linearColor : linearToSrgb(linearColor);
    }
`;
