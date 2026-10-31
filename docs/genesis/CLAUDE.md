# CLAUDE — PRIORIDAD MÁXIMA

Proyecto existente: videojuego web 3D Three.js/TypeScript de supervivencia antes ambientado en isla prehistórica. Nuevo rumbo: **Perdido en el Jurásico: Proyecto Génesis**, invasión de dinosaurios a ciudad inspirada en Nuevo Laredo.

1. **NO REINICIAR, NO BORRAR, NO SOBRESCRIBIR producción, NO PUBLICAR sin autorización**.
2. **PRIMERO inspeccionar repo, tests, dependencias y guardados reales**. No inventar rutas o afirmar funciones no verificadas.
3. Crear rama `feature/urban-dinosaur-invasion` y respaldo verificable antes de editar. No cometer cambios no relacionados.
4. Preservar perfiles, progreso, inventario, XP, controles táctiles, IA, dinosaurios, día/noche, calidad gráfica y zona jurásica. Migrar datos con VERSIONADO y respaldo; no reemplazar coordenadas antiguas por coordenadas urbanas.
5. Entregar **vertical slice** funcional (casa ficticia, calle con 4–8 cuadras como entorno ampliable, persecución inicial, escondite, suministros y guardado); no intentar toda la campaña a la vez.
6. Leer `data/*.json` como **datos de diseño**, NO ejecutar directamente sin validar esquema y adecuarlo al motor existente.
7. El mapa usa fuentes reutilizables con licencias revisadas: OSM para calles/manzanas, INEGI para relieve, geometría original modular de edificios. **NO extraer Google Maps/Google Earth**.
8. La historia está en `specs/HISTORIA_Y_CAPITULOS.md`; arquitectura en `specs/ARQUITECTURA_Y_MIGRACION.md`; QA en `tests/CRITERIOS_DE_ACEPTACION.md`.
9. Para toda acción: reportar hechos comprobados, archivos modificados, pruebas ejecutadas, resultados y pendientes.
10. No registrar ubicación real de menores. Sin gore explícito. Revisar clasificación por edad, privacidad y licencia de recursos.

## Primera ejecución
**Solo Fase 0 y Fase 1** del documento `claude/INSTRUCCION_DE_EJECUCION.md`; realizar fases siguientes exclusivamente tras validación del usuario. Si no tienes permisos para operar Git, crear archivos o correr tests, documentar el impedimento y preparar cambios no destructivos.
