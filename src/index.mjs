import FRAG_SHADER_SOURCE from './march.frag.glsl?raw'
import VERT_SHADER_SOURCE from './march.vert.glsl?raw'

// Prep canvas element
const canvasEl = document.querySelector('canvas');
canvasEl.width = 1000;
canvasEl.height = 1000;

/** Start webgl program */
function main() {
    // get webgl context
    const gl = canvasEl.getContext('webgl2');
    if (!gl) return;

    const program = loadProgram(gl);
    const programInfo = {
        program,
        attribLocations: {
            position: gl.getAttribLocation(program, 'aPosition'),
        },
        uniformLocations: {
            resolution: gl.getUniformLocation(program, 'uResolution'),
        },
    };
    const buffers = initBuffers(gl);

    draw(gl, buffers, programInfo);
}

/**
 * Draw the scene to the canvas
 * @param {WebGLRenderingContext} gl
 * @param {ReturnType<typeof initBuffers>} buffers
 */
function draw(gl, buffers, programInfo) {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    setPositionAttr(gl, buffers, programInfo);

    gl.useProgram(programInfo.program);

    gl.uniform3f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * @param {WebGLRenderingContext} gl
 */
function initBuffers(gl) {
    return {
        position: initPositionBuffer(gl), // Vertex positions
    };
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {ReturnType<typeof initBuffers>} buffers
 */
function setPositionAttr(gl, buffers, programInfo) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
}

/**
 * @param {WebGLRenderingContext} gl
 */
function initPositionBuffer(gl) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const positions = [-1, -1, -1, 1, 1, 1, 1, 1, 1, -1, -1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return buffer;
}

/**
 * @param {WebGLRenderingContext} gl
 */
function loadProgram(gl) {
    const vertShader = loadShader(gl, gl.VERTEX_SHADER, VERT_SHADER_SOURCE);
    const fragShader = loadShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER_SOURCE);
    const program = gl.createProgram();

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('failed to link', gl.getProgramInfoLog(program));
    }

    return program;
}

/**
 * @param {WebGLRenderingContext} gl
 */
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`failed to compile: ${gl.getShaderInfoLog(shader)}`);
    }

    return shader;
}

main();
