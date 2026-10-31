# JURASSIC LOST: Atrapado en el tiempo — Etapa 1 (prototipo jugable)

Juego 3D de supervivencia y exploración para navegador, hecho con **Three.js + TypeScript + Vite**.
Todos los modelos (niño, dinosaurios, árboles, rocas) son originales, creados con geometría básica.
Los sonidos se sintetizan en tiempo real con Web Audio: no hay archivos con licencia de terceros.

## Requisitos
- Node.js 18 o superior (probado con Node 22).

## Instalación y ejecución
```bash
npm install
npm run dev
```
Abre **http://localhost:5173/** en el navegador.
Para probar en el celular (misma red Wi‑Fi), abre la dirección "Network" que muestra Vite, p. ej. `http://192.168.1.20:5173/`.

Otros comandos:
- `npm run build` — comprueba tipos y genera la versión de producción en `dist/`.
- `npm run build:single` — genera `dist-single/index.html`, el juego entero en un único archivo que se abre con doble clic.
- `npm run typecheck` — solo comprobación de TypeScript.

## Controles
| Acción | Computadora | Celular |
|---|---|---|
| Caminar | WASD / flechas | Joystick izquierdo |
| Cámara | Ratón (clic para fijar el puntero) · rueda = zoom | Deslizar en la mitad derecha |
| Correr | Shift | 🏃 (alterna) |
| Saltar | Espacio | ⤒ |
| Recoger / beber / comer | E | ✋ |
| Agacharse | C | ⤓ |
| Pausa y opciones | Esc / P | ⏸ |

## Qué incluye la Etapa 1
- Selva de 640 × 640 m: terreno irregular, colinas, cordillera que limita el mapa, río vadeable, lagunas, claro inicial.
- ~10 000 plantas instanciadas por trozos (árboles gigantes, árboles de selva, cícadas, helechos arborescentes, arbustos, helechos, hierba, rocas) con descarte por distancia.
- Personaje infantil con mochila y celular, animaciones procedurales: reposo, caminar, correr, saltar, agacharse, recoger.
- Cámara en tercera persona orbital que no atraviesa el suelo ni los troncos.
- Física propia: gravedad, salto, colisión con árboles, rocas (se puede subir a ellas) y dinosaurios, pendientes no escalables, daño por caídas altas.
- Dinosaurios con IA básica por estados (reposo/pastar, patrulla, alerta, apartarse): manada de 3 triceratops y un saurópodo gigante a lo lejos. Evitan árboles, agua y pendientes.
- Recolección de madera y piedra (reaparecen con el tiempo), bayas para comer, beber en el río.
- Salud, hambre, sed y energía con ritmos suaves; al desmayarse vuelves al claro perdiendo el 25 % de los materiales.
- HUD: indicadores, objetivos "Primeros pasos", minimapa, contador de materiales, avisos.
- Menú de inicio, pausa, volumen, calidad gráfica (baja/media/alta), sensibilidad, FPS, guardado automático en localStorage.
- Detección de dispositivo táctil: calidad baja y controles táctiles automáticos.

## Introducción
En una partida nueva se reproduce una introducción de ~27 s (se puede omitir con el botón, Esc, Enter o Espacio):
el niño en su cuarto con el celular, el juego misterioso y su secuencia secreta, la anomalía temporal con distorsión,
rugido y destello, y la llegada a la selva con el título del juego. Se puede volver a ver desde el menú de pausa.

## Gráficos
Cielo con dispersión atmosférica, tonemapping ACES, texturas procedurales (suelo, corteza, hojas, frondas, hierba,
escamas de dinosaurio, ondas del agua) generadas en el navegador, copas de árboles con hojas transparentes y viento.

