# Arquitectura sugerida (adaptar al repo real)

## Principio de compatibilidad
Implementar vertical slice en una rama. No modificar interfaces públicas sin pruebas de regresión. Mantener el mundo antiguo y sus partidas. Hacer adapters antes de reemplazar sistemas.

## Entidades lógicas
- `Profile`: id estable, nombre, apariencia, preferencias.
- `CampaignSave`: id, `saveSchemaVersion`, `campaignId`, `worldId`, `regionId`, `spawnId`, misión/estado, stats/inventario/recompensas, fecha de guardado.
- `RegionDefinition`: límites, seed si procedural, geometría, puntos de aparición, NPC y amenazas.
- `MissionDefinition`: id, prerrequisitos, objetivos, eventos, recompensas y checkpoints.
- `CreatureArchetype`: especie, talla, dieta, relación con jugador, audición/visión, horarios y animaciones.
- `SequenceDefinition`: pasos de cinemática, condiciones, fallbacks, puntos de control y posibilidad de saltarla.

## Guardado
- Hacer copia antes de migrar. Incrementar versión y permitir leer formato anterior.
- Separar progreso de la campaña antigua `jurassic_island_legacy` y la nueva `genesis_city`.
- Nunca mapear posiciones antiguas al nuevo mapa: crear spawn urbano seguro.
- Preservar lo compatible y almacenar sin pérdida ítems no disponibles en nueva campaña (inventario legado).
- Usar operaciones idempotentes; guardar temp, validar, después confirmar. Incluir migración reversible mientras sea viable.
- Probar con datos falsos de usuario y fixtures; no borrar guardados reales.

## Representación geográfica
- Importar extractos pequeños de **OpenStreetMap** conforme a ODbL: red vial / manzanas cuando haya cobertura útil.
- Datos de relieve de **INEGI** sujetos a términos y metadatos del conjunto específico.
- Generación procedural original para masas de edificios. Casas y comercios como prefabs; materiales PBR optimizados.
- No copiar directamente mallas, texturas, volúmenes ni fotografías de Google Maps/Google Earth.
- Primera zona inspirada en Nuevo Laredo, sin señalar casa verdadera de ningún usuario/menor.
- `WorldToLocal`: coordenadas proyectadas locales para Three.js; evitar precisión insuficiente en coordenadas geográficas grandes.
- Sector chunks con borde compartido; calles sin cortes, persistencia de posiciones y misiones.

## Mundo modular
- Crear/usar `WorldRegistry` con mundos `genesis_city` y `jurassic_island_legacy` (o equivalentes).
- `RegionLoader` carga assets por zona y descarga fuera de distancia; LOD/instancias; evitar recarga de GLB redundante.
- Navmesh o grafo de navegación por vías y obstáculos. Persecuciones acotadas a áreas seguras para FPS.
- Colisiones: cuerpos simplificados para edificios, autos, muros; raycast o navmesh para visión realista.
- IA por estados: IDLE, PATROL, INVESTIGATE, CHASE, SEARCH, RETREAT, REST; distintos umbrales por criatura.

## Estilo visual
Ciudad mexicana contemporánea, banquetas y bardas, postes, autos, señalización original, noche y bruma, paleta oscura legible. Mantener calidad baja/media/alta. No intentar ciudad total en un frame.

## Riesgos
- Licencias de 3D externos, OSM e INEGI; datos actuales faltantes.
- Carga web y límites Android; animaciones GLB profesionales no están incluidas en ZIP.
- Necesidad de arquitectura real para humanoides, vehículos y refugios; implementar iterativamente.
- Nuevas animaciones y edificios no son gratis en tiempo de programación aunque se use asset gratuito.
