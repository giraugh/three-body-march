/*
 * -- TO FIX -- 
 *
 * Currently the collision feels "sticky"
 * I think its because the bodies get clipped into each
 * other. So even if they want to move off in a different direction,
 * they are stuck together and dont get to move
 *
 */


import { vec3 } from 'gl-matrix'

import FRAG_SHADER_SOURCE from './march.frag.glsl?raw'
import VERT_SHADER_SOURCE from './march.vert.glsl?raw'

const TIMESTEP = .2;
const GRAVITY = 1;
const BODY_DENSITY = 1;
const BODY_AMT = 10;

// Prep canvas element
const canvasEl = document.querySelector('canvas');
canvasEl.width = 1000;
canvasEl.height = 1000;

function rnd(a) {
    return (Math.random() - 0.5) * 2 * a
}

// Global bodies state
const bodies = Array.from({ length: BODY_AMT }, (_, i) => ({
    position: vec3.fromValues(rnd(5), rnd(5), 40 + rnd(15)),
    velocity: vec3.fromValues(rnd(1), rnd(1), rnd(1)),
    radius: .3 + Math.random() * 2,
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
    // Gravitational attraction
    for (let body of bodies) {
        for (let otherBody of bodies) {
            if (otherBody !== body) {
                const diffV = vec3.create(),
                    dirV = vec3.create(),
                    accelV = vec3.create();

                vec3.sub(diffV, otherBody.position, body.position);
                vec3.normalize(dirV, diffV);

                const distanceSquared = vec3.squaredLength(diffV);
                const mass = body.radius * BODY_DENSITY;
                const otherMass = otherBody.radius * BODY_DENSITY;
                const force = (GRAVITY * otherMass * mass) / distanceSquared;
                const acceleration = force / mass;

                vec3.scale(accelV, dirV, acceleration * TIMESTEP)
                vec3.add(body.velocity, body.velocity, accelV);
            }
        }
    }

    // Euler integrate and save next positions
    // well use them once collision resolution is done
    let nextPositions = bodies.map(body => {
        const nextPosV = vec3.create()
        const toAddV = vec3.clone(body.velocity);
        vec3.scale(toAddV, toAddV, TIMESTEP)
        vec3.add(nextPosV, body.position, toAddV);
        return nextPosV
    })

    // Collision resolution
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
            const otherBody = bodies[j];
            const usToThemV = vec3.create(), themToUsV = vec3.create();
            vec3.sub(usToThemV, otherBody.position, body.position);
            vec3.sub(themToUsV, body.position, otherBody.position);

            let collTime = simpleSweep(body, otherBody)

            if (collTime !== null && collTime >= 0 && collTime <= 1) {
                // Update positions to prevent clipping
                const ourVecToAdd = vec3.clone(body.velocity), theirVecToAdd = vec3.create(otherBody.velocity);
                vec3.scale(ourVecToAdd, ourVecToAdd, TIMESTEP * collTime);
                vec3.scale(theirVecToAdd, theirVecToAdd, TIMESTEP * collTime);
                vec3.add(nextPositions[i], body.position, ourVecToAdd);
                vec3.add(nextPositions[j], otherBody.position, theirVecToAdd);

                // TODO: do we need to do a corrective movement to fix collisions?
                // i.e actively seperate clipping bodies

                // Update forces accordingly
                resolveCollision(body, otherBody)
            }
        }
    }

    // Update positions using previously integrated positions
    for (let i = 0; i < bodies.length; i++) {
        bodies[i].position = nextPositions[i]
    }

    // // Fix clipping?
    // for (let i = 0; i < bodies.length; i++) {
    //     const body = bodies[i];
    //     for (let j = i + 1; j < bodies.length; j++) {
    //         const otherBody = bodies[j];
    //         const distance = vec3.distance(body.position, otherBody.position)
    //         const r = body.radius + otherBody.radius
    //         const clipDist = r - distance;
    //         if (clipDist > 0) {
    //             const usToThemV = vec3.create(), themToUsV = vec3.create(), ourFixV = vec3.create(), theirFixV = vec3.create();
    //             vec3.sub(usToThemV, otherBody.position, body.position);
    //             vec3.sub(themToUsV, body.position, otherBody.position);
    //             vec3.normalize(ourFixV, themToUsV)
    //             vec3.normalize(theirFixV, usToThemV)
    //             vec3.scale(ourFixV, ourFixV, clipDist)
    //             vec3.scale(theirFixV, theirFixV, clipDist)
    //             vec3.add(body.position, body.position, ourFixV)
    //             vec3.add(otherBody.position, otherBody.position, theirFixV)
    //             console.log('applied')
    //         }
    //     }
    // }

    // Update bodies texture
    updateBodyPosTexture(gl, sceneData.textures.bodyPosition)

    // Draw frame
    draw(gl, sceneData, programInfo);

    // Repeat on next animation frame
    requestAnimationFrame(loop.bind(this, gl, sceneData, programInfo))
}