## Estructura
```
src/
  main.ts                 arranque y menús
  core/                   Game (bucle), Input, Collision, Settings/guardado, Objectives, utilidades
  world/                  Terrain, Vegetation, InstancedChunks, Environment (cielo/luz), modelos de plantas
  player/                 Player (controlador), CharacterModel (modelo + animación), ThirdPersonCamera
  creatures/              Dinosaur (IA), dinoModels
  items/                  Collectibles (recursos en el mapa), items (catálogo e inventario)
  survival/               Survival (indicadores)
  ui/                     HUD, TouchControls, styles.css
  audio/                  AudioManager (sonido sintetizado)
  intro/                  Intro (cinemática) y Bedroom (cuarto del niño)
```

## Pruebas realizadas
Se probó en Chromium sin interfaz (Playwright) a 1280×720 y en un móvil emulado de 915×412 con pantalla táctil:
caminar, correr, saltar y aterrizar, joystick, cámara táctil, recoger madera, beber, objetivos y movimiento de los dinosaurios, sin errores en consola.
No se ha medido el rendimiento en un celular físico.

## Perfiles, personaje y guardado

- **Menú principal:** Nueva aventura, Continuar aventura, Mi personaje y Configuración. Hay hasta 3 perfiles locales, cada uno con su propia partida.
- **Personaje:** se elige niño o niña (solo cambia el aspecto, no las habilidades). Se puede personalizar la piel, el peinado (corto, despeinado, coleta o melena), el color de pelo, la camiseta y el pantalón. Hay una vista 3D que se gira arrastrando.
- **Nombres:** el filtro está en `src/profile/nameFilter.ts` y las reglas, que se pueden actualizar, en `nameRules.ts`. Pide de 3 a 16 caracteres (letras, números, `_`, ñ y acentos). Detecta números escritos como letras, letras parecidas de otros alfabetos, letras separadas, letras repetidas, teléfonos, correos y nombres que se hacen pasar por administradores.
- **Guardado automático:** se guarda en IndexedDB (`src/profile/persistence.ts`):
  - Cuándo: cada 60 s, al completar objetivos, al fabricar, al pausar, al salir al menú y al ocultar la página.
  - Cómo: una sola transacción que conserva la copia anterior y la usa si la última está dañada. Cada guardado lleva `schemaVersion` y `revision`.
  - Qué guarda: perfil, misión y objetivos, regiones, supervivencia, inventario, arma equipada, recursos agotados, posición y último punto seguro, tiempo, estadísticas y experiencia. Ya tiene campos preparados para refugios, fragmentos y Kiro.
- **Recuperación:** si la posición guardada está en el agua, dentro de un obstáculo o fuera del mapa, apareces en el último punto seguro.
- **Cuentas en línea (futuro):** `src/profile/auth.ts` describe el diseño, con registro por tutores, servidor y conflictos entre dispositivos. Ahora mismo no se envía ningún dato a ningún servidor.

## Personajes con esqueleto (Mixamo)

- **Sin modelos con esqueleto:** el juego usa el personaje procedural, que tiene articulaciones y animaciones de reposo, caminar, correr, saltar, agacharse, recoger, construir, golpe y alerta.
- **Para usar modelos con esqueleto:** pon los GLB de Mixamo y un `manifest.json` en `public/models/characters/rigged/`. Los pasos están en el `LEEME.txt` de esa carpeta.
- **Qué hace el juego con ellos** (`src/player/RiggedModel.ts`):
  - Los escala a la altura de un niño.
  - Reconoce los clips por su nombre y cambia entre ellos según la velocidad.
  - Pone el arma en el hueso de la mano derecha.
  - Tiñe los materiales llamados skin, hair, shirt o pants.
- **Prueba:** se comprobó con el modelo de ejemplo Xbot de three.js, que tiene esqueleto de Mixamo. Cargó con sus clips idle, walk, run y crouch, caminó, corrió y sostuvo la lanza. El modelo de prueba no se incluye en el juego.
- **Tus GLB estáticos:** `explorador_inicial.glb` y `exploradora_inicial.glb` están guardados en `public/models/characters/` pero no se usan, porque no tienen articulaciones.

