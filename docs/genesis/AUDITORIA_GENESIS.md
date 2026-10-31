# Auditoría Proyecto Génesis — Fase 0

Fecha: 2026-10-31. Rama de trabajo: `feature/urban-dinosaur-invasion`.
Este documento recoge solo hechos comprobados en el repositorio y en ejecuciones reales.

## 1. Estado del repositorio antes de tocar nada

| Punto | Resultado comprobado |
|---|---|
| Rama de partida | `main`, limpio (`git status` vacío), commit `2a4b6b6` |
| Respaldo remoto | rama `respaldo-antes-de-genesis` en GitHub (`git ls-remote` la muestra en `2a4b6b6`) |
| Etiqueta | `respaldo-pre-genesis` creada **solo en local**: el proxy de este entorno corta el envío de etiquetas («unexpected disconnect»). La rama remota cumple la misma función |
| Respaldos anteriores | `respaldo-antes-del-terror`, `respaldo-antes-del-multijugador`, `respaldo-antes-del-volcan` |
| Publicación | GitHub Pages solo se despliega con *push* a `main` (`.github/workflows/pages.yml`). En esta fase no se tocó `main` ni el artefacto de Claude |
| Motor y versiones | Three.js 0.169.0, TypeScript 5.6.3, Vite 5.4.10, PeerJS 1.5.5, Node 22 |
| Compilación base | `npm run build`: correcta, «built in 3.33s» |
| Pruebas base (mismo commit `2a4b6b6`) | perfiles 27/27, historia 24/24, refugio 23/23, combate 11/11, multijugador 31/31, filtro de nombres 0 fallos |
| Fallos previos conocidos | pruebas e2e algo inestables cuando dos navegadores corren a la vez en este servidor (~1–2 fps con swiftshader). Al repetirlas solas, pasan. `e2e-old-save`: 7/8; la comprobación que falta ya no aplica porque la base antigua ya tiene historia |

## 2. Inventario de sistemas (EXISTE / PARCIAL / NO EXISTE)

| Sistema | Estado | Rutas reales |
|---|---|---|
| Bucle de juego, render, posproceso | EXISTE | `src/core/Game.ts`, `src/core/PostFX.ts` |
| Calidad baja/media/alta | EXISTE | `src/core/Settings.ts` (`PRESETS`) |
| Controles teclado/ratón y táctiles | EXISTE | `src/core/Input.ts`, `src/ui/TouchControls.ts` |
| Personaje (niño/niña, apariencia, «Prefiero no decir») | EXISTE | `src/player/CharacterModel.ts`, `src/profile/appearance.ts` |
| Personajes con esqueleto (Mixamo) | PARCIAL | `src/player/RiggedModel.ts`: el cargador existe, pero no hay modelos incluidos |
| Cámara en tercera persona | EXISTE | `src/player/ThirdPersonCamera.ts` |
| Física y colisiones | EXISTE: cilindros + rejilla. **Ampliado** con cajas (paredes) | `src/core/Collision.ts` |
| Perfiles (3), guardado IndexedDB con copia de respaldo | EXISTE | `src/profile/persistence.ts`, `session.ts`, `types.ts` |
| Versión de guardado | EXISTE (`schemaVersion: 1`, `migrateSave` vacío) | `src/profile/persistence.ts` |
| Modos Historia / Mundo abierto (partidas separadas) | EXISTE | `openWorldId` en `persistence.ts` |
| Inventario, crafteo, armas | EXISTE | `src/items/items.ts`, `src/combat/Weapons.ts`, `src/ui/Hotbar.ts` |
| Supervivencia (vida, hambre, sed, energía) | EXISTE | `src/survival/Survival.ts` |
| Día/noche (20 min por día) | EXISTE | `src/world/DayNight.ts`, `src/world/Environment.ts` |
| IA de dinosaurios (estados, percepción, huida, ataque) | EXISTE | `src/creatures/Dinosaur.ts` |
| Movimiento con guion para eventos (`scripted`) | EXISTE | `Dinosaur.scripted()` |
| Línea de vista (no ver a través de muros) | NO EXISTÍA → **creada** para la ciudad | `blockedLine()` en `src/genesis/city.ts` |
| Misiones y objetivos | EXISTE (isla) | `src/core/Objectives.ts` |
| Historia, cinemáticas, mensajes de celular | EXISTE (isla, capítulo 1) | `src/story/Story.ts`, `src/intro/Intro.ts` |
| Habitación gamer 3D | EXISTE como escena de la introducción (no jugable) | `src/intro/Bedroom.ts` |
| Mundo por `worldId` / varias escenas | NO EXISTÍA → **creado** como modo `genesis` con su partida | `src/genesis/*` |
| Ciudad, calles, casas, autos | NO EXISTÍA → **creado** (procedural, original) | `src/genesis/city.ts` |
| NPC humanos | NO EXISTE (solo la persona de la cinemática, sin IA) | — |
| Mapa/minimapa | EXISTE; **ampliado** para usar otro mapa | `src/ui/HUD.ts` (`setMap`) |
| Multijugador (salas de 6) | EXISTE (solo isla) | `src/net/Multiplayer.ts` |
| Audio (muestras + síntesis) | EXISTE; **ampliado** con sirena, choque y modo ciudad | `src/audio/AudioManager.ts` |

