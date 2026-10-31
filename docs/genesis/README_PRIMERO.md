# PERDIDO EN EL JURÁSICO — PROYECTO GÉNESIS
## Paquete de migración narrativa y técnica v2.0

**Para Claude Code:** abre este directorio desde el repositorio ACTUAL del videojuego. Lee `CLAUDE.md` y `claude/INSTRUCCION_DE_EJECUCION.md`. El paquete es una **especificación**, no reemplaza el código existente ni contiene modelos 3D listos para jugar.

### Procedimiento
1. Descomprimir ZIP fuera de `src/`, preferiblemente en `docs/genesis/` dentro del repositorio.
2. Pedir a Claude Code: **«Lee `docs/genesis/CLAUDE.md`, audita el repositorio actual y ejecuta únicamente Fase 0 y Fase 1, sin borrar nada ni publicar».**
3. Revisar la auditoría, el respaldo y una demo jugable antes de aprobar fases sucesivas.

### Contenido
- `CLAUDE.md`: instrucciones breves, prioritarias y persistentes para Claude.
- `claude/INSTRUCCION_DE_EJECUCION.md`: instrucciones y entregables por fases.
- `specs/HISTORIA_Y_CAPITULOS.md`: guion cinematográfico y narrativa completa.
- `specs/ARQUITECTURA_Y_MIGRACION.md`: reutilización, cambios seguros y mapa 3D.
- `data/game_design.json`: configuración estructurada del nuevo concepto.
- `data/missions.json`: misiones con objetivos, dependencias y eventos.
- `data/regions.json`: regiones y expansión de mapa.
- `data/creatures.json`: dinosaurios y comportamiento.
- `data/cutscenes.json`: introducción y eventos cinematográficos.
- `tests/CRITERIOS_DE_ACEPTACION.md`: checklist de QA y preservación.
- `visuals/*.svg`: **bocetos originales esquemáticos** (se abren en un navegador o editor vectorial). No son modelos GLB ni capturas del juego.

### Límites importantes
No se ha accedido al repositorio en esta entrega. Claude debe descubrir la estructura y confirmar nombres reales de archivos/APIs antes de editar. La ciudad no se genera directamente de Google Maps; utilizar datos licenciados de OSM/INEGI, según permisos, y modelos originales. Mantener las casas de los menores ficticias, nunca asociadas a geolocalización real.
