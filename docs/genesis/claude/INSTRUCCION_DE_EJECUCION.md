# Plan incremental para Claude Code

## Fase 0 — Descubrimiento, respaldo y pruebas base (obligatoria)
- Identificar motor, módulos, paquetes, flujo build, comandos de prueba y rama actual.
- Localizar código efectivo de perfiles, savegames, dinosaurios, misiones, mapas, colisiones y UI. Catalogar archivos/assets.
- Revisar los modelos y texturas que sí existen, sus licencias y si hay animaciones reales.
- Crear respaldo seguro (commit/tag/rama; evitar tocar archivos no relacionados) y rama de trabajo.
- Proponer `SaveGame v2` con migración no destructiva, validación de versión, copia antes de migrar, tests con datos simulados y rollback.
- Redactar `AUDITORIA_GENESIS.md` con tabla **EXISTE / PARCIAL / NO EXISTE** y rutas reales.
- Verificar que el juego anterior puede compilar antes de cambios. No ocultar fallos previos.

## Fase 1 — Primer sector urbano jugable
- Construir dentro del motor existente una escena urbana separada por `sceneId`/`worldId` o equivalente.
- Casa ficticia y habitación gamer; escena de día/noche; 4–8 cuadras visuales (solo área accesible pequeña si necesario); avenidas, banquetas, bardas, autos, parques y tienda.
- Priorizar calles y edificios modulares con colisiones y distancias legibles; LOD e instancias donde corresponda.
- Introducción: sirenas, choque, silueta huyendo, depredador, corte sin violencia explícita, misión de esconderse. Asegurar que se puede jugar/omitir cinemática.
- Reusar controlador actual, cámara, dinosaurio existente (placeholder aceptable claramente marcado) y guardado de perfiles.
- Implementar misiones `M01` a `M05` como primera parte, solo si sus precondiciones se cumplen; no fabricar sistemas falsos.
- Pruebas de regresión de personaje/controles/perfiles/inventario/savegame + render y FPS en dispositivos medidos.
- Resultado: demo jugable y nota de implementación con screenshots reales si el entorno las permite.

## Fase 2 — Supervivencia, IA urbana y NPC
- Contenedores de botín, alimentos, linterna, baterías, construcción de refugios urbanos.
- IA de dinosaurios: campo visual, sonido, olfato como mecánica de juego, investigación, territorio, huida y pérdida de objetivo; evitar detectar a través de muros.
- NPC de rescate: seguimiento, pánico, ruta segura, interacción; no usar identidades reales.
- M06 a M08 y primer mutante después de pruebas.

## Fase 3 — Kiro, Génesis y reservas
- Kiro: rescate, confianza, seguidores, avisos, guardado.
- Pistas científicas, radio y laboratorio ficticio; M09–M10.
- Preservar la vieja isla en `worldId` separado como **Reserva Génesis**, sin forzar acceso hasta que haya transición jugable.

## Fase 4 — Expansión por sectores
- Nuevos sectores de ciudad, streaming/carga por proximidad y compatibilidad de guardados.
- Historia episodios adicionales, laboratorio, contención, finales y misiones secundarias.

## Formato de reporte tras cada fase
**Verificado:** lista precisa de archivos / tests / métricas.
**Cambios:** ruta y propósito.
**Incompleto:** placeholders, modelos, licencias, rendimiento, errores.
**Compatibilidad:** resultado de la prueba de partida antigua.
**Próximo paso:** solo la fase siguiente propuesta.

## Prohibiciones
- No desplegar producción automáticamente, ni borrar `localStorage`/IndexedDB como arreglo.
- No descargar ni raspar contenido de Google Maps.
- No prometer que imágenes de referencia son modelos GLB animados.
- No inventar FPS ni pruebas sin ejecución.
- No cambiar a otro motor sin autorización.