## Combate y fabricación

- **T o 🛠:** fabricar mazo, lanza, honda, arco o flechas.
- **1‑5:** elegir arma.
- **Clic, F o ⚔:** atacar.
- **Reacciones:** los herbívoros pequeños huyen y los grandes embisten un rato. Los carnívoros cazan: el T‑rex no se puede vencer y los demás depredadores se pueden espantar. Si te alcanzan, te desmayas y despiertas en el claro.
- **Depredadores GLB:** alosaurio, ceratosaurio, torvosaurio, megalosaurio y compsognathus, en `public/models/dinosaurs`. No tienen esqueleto, así que se separan por geometría y se animan como piezas rígidas.

## Pruebas automáticas

- `npm run test:names`: 65 casos del filtro de nombres.
- `npm run dev`, y luego `node tests/e2e-profiles.cjs`: 24 comprobaciones en Chromium con Playwright, incluido cerrar y volver a abrir el navegador.
- `npm run dev`, y luego `node tests/e2e-shelter.cjs`: 23 comprobaciones de la Etapa 2 (hojas, refugio, noche, dormir, desmayo y guardado).

## Etapa 2: refugio, descanso y día/noche
- **Reloj del mundo** (`src/world/DayNight.ts`): un día dura 20 minutos; el día (6:00-20:00) ocupa el 70 % y la noche el 30 %. La partida empieza a las 8:00.
  Sol que cruza el cielo, atardecer dorado, noche azulada con luna, estrellas, luciérnagas, grillos y ranas.
- **Hojas grandes** 🍃: nuevo recurso.
- **Refugio** (`src/building/Buildings.ts`): 🛠 → Construir. Cuesta 10 madera, 6 hojas y 4 fibra. Vista previa verde o roja y se levanta pieza a pieza.
  Tiene cama de hojas y una fogata que ilumina de noche.
- **Descansar** (E dentro del refugio): de noche se duerme hasta las 6:30 (energía al máximo, +50 de salud); de día se descansa hasta la tarde.
  Dentro del refugio los dinosaurios no te ven; si te desmayas, despiertas en tu refugio más cercano.
- **Misión "Un lugar seguro"**: sigue a "Primeros pasos". Los refugios, la hora y las misiones se guardan en la partida.

## Aspecto cinematográfico
- **Niebla atmosférica** (`src/world/Atmosphere.ts`): bruma baja en los valles además de la niebla por distancia.
- **Posprocesado** (`src/core/PostFX.ts`): etalonaje de película (sombras frías, luces cálidas, viñeta) en calidad media; además resplandor (bloom) en alta.
- **Vegetación prehistórica**: helechos gigantes, plantas de hoja ancha y colas de caballo; volcán lejano con humo.
- **Partículas** (`src/world/Particles.ts`): motas de polvo, hojas que caen, polvo en las pisadas de los dinosaurios grandes, bandadas de pájaros y luciérnagas de noche.
- **Piel de dinosaurio PBR** (`src/creatures/skin.ts`): escamas procedurales con relieve, rugosidad variable y osteodermos, proyectadas en tres planos (sirve también para los GLB sin UV).
- **Animación**: respiración (más rápida tras correr), balanceo al pisar, inclinación al correr, la cola acompaña el paso, miradas alrededor en reposo y rugido con la cabeza alzada.
- **Sonido**: pisadas graves con temblor de cámara cerca del tiranosaurio (se desactiva con "Reducir movimiento"), bramidos, bocinas y gruñidos con dirección estéreo y eco de selva.
- **Calidad baja/media/alta**: resolución, sombras, distancia de dibujado, plantas pequeñas, partículas, posprocesado y distancia de LOD de animación de los dinosaurios.
  La vegetación usa instancias por zonas con descarte por distancia y fuera de cámara.
- Los alosaurios, ceratosaurios, torvosaurios, megalosaurios, compsognathus e iguanodontes siguen con modelos provisionales.

