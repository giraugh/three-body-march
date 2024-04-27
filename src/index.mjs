import { vec3 } from 'gl-matrix'

import FRAG_SHADER_SOURCE from './march.frag.glsl?raw'
import VERT_SHADER_SOURCE from './march.vert.glsl?raw'

// Prep canvas element
const canvasEl = document.querySelector('canvas');
canvasEl.width = 1000;
canvasEl.height = 1000;

// Global bodies state
let time = 0;
const bodies = Array.from({ length: 5 }, (_, i) => ({
    position: vec3.fromValues(i * 1.5 - 3, 1, 13 + i * .1),
    radius: .4 + i * 0.1,
}))

/** Start webgl program */
function main() {
    // get webgl context
    const gl = canvasEl.getContext('webgl2');
    if (!gl) return;

    // Enable extensions
    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) throw new Error("Couldnt load float texture ext")

    // Load shaders and prepare attribute/uniform locs
    const program = loadProgram(gl);
    const programInfo = {
        program,
        attribLocations: {
            position: gl.getAttribLocation(program, 'aPosition'),
        },
        uniformLocations: {
            resolution: gl.getUniformLocation(program, 'uResolution'),
            bodies: gl.getUniformLocation(program, 'uBodies'),
        },
    };

    // Prepare data
    const sceneData = initSceneData(gl);

    // Start main loop
    loop(gl, sceneData, programInfo);
}

function loop(gl, sceneData, programInfo) {
    // Update body positions
    time += 1;
    for (let body of bodies) {
        body.position[1] = 3 + Math.sin(time * 0.02 + body.position[0] / 2) * 1
        body.position[2] = 10 + Math.cos(time * 0.02 + body.position[0] / 2) * 1
    }

    // Update bodies texture
    updateBodyPosTexture(gl, sceneData.textures.bodyPosition)

    // Draw frame
    draw(gl, sceneData, programInfo);

    // Repeat on next animation frame
    requestAnimationFrame(loop.bind(this, gl, sceneData, programInfo))
}

/**
 * Draw the scene to the canvas
 * @param {WebGLRenderingContext} gl
 * @param {ReturnType<typeof initSceneData>} sceneData
 */
function draw(gl, sceneData, programInfo) {
    // Clear canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Set geometry buffer attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, sceneData.buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);

    // Enable program
    gl.useProgram(programInfo.program);

    // Activate and set uniform for bodies texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneData.textures.bodyPosition);
    gl.uniform1i(programInfo.uniformLocations.bodies, 0);

    // Set canvas uniforms
    gl.uniform3f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height, 0);

    // Draw scene
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

/**
 * @param {WebGLRenderingContext} gl
 */
function initSceneData(gl) {
    return {
        buffers: {
            position: initPositionBuffer(gl), // Vertex positions
        },
        textures: {
            bodyPosition: initBodyPosTexture(gl), // Body positions
        }
    };
}

/**
 * @param {WebGLRenderingContext} gl
 */
function initBodyPosTexture(gl) {
    // Create texture
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

    // Populate texture with data
    updateBodyPosTexture(gl, texture, [])

    // Set filtering
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {ReturnType<typeof WebGLRenderingContext.createTexture>} texture
 */
function updateBodyPosTexture(gl, texture) {
    // Create texture row for each body
    let pixels = []
    for (let body of bodies) {
        pixels = pixels.concat([
            body.position[0],
            body.position[1],
            body.position[2],
            body.radius,
        ])
    }

    // Each set of 4 bytes is one pixel in the row
    // for that body
    const height = bodies.length;
    const width = pixels.length / height / 4;
    assert(width === Math.floor(width), "Expected width to be an integer value")
    assert(height > 0, "Need at least one body")

    // Set texture data
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        width,
        height,
        0, // no border
        gl.RGBA,
        gl.FLOAT,
        new Float32Array(pixels),
    );
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

/** Throw an error if the condition is false 
 * @param {boolean} condition
 * @param {string} message
 * */
function assert(condition, message) {
    if (!condition) {
        throw new Error("Assertion error: " + message)
    }
}

main();