function simpleSweep(body, otherBody) {
    const diffV = vec3.create(), relV = vec3.create();
    const velA = vec3.clone(body.velocity), velB = vec3.clone(otherBody.velocity);
    vec3.scale(velA, velA, TIMESTEP)
    vec3.scale(velB, velB, TIMESTEP)

    vec3.sub(diffV, body.position, otherBody.position);
    vec3.sub(relV, body.velocity, otherBody.velocity);

    const r = body.radius + otherBody.radius;
    const a = vec3.dot(relV, relV)
    const b = vec3.dot(relV, diffV)
    const c = vec3.dot(diffV, diffV) - r * r;
    const d = b * b - a * c;

    if (b >= 0) return null
    if (c < 0) return 0
    if (d < 0) return null
    return (-b - Math.sqrt(d)) / a
}

function resolveCollision(body, otherBody) {
    // compute basis for collision
    const basisV = vec3.create();
    vec3.sub(basisV, body.position, otherBody.position);
    vec3.normalize(basisV, basisV);

    // Get each component of velocity for us
    const ourXV = vec3.create(), ourYV = vec3.create();
    const ourX = vec3.dot(basisV, body.velocity);
    vec3.scale(ourXV, basisV, ourX);
    vec3.sub(ourYV, body.velocity, ourXV);

    // Get each component of velocity for them
    const theirXV = vec3.create(), theirYV = vec3.create();
    const theirX = vec3.dot(basisV, otherBody.velocity);
    vec3.scale(theirXV, basisV, theirX);
    vec3.sub(theirYV, otherBody.velocity, theirXV);

    // vel_1 = [vel_1x * (m1 - m2)/(m1 + m2)] + [vel_2x * (2 * m2)/(m1 + m2)] + vel_1y
    // vel_2 = [vel_2x * (m2 - m1)/(m1 + m2)] [vel_1x * (2 * m1)/(m1 + 2m)] + vel_2y
    const m1 = body.radius * BODY_DENSITY;
    const m2 = otherBody.radius * BODY_DENSITY;

    const ourNewVelV = vec3.create(), ourVelAdd1 = vec3.clone(ourXV), ourVelAdd2 = vec3.clone(theirXV);
    vec3.scale(ourVelAdd1, ourVelAdd1, (m1 - m2) / (m1 + m2));
    vec3.scale(ourVelAdd2, ourVelAdd1, (2 * m2) / (m1 + m2));
    vec3.add(ourNewVelV, ourNewVelV, ourYV);
    vec3.add(ourNewVelV, ourNewVelV, ourVelAdd1);
    vec3.add(ourNewVelV, ourNewVelV, ourVelAdd2);

    const theirNewVelV = vec3.create(), theirVelAdd1 = vec3.clone(theirXV), theirVelAdd2 = vec3.clone(ourXV);
    vec3.scale(theirVelAdd1, theirVelAdd1, (m2 - m1) / (m1 + m2));
    vec3.scale(theirVelAdd2, theirVelAdd1, (2 * m1) / (m1 + m2));
    vec3.add(theirNewVelV, theirNewVelV, theirYV);
    vec3.add(theirNewVelV, theirNewVelV, theirVelAdd1);
    vec3.add(theirNewVelV, theirNewVelV, theirVelAdd2);

    body.velocity = ourNewVelV;
    otherBody.velocity = theirNewVelV;
}

/** Solve a quadratic with the provided cooeficients
 * @note returns null if solutions are complex 
 * @param {number} a 
 * @param {number} b
 * @param {number} c
 * @returns {[number, number] | null}
 **/
function solveQuadratic(a, b, c) {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null

    const dsq = Math.sqrt(discriminant)
    const d = 1 / (2 * a);
    const r1 = (-b + dsq) * d;
    const r2 = (-b - dsq) * d;
    return [r1, r2];
}

/** Project u onto v */
function projectVecs(u, v) {
    const r = vec3.create();
    vec3.scale(r, v, vec3.dot(u, v) / vec3.dot(v, v));
    return r;
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