## 3. Modelos y texturas que existen (con licencia)

| Recurso | Animación real | Licencia |
|---|---|---|
| `public/models/quaternius/*.glb` (T-rex, Triceratops, Estegosaurio, Apatosaurio, Parasaurolofo, Velocirraptor) | Sí (clips) | CC0, Quaternius |
| `public/models/dinosaurs/*.glb` (Alosaurio, Ceratosaurio, Torvosaurio, Megalosaurio, Compsognathus) | No (sin esqueleto; se animan por piezas) | aportados por Ivan, origen por documentar |
| `public/models/trex/trex.glb` | Sí | aportado por Ivan, **autor pendiente** |
| `public/models/props/*` (roca, árboles) y cielos | — | CC0, Poly Haven / ambientCG |
| `public/models/characters/*_inicial.glb` | No (estáticos, sin uso) | aportados por Ivan |
| Sonidos `src/audio/sounds/*.mp3` | — | licencia de contenido de Pixabay |
| Ciudad (Fase 1) | — | geometría y texturas **originales** generadas por código |

No hay modelos de personas adultas, autos, edificios ni dinosaurios mutantes con licencia en el repositorio.

## 4. Guardados reales

- Se guardan en IndexedDB `jurassic-lost` (almacenes `profiles` y `saves`), con `:current` y `:backup` por partida.
  Si no hay IndexedDB, se usa memoria (`persistence.ts`).
- Claves por perfil: `<id>` (Historia), `<id>~abierto` (Mundo abierto) y, nueva, `<id>~genesis` (Proyecto Génesis).
- Desde este entorno no se puede leer el navegador de Ivan. Sus partidas reales no se tocan: la campaña nueva
  **nunca escribe** en las claves de la isla (comprobado en la prueba de Génesis).

## 5. Propuesta SaveGame v2 (implementada en su parte mínima)

Lo que se hizo, sin migrar ni reescribir ninguna partida antigua:

1. **Campañas en partidas separadas.** `jurassic_island_legacy` sigue en `<id>` y `<id>~abierto`.
   `genesis_city` va en `<id>~genesis`. No hace falta copiar ni convertir nada: las partidas antiguas se leen igual que antes.
2. **Campos nuevos opcionales** en `GameSave` (`src/profile/types.ts`): `campaignId`, `worldId`, `genesis`.
   Si no están, la partida es de la isla. `schemaVersion` sigue en 1, así que una versión anterior del juego también puede abrir estas partidas.
3. **Estado de Génesis validado** (`src/genesis/state.ts`, `sanitizeGenesis`): tiene versión propia (`v: 1`) y rechaza valores raros sin perder los válidos.
4. **Posiciones:** nunca se pasan posiciones de la isla a la ciudad. Génesis usa sus propios puntos seguros
   (cuarto y patio de la casa) y solo restaura la posición guardada si está dentro del sector y libre.
5. **Copia antes de guardar:** se sigue usando el par `:current` / `:backup` que ya existía.
6. **Volver atrás:** basta con no elegir «Proyecto Génesis». Borrar el perfil borra también `<id>~genesis`.

Pendiente para cuando haga falta un v2 real (Fase 2 o 3): `migrateSave` v1→v2 con copia previa y prueba con datos simulados,
inventario «legado» para objetos de la isla que no existan en la ciudad, y reinicio solo de la campaña elegida
(ya corregido: `session.reset()` ahora reinicia la partida del modo activo, no siempre la de Historia).

