export class Texture {
    constructor(gl, options = {}) {
        this.gl = gl;
        this.wrapS = options.wrapS || gl.REPEAT;
        this.wrapT = options.wrapT || gl.REPEAT;
        this.minFilter = options.minFilter || gl.LINEAR_MIPMAP_LINEAR;
        this.magFilter = options.magFilter || gl.LINEAR;
        this.colorSpace = options.colorSpace || 'srgb';
        if (this.colorSpace !== 'srgb' && this.colorSpace !== 'linear') {
            throw new Error(`Unsupported texture colorSpace '${this.colorSpace}'. Use 'srgb' or 'linear'.`);
        }
        this.internalFormat = this.colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA8;
        this.texture = gl.createTexture();
        this.width = 1;
        this.height = 1;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        const placeholderColor = options.placeholderColor || new Uint8Array([140, 140, 140, 255]);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, this.internalFormat,
            1, 1, 0, gl.RGBA, 
            gl.UNSIGNED_BYTE, placeholderColor
        );

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    setImage(image) {
        const gl = this.gl;
        this.width = image.width;
        this.height = image.height;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, image);

        // WebGL 2 supports repeating and mipmaps for non-power-of-two images.
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.minFilter);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.magFilter);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.wrapT);

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    bind(unit = 0) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    unbind() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    delete() {
        if (this.texture) {
            this.gl.deleteTexture(this.texture);
            this.texture = null;
        }
    }

}
