# HALLAZGOS DE SUPERFICIE CLI — Buffy Next v0.2.2 (2026-09-25)

**Tipo:** checkpoint documental de hallazgos de uso directo. Sin cambios de código.
**Commit base:** `eb496f9` (master, working tree limpio, `master == origin/master`).
**Método:** uso directo del CLI (`node dist/cli.js`), black-box, ~30 min, sin abrir `src/`.
**Evidencia cruda:** `~/docs/experiments/2026-09-25-cli-surface/` — 8 archivos + `SHA256SUMS` (8/8 OK, verificado tras la copia).
**Clasificación:** CONFIRMADO / UNVERIFIED / HIPÓTESIS según convención `[orig]/[verificado YYYY-MM-DD]`.

---

## Contexto

Primera sesión de uso directo del CLI como herramienta standalone (sin consumer AGY en el medio). Motivación: el ratio hallazgo/minuto de esta modalidad resultó ~10x mayor que tres rondas de experimentos de routing AGY (C5-B: primaria p=0.114, inconclusiva). No es que el consumidor sea deficiente: es que el routing interponía variables de baja señal sobre los bugs reales.

Recorrido: Tarea 1 (shape: `doctor`, `capabilities`) → Tarea 2 (`diagnose`, humano + `--json`, 6 queries) → Tarea 3 (`act`, solo path negativo — ver H7).

---

## Hallazgos

### H1 — Contradicción doctor↔capabilities sobre ADB [verificado 2026-09-25]

`doctor` → `⚠️ Shizuku: no instalado · Root: no disponible · ADB: no disponible`.
`capabilities` (misma corrida de sesión) → `✅ ADB (Android Debug Bridge version 1.0.41 ... Installed as /usr/bin/adb)`.

Dos comandos del mismo binario, mismo sistema, mismo minuto: al menos un detector está mal. Un consumidor no puede decidir en cuál creer — bug de confianza interna, no cosmético.

Sub-hallazgo H1b (misma capa de parsing): `doctor` reporta driver GPU `pcieport` — rol PCI del bridge, no driver de GPU. Artefacto de parsing de `lspci`.

### H2 — Selector de checks brittle en español [verificado 2026-09-25]

| Query | Checks seleccionados | Resultado |
|---|---|---|
| "el sistema va lento" | cpu, ram, gpu, temperature, processes | 5 obs, 2 recs ✓ |
| "uso alto de CPU" | (ninguno) | `no_evidence`, 0 obs, 0 recs |
| "high memory usage" | ram, processes | 2 obs, 0 recs ✓ |
| "temperatura del sistema" | temperature, cpu, processes (sin el dato de temperatura útil) | 0 recs |
| "temperatura" | temperature, cpu, processes | 2 recs ✓ |

"Uso alto de CPU" en español no selecciona ni `cpu` — la consulta más canónica del dominio cae fuera del diccionario. Cobertura, no lógica.

### H3 — Keyword "temperature" solo inglés [verificado 2026-09-25]

"temperatura del sistema" (ES) no matchea la keyword del selector; "temperatura" a secas sí (match parcial). Mismo mecanismo de H2, mostrado con par mínimo.

### H4 — Contaminación `--json` en el campo `query` [verificado 2026-09-25] ⚠️ prioridad 1

2/2 pruebas: `"query": "el sistema va lento --json"` y `"query": "temperatura --json"`. El flag no es consumido por el parser sino agregado al texto de la consulta, y contamina el campo de forma determinista en el payload JSON — exactamente el consumido por análisis posteriores. Prioridad 1 por credibilidad del dato: cualquier pipeline que parsee hereda el error.

### H5 — `Observed == Inferred` en recommendations [verificado 2026-09-25, como texto] ⚠️ bug epistémico

En las 2 respuestas con recomendaciones, el campo `inferred` de cada acción es copia literal de `observed` ("CPU: ... ; Procesos consumiendo mucho CPU: ..." en ambos). E4.1 define `INFERRED` como "dato derivado de OBSERVED, no medido directamente" — presentar inferencia idéntica a la observación viola la distinción observación≠conclusión que sostiene el contrato epistémico del proyecto. Si no hay paso de inferencia, el campo no debería emitirse.

### H6 — `freshness` ausente en diagnose, presente en doctor --context [parcialmente por diseño — UNVERIFIED el residual]

Pregunta del operador: ¿omisión por diseño o bug? Evidencia:

- **Por diseño (contrato):** `docs/E4-1-TEMPORAL-CONTRACT.md` define `EpistemicState` (observed/inferred/stale/unknown) + `observedAt` + `source` + `ageMs` como campos obligatorios del nuevo contrato `Observation`. `docs/EVIDENCE-INDEX.md:115` lista `freshnessGating` dentro del pipeline de diagnose. `health` expone subsistema `Freshness: ✅` y métrica `Stale rate`.
- **Implementado en un path:** `doctor --context` (= payload de `buffy_context`) emite `freshness` por-campo: 7/7 (`hardware.cpu.freshness = 'observed'`).
- **Diagnose emite un subconjunto:** JSON de diagnose tiene `observedAt` + `source` por observación, pero **0 menciones de `freshness`/`epistemicState`/`ageMs` por-observación**. Sí tiene agregados de frescura a nivel reporte: `audit.staleFields`, `audit.refreshRequired`, `audit.refreshPerformed` (vacíos: `[]`), y exactamente 1 mención de "stale" en el payload (la clave `staleFields`).
- **Probe anti-caché:** 2 corridas con sleep 15 → `observedAt` difiere por corrida (16:46:41 vs 16:46:56) y `.buffy/` está vacío → no hay capa de caché; todo se re-observa por invocación. Con re-observación total, staleness real es inalcanzable por diseño de flujo, y `staleFields: []` es esperable.

**Veredicto:** el diseño contempla frescura (contrato E4.1) y está implementado en el path context; en diagnose falta el estado epistémico por-observación en el output. **UNVERIFIED** (hasta abrir src/): si `epistemicState` se calcula y no se serializa, o no se popula en ese path. No es bug de la familia H1 (inconsistencia inter-comandos): es brecha entre contrato E4.1 y salida observable de diagnose.

### H7 — `--dry-run` no existe [verificado 2026-09-25]

`grep -c "dryRun\|dry-run" dist/cli.js` → 0. La Tarea 3 diseñada (`act <action-id> --dry-run`) no es ejecutable tal cual: el plan de ActionGate previo a ejecución real no tiene superficie CLI. **Consecuencia:** la frontera conocer/ejecutar quedó verificada solo por el path negativo (ver T3). Si ActionGate existe internamente, no es alcanzable desde CLI — gap de superficie, no necesariamente de diseño interno.

### H8 — `capabilities` no cataloga acciones [verificado 2026-09-25]

`grep -in "install-tool|acción|accion|action" capabilities` → exit 1 (0 matches). El output completo (3148B en evidencia) es inventario de toolchain + secciones finales sin catálogo de acciones. Pero `act` con acción desconocida responde *"Usa: buffy capabilities para ver acciones disponibles"* y `--help` ejemplifica `buffy act install-tool node`. El descubrimiento de action-ids depende de un comando que no los muestra. Circuito de descubrimiento roto.

---

## Tarea 3 — `act` (path negativo únicamente)

- `act` sin args → usage correcto.
- `act bogus-action-id` → rechazo limpio ("Acción no encontrada") sin efectos ni stack trace.
- `act bogus-action-id --dry-run` → mismo rechazo (el flag ni se parsea: ver H7).
- **Path positivo NO ejercitado** deliberadamente: `act install-tool node` ejecutaría instalación real; sin dry-run no hay modo seguro de probarlo en esta sesión. Queda como prueba pendiente para cuando exista H7-fix o entorno desechable.

---

## Prioridades propuestas (orden del operador, sin aplicarse aún)

1. **H4** (contaminación de dato, trivial + alto impacto en credibilidad)
2. **H1** (confianza interna; H1b incluido)
3. **H5** (coherencia epistémica con E4.1 — puede requerir definir qué es "Inferred" en el sistema real)
4. **H2/H3** (diccionario de sinónimos + tests; reusar patrón de diccionario existente)

H7/H8 son gaps de superficie que condicionan el diseño de futuras pruebas de ActionGate.

---

## Alcance

Un SO (EndeavourOS/Linux), un adapter (LinuxAdapter), un binario (v0.2.2 @ `eb496f9`), ~30 min, n pequeño por query (1-2 corridas salvo probe de frescura). H5 verificado como igualdad de texto (2/2 respuestas con recs), no como ausencia de lógica de inferencia en código. H6 residual UNVERIFIED hasta abrir src/. Ninguna acción real ejecutada; cero cambios al sistema bajo prueba.

## Estado del repo

Sin cambios de código. Este documento es el único cambio documental. Evidencia cruda fuera del repo (`~/docs/experiments/2026-09-25-cli-surface/`, 8 archivos, SHA256SUMS 8/8).