## Dinosaurios con esqueleto y selva en primer plano
- **Modelos gratuitos CC0** (`public/models/quaternius/`, `src/creatures/quatModels.ts`): tiranosaurio, triceratops, estegosaurio y apatosaurio del paquete "Animated LowPoly Dinosaurs" de Quaternius (dominio público, uso comercial permitido; ver `CREDITOS.txt`). Tienen esqueleto y animaciones de reposo, paso, carrera y ataque (el ataque se usa como rugido). Se recolorean con tonos naturales, se suavizan y llevan la piel PBR. Si no cargan, se usan los modelos procedurales.
- El braquiosaurio pasa a llamarse **Apatosaurio**, que es el modelo nuevo.
- **Selva**: lianas con hojas que cuelgan de las copas casi hasta el suelo, raíces tabulares y raíces superficiales en los árboles gigantes, contrafuertes en los árboles de la selva y **senderos de tierra** que serpentean por el mapa (sin árboles encima).
- **Rayos de sol** más anchos y numerosos (10/22/30 según la calidad) y tres pterosaurios que vuelan más bajos.
- Las hojas de las lianas solo se dibujan cerca (distancia de decoración), para no perder rendimiento.

## Capítulo 1 de la trama de terror: «Algo ronda en la noche»

El miedo viene del sonido, la oscuridad y el comportamiento de los dinosaurios, sin sangre ni sustos bruscos.

- **Introducción:** en el monitor del cuarto gamer aparecen mensajes misteriosos («¿HAY ALGUIEN AHÍ?», «PROYECTO CRONOS · SUJETO 047 LOCALIZADO», «no estás solo»). En la isla llegan mensajes sin remitente al celular (al despertar, al primer anochecer, al recoger la pieza y al final del rastro).
- **Noches de terror:** noche más oscura con niebla cercana, hojas que se mueven, ramas que crujen, gruñidos lejanos, pisadas que se acercan y se detienen, ojos que brillan un momento entre los árboles. Si un depredador te acecha cerca, los grillos se callan, sube un zumbido grave y se oye el corazón.
- **Cada especie reacciona a su manera** (`temper` en `species.ts`): el tiranosaurio ruge y carga; los depredadores medianos acechan rodeándote y luego atacan; el triceratops y el estegosaurio avisan (bufan y pisotean) y embisten si no te alejas; el apatosaurio es tranquilo y solo avisa si te metes bajo sus patas; el iguanodonte da la alarma y huye (se defiende si lo arrinconas); los compis te siguen en grupo y te pican si te quedas cerca. De noche los depredadores perciben más lejos y correr hace ruido. Todos se defienden si los golpeas y se les puede vencer como antes.
- **Visita nocturna:** la primera noche que duermes en el refugio te despiertas de madrugada; un gran depredador se acerca, olfatea alrededor del refugio y se va. No ataca: si sales, te oye, gruñe y se aleja.
- **Al amanecer:** huellas enormes junto al refugio y la pieza metálica **CRONOS-047** (objeto especial, con tarjeta). El rastro de huellas lleva a un lugar donde empiezan unas huellas diminutas y algo chilla entre los helechos: la misión «Una voz entre los helechos» prepara el encuentro con Kiro (capítulo 2).
- **Partidas anteriores:** se conservan perfiles, inventario, construcciones y misiones; la historia empieza vacía y continúa con la misión nueva. Copia de seguridad del código anterior en la rama `respaldo-antes-del-terror` (y en `jurassic-lost-respaldos/pre-terror` de los archivos del proyecto).
- Código: `src/story/Story.ts` (guion, huellas, pieza, mensajes) y `src/story/NightAmbience.ts` (ambiente nocturno). Pruebas: `tests/e2e-story.cjs` (24 comprobaciones) y `tests/e2e-old-save.cjs` (abre con esta versión una partida creada con la anterior).
