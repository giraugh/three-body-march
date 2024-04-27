#version 300 es

precision highp float;

uniform vec3 uResolution;
uniform sampler2D uBodies; // each row is x,y,z coords of a body

out vec4 fragColor;

#define MAX_STEPS 100
#define MAX_DIST 1000.
#define SURF_DIST 0.01
#define AMBIENT_LIGHT 0.3
#define SUN_STRENGTH 1.
#define FOG_DENSITY .03
#define FOG_COL vec3(.45, .55, .65)
#define SKY_COL vec3(.9,.9,.9)
#define SUN_COL vec3(1.0,1.0,1.0)

mat2 Rot(float a) {
	float s = sin(a);
	float c = cos(a);
	return mat2(
    	c, -s, s, c
    );
}

float DBox(vec3 p, vec3 o, vec3 r) {
 	return length(max(abs(p - o) - r, 0.));   
}

// Return the distance to the nearest point in the scene
// from (point)
float GetDist(vec3 point) {
    float planeD = point.y;
    float sphereD = length(point - vec3(0, 1, 6)) - 1.;
    
    return sphereD; //min(planeD, sphereD);

}

// March a ray forwards into the scene determined by (GetDist)
// Returns the distance the ray travelled before getting
// below (SURF_DIST) distance from a surface or too far away 
float RayMarch(vec3 rayOrigin, vec3 rayDirection) {
    float d = 0.;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = rayOrigin + rayDirection * d;
        float d_delta = GetDist(p);
        d += d_delta;
        if (d > MAX_DIST || abs(d_delta) < SURF_DIST) break; 
    }
    return d;
}

// Calculate the surface normal at (point)
// can reduce (off) to improve accuracy
vec3 GetNormal(vec3 point) {
    float d = GetDist(point);
    float off = .01;
    vec3 n = vec3(
    	d - GetDist(point - vec3(off,0,0)),
        d - GetDist(point - vec3(0,off,0)),
        d - GetDist(point - vec3(0,0,off))
    );
    return normalize(n);
}


// Get how lit (not in shadow) the given point is. (With Penumbra)
float GetShadowSoft(vec3 ro, vec3 rd, float dmin, float dmax, float k) {
    float res = 1.;
    for (float d = dmin; d < dmax; ) {
        float sceneDist = GetDist(ro + rd * d);
        if (sceneDist < SURF_DIST) return AMBIENT_LIGHT;
        d += sceneDist;
        res = min(res, k * sceneDist / d);
    }
    return min(1., res + AMBIENT_LIGHT);
}

// Get how lit (not in shadow) the given point is.
float GetShadow(vec3 ro, vec3 rd, float dmin, float dmax) {
    for (float d = dmin; d < dmax; ) {
        float sceneDist = GetDist(ro + rd * d);
        if (sceneDist < SURF_DIST) return 0.0;
        d += sceneDist;
    }
    return 1.;
}

// Determine degree of lighting (0 to 1) at (pos) by (lightPos)
float GetLightingPoint(vec3 point, vec3 lightPos) {
    vec3 l = normalize(lightPos - point);
    vec3 n = GetNormal(point);
    float diff = clamp(dot(l, n), 0., 1.);
    
    float shadow = GetShadowSoft(point, l, SURF_DIST * 30., length(lightPos - point), 25.);
    
    return diff * shadow;
}


float GetLightingSun(vec3 point, vec3 sunDir) {
    vec3 n = GetNormal(point);
    float diff = clamp(dot(sunDir, n), 0., 1.);
    float shadow = GetShadowSoft(point, sunDir, SURF_DIST * 30., MAX_DIST, 25.);
    return diff * shadow;
}

vec3 GetFog(vec3 col, float dist) {
    float fogAmount = 1. - exp(-dist * FOG_DENSITY);
    return mix(col, FOG_COL, fogAmount);
}

vec3 GetFogSky(vec3 col, float dist, vec3 rayDir, vec3 sunDir) {
    float fogAmount = 1. - exp(-dist * FOG_DENSITY);
    float sunAmount = .5 * max(0., dot(rayDir, sunDir));
    vec3 fogCol = mix(SKY_COL, SUN_COL, pow(sunAmount, 1.));
    return mix(col, fogCol, fogAmount);
}

void main() {
    // Normalized pixel coordinates (square) (from 0 to 1)
    vec2 uv = (gl_FragCoord.xy - .5*uResolution.xy)/uResolution.y;

    // Declare camera position in terms of ray origin and direction
    vec3 rayOrigin = vec3(0, 1, 0);
    vec3 rayDirection = normalize(vec3(uv.x, uv.y, 1));
    
    // RayMarch to find point
    float dist = RayMarch(rayOrigin, rayDirection);
    vec3 hitPoint = rayOrigin + dist * rayDirection;
    
    // Det col
    vec3 col = vec3(1);
    
    // Determine lighting
    vec3 sunDir = vec3(-.3, -1, 0.5);
    vec3 lightPos = vec3(0., 4, 2. * 0.);
    float lighting = GetLightingSun(hitPoint, -sunDir);
    col *= lighting;
    
    // Fog
    col = GetFogSky(col, dist, rayDirection, -sunDir);
    
    // Ouput colour at full transparency
    fragColor = vec4(col, 1);
}
