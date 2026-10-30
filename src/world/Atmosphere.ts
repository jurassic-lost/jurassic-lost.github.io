import * as THREE from 'three';

/**
 * Niebla atmosférica: además de la niebla por distancia, añade una bruma baja
 * que se acumula en los valles y junto al suelo y se aclara en las alturas.
 * Se modifica el código común de niebla de Three.js, así que afecta a todos los
 * materiales con niebla sin coste extra de dibujado. Debe importarse antes de
 * compilar los materiales.
 */
let patched = false;
export function patchAtmosphere() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRel;
#endif`;
  // Posición relativa a la cámara en el espacio del mundo (sin invertir matrices).
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRel = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRel;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float fogDist = length( vFogRel );
    float fogY = cameraPosition.y + vFogRel.y;
    // Bruma baja: más densa cerca del suelo (y = 0 es el nivel del río).
    float hDen = ( 2.2 / fogFar ) * exp( - max( fogY - 1.0, 0.0 ) * 0.075 );
    fogFactor = max( fogFactor, ( 1.0 - exp( - fogDist * hDen ) ) * 0.5 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
