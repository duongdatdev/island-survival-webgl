export class Texture {
    constructor(gl, options = {}) {
        this.gl = gl;
        this.texture = gl.createTexture();
        this.width = 1;
        this.height = 1;

        this.wrapS = options.wrapS || gl.REPEAT;
        this.wrapT = options.wrapT || gl.REPEAT;
        this.minFilter = options.minFilter || gl.LINEAR_MIPMAP_LINEAR;
        this.magFilter = options.magFilter || gl.LINEAR;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        const placeholderColor = options.placeholderColor || new Uint8Array([140, 140, 140, 255]);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 
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
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        if (this._isPowerOfTwo(this.width) && this._isPowerOfTwo(this.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.minFilter);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.magFilter);
        
        if (this._isPowerOfTwo(this.width) && this._isPowerOfTwo(this.height)) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.wrapT);
        }

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

    _isPowerOfTwo(value) {
        return (value & (value - 1)) === 0;
    }
}
