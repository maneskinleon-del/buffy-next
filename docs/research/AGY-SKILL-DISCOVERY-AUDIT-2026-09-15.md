# AGY SKILL DISCOVERY AUDIT — 2026-09-15

**Estado:** CHECKPOINT / NO IMPLEMENTAR

**Tipo:** checkpoint de documentación. Sin cambios en código, sin adapters, sin
modificaciones en Buffy Context ni en el mecanismo actual de discovery.

---

## Pregunta investigada

¿Cómo descubre, carga o incorpora **Agent Skills** Antigravity CLI (AGY)?

## Observación

**No existe actualmente evidencia pública suficiente para afirmar cómo AGY CLI
descubre Agent Skills.**

Durante la investigación se generó una primera respuesta que extrapolaba el
comportamiento de Gemini CLI hacia AGY. Una segunda auditoría adversarial —
que intentó refutar las propias afirmaciones — concluyó que ninguna de ellas
podía sostenerse con evidencia pública específica para AGY.

## Auditoría de hipótesis

| Hipótesis | Estado | Tratamiento |
|---|---|---|
| AGY escanea `~/.gemini/extensions/...` como ruta de discovery | NO VERIFICADO / DESCARTADO COMO HECHO | No usar como premisa |
| AGY reconoce `SKILL.md` como archivo canónico | NO CONFIRMADO | No asumir |
| AGY soporta Skills locales de workspace y sus prioridades | NO VERIFICADO | Pendiente |
| AGY hace lazy loading de Skills | INFERENCIA | No tratar como evidencia |
| AGY tiene `/skills list` como comando | NO VERIFICADO / DESCARTADO COMO HECHO | No asumir |
| Los Skills de AGY deben pertenecer a extensiones | NO VERIFICADO | No asumir |
| AGY no necesita registro manual | INFERENCIA | No asumir |
| Discovery de AGY = discovery de Gemini CLI | NO DEMOSTRADO | Separar ambos mecanismos |
| Experimento `DISCOVERY_TEST_8472` basado en esas rutas | INVALIDADO | No ejecutar como prueba de AGY |

La auditoría clasificó las afirmaciones como **NO VERIFICADO**, **INFERENCIA**
o **FALSO/NO JUSTIFICADO** según el caso.

## Evidencia

- **Evidencia de Gemini CLI:** el comportamiento de skills/discovery de Gemini
  CLI está documentado públicamente. Esa evidencia corresponde a Gemini CLI y
  **solo** a Gemini CLI.
- **Evidencia de AGY:** ninguna. No se encontró documentación pública que
  confirme un mecanismo específico de Agent Skill discovery para AGY.
- **Inferencias:** las afirmaciones sobre lazy loading y ausencia de registro
  manual son extrapolaciones plausibles pero sin soporte; se registran como
  INFERENCIA, no como evidencia.
- **Ausencia de evidencia:** el resultado de la auditoría adversarial fue que
  ninguna afirmación de la lista anterior pudo sostenerse con evidencia
  pública específica para AGY. La ausencia de evidencia es el hallazgo
  primario de este checkpoint.

## Corrección metodológica

Registrar explícitamente:

> «El comportamiento conocido de Gemini CLI no debe extrapolarse
> automáticamente a AGY.»

> «"No existe evidencia pública suficiente" NO significa "AGY no soporta
> Skills".»

AGY puede soportar Skills por mecanismos distintos a los asumidos. Este
checkpoint no afirma incompatibilidad ni ausencia de soporte: afirma
desconocimiento verificable.

## Implicación para Buffy

AGY queda clasificado como **PENDIENTE / NO PROBADO** en el contexto del
patrón de `docs/architecture/AGENT-SKILL-INTEGRATION.md` y **deja de ser un
bloqueo del experimento general de Buffy**.

- Esto **NO demuestra** que AGY sea incompatible con Buffy.
- Significa que actualmente no conocemos un mecanismo de integración de AGY
  suficientemente verificable para utilizarlo como base experimental.

Nota: la evidencia previa de routing AGY↔Buffy (`docs/research/AGY-BUFFY-ROUTING-CHECKPOINT-2026-09-14.md`,
`docs/research/AGY-ROUTING-FINDINGS.md`) corresponde al **canal MCP**, no al
canal de Agent Skills. Ambos canales quedan explícitamente separados.

## Experimento invalidado

El experimento **`DISCOVERY_TEST_8472`**, basado en
`~/.gemini/extensions/.../skills/.../SKILL.md`, queda **INVALIDADO**: la ruta
y el mecanismo no fueron demostrados para AGY.

**No ejecutarlo** como prueba de discovery de AGY.

## Próximo paso

Pendiente: una futura investigación específica del mecanismo real de AGY,
basada en evidencia observada (comportamiento del binario, documentación
oficial de AGY), **sin inventar rutas ni mecanismos**.

Mientras tanto, **otros agentes con mecanismos observables** pueden utilizarse
para continuar las pruebas del patrón de `docs/architecture/AGENT-SKILL-INTEGRATION.md`.

## Referencias

- Auditoría adversarial de la investigación externa (fuente de este checkpoint).
- `docs/architecture/AGENT-SKILL-INTEGRATION.md` — patrón canónico + integración por agente.
- `docs/research/AGY-BUFFY-ROUTING-CHECKPOINT-2026-09-14.md` — routing AGY vía MCP (canal distinto).
- `docs/research/AGY-ROUTING-FINDINGS.md` — hallazgos de routing AGY (canal MCP).