## 6. Mapa y fuentes geográficas

- La Fase 1 **no usa datos geográficos reales**. Es un barrio ficticio y original (6 cuadras, nombres de calle inventados)
  con aire de ciudad fronteriza del norte de México. No hay datos de Google Maps/Earth.
- Importar OSM (ODbL, con crédito «© OpenStreetMap contributors») o relieve de INEGI queda para la Fase 4.
  Hay que revisar la licencia de cada conjunto y que ninguna casa corresponda a la de un jugador real.

## 7. Riesgos conocidos

- El depredador de la ciudad es un **modelo provisional** (Alosaurio sin esqueleto, animado por piezas).
- La persona que huye usa el modelo del protagonista con otros colores, escalado: **provisional**.
- El servidor de pruebas renderiza a ~2–6 fps (sin GPU). Las cifras de FPS de abajo no representan un celular real.

## 8. Rendimiento medido (sin inventar cifras)

Medido el 2026-10-31 con `requestAnimationFrame` durante 15 s, 1280×720, Chromium sin GPU (ANGLE + SwiftShader, CPU Intel Xeon 2.1 GHz, 4 núcleos).
Este entorno **no representa un celular ni una PC con tarjeta gráfica**; sirve solo para comparar.

| Escena | Calidad | FPS medidos | Llamadas de dibujo | Triángulos |
|---|---|---|---|---|
| Génesis, cuarto (noche) | baja | 2,33 | 143 | 77 786 |
| Génesis, calle (día) | baja | 3,34 | 105 | 69 598 |
| Génesis, cuarto (noche) | media | 0,30 | (no medible: la cifra solo refleja el último pase de posproceso) | — |
| Génesis, calle (día) | media | 0,48 | (igual) | — |

Pendiente: medir en un celular real y en una PC con GPU (lo puede hacer Ivan activando «Mostrar FPS» en Ajustes).
Las geometrías de la ciudad se agrupan por material para reducir llamadas de dibujo.

## 9. Nota de implementación — Fase 1 (rebanada vertical)

**Cómo se juega:** menú principal → perfil → «🏙️ PROYECTO GÉNESIS (demo)». Partida propia `<perfil>~genesis`.

| Misión | Qué hace el jugador | Estado |
|---|---|---|
| Intro | Cuarto gamer de noche: sirenas, choque, parpadeo de luz. Botón «Omitir» | Probada |
| M01 | Va a la ventana y mira: una persona huye, el depredador la alcanza fuera de cuadro (corte a la cara, sin violencia) y mira hacia la casa | Probada |
| M02 | Se aleja, apaga la luz, se esconde en el ropero y espera; el depredador se va | Probada |
| M03 | Amanece, lee la alerta ficticia del celular y sale por la puerta | Probada |
| M04 | Agua y comida en la tienda de la esquina, linterna en el auto chocado, con el depredador patrullando | Probada |
| M05 | Tapa la ventana, guarda suministros y descansa (guarda); tarjeta «Fin de la demo» y linterna de noche | Probada |

Si el depredador te descubre: pantalla de aviso sin violencia y vuelves al último punto seguro.

**Pruebas:** `tests/e2e-genesis.cjs` (18/18): misiones iguales al diseño, validación del estado guardado,
introducción y botón de omitir, guardado y reanudación tras recargar, y que las partidas de Historia y Mundo abierto
quedan byte a byte iguales. Capturas en `docs/genesis/capturas/`.

**Arreglos encontrados al probar:** el interruptor estaba demasiado cerca del ropero; el depredador te veía al empezar M02;
la cama quedaba tapada por el ropero en M05 (ahora gana el objeto más cercano); el estado guardado ahora descarta ids desconocidos.

**Provisional / no incluido en la Fase 1:** modelo del depredador (Alosaurio animado por piezas), modelo de la persona que huye,
NPC con IA, multijugador en la ciudad, controles táctiles probados en un celular real, datos geográficos reales (Fase 4).

## 10. Pruebas de regresión después de la Fase 1 (2026-10-31, una por una)

perfiles 27/27, historia 24/24, refugio 23/23, combate 11/11, multijugador 31/31, filtro de nombres 0 fallos,
partida antigua 7/8 (mismo resultado que antes de Génesis; la comprobación que falta no aplica), Génesis 18/18.
`npm run build`: correcta («built in 2.71s»). No se probó en un celular real.
