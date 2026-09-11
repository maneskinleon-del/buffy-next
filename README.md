# 🧛 Buffy Next

Motor de operaciones con interfaz de asistente para sistemas operativos.

## Qué es

Buffy es una herramienta que observa tu sistema, detecta problemas, te explica qué ocurre y, con tu autorización, ejecuta acciones para solucionarlos.

**No es un framework.** No es un agente de IA. No depende de LLM para funcionar.
Es un motor de operaciones que otros agentes (Claude, Gemini, Freebuff, MCP) pueden usar como herramienta.

## Filosofía: complejidad proporcional a la tarea

> **La complejidad debe ser proporcional a la tarea.**

Buffy debe distinguir entre:

1. **Acción directa** — si existe un procedimiento conocido, directo y seguro para alcanzar el objetivo, se prueba primero.
2. **Diagnóstico** — si la acción directa falla, se realizan las comprobaciones mínimas necesarias para identificar el bloqueo.
3. **Alternativas** — solo si el procedimiento directo no resuelve el problema, se comparan alternativas relevantes.
4. **Investigación profunda** — solo cuando persiste una incertidumbre que realmente impide decidir o ejecutar.

### Principio: estrategia proporcional a la tarea

> La estrategia de Buffy debe ser proporcional a la tarea. No toda incertidumbre requiere una investigación extensa. Cuando existe un procedimiento directo, conocido y seguro que puede resolver el objetivo, debe probarse antes de explorar hipótesis o alternativas.

Ejemplo conceptual:

```
Shizuku no está activo
→ probar el mecanismo oficial de activación
→ si funciona: cerrar
→ si falla: diagnosticar
→ solo entonces investigar alternativas como Shizuku+, ADB TCP/5555 o watchdog si son relevantes para el problema.
```

### Principio: STOP-ON-SUFFICIENT-EVIDENCE

> Cuando la evidencia disponible es suficiente para decidir o ejecutar de forma segura la acción objetivo, Buffy debe detener la investigación. No debe generar exploración adicional sin una nueva incertidumbre relevante.

Esto **no** significa reducir el rigor. Significa:

- **rigor** cuando existe incertidumbre relevante;
- **acción directa** cuando no existe.

### Profundidad adaptativa

- **Nivel 0 — Acción directa** → procedimiento conocido y seguro.
- **Nivel 1 — Diagnóstico** → comprobaciones mínimas para explicar un fallo.
- **Nivel 2 — Alternativas** → comparar pocas estrategias relevantes cuando la directa falla.
- **Nivel 3 — Investigación profunda** → solo cuando las anteriores no permiten resolver la incertidumbre.

Estos niveles **no** son una obligación de ejecutar fases numeradas: son una regla de proporcionalidad.

### Ejemplo de sobreingeniería

> No es necesario investigar múltiples mecanismos de recuperación si un procedimiento oficial y seguro ya resuelve el problema. Hacerlo consumiría tiempo y recursos sin aumentar la evidencia necesaria para la decisión.

### Ejemplo de investigación justificada

Investigar alternativas sí es válido cuando existe una pregunta real de resiliencia o disponibilidad. Por ejemplo:

```
Shizuku estándar funciona,
pero existe una pregunta distinta sobre persistencia/resiliencia;
entonces tiene sentido estudiar Shizuku+, ADB 5555 o watchdog.
```

La diferencia es que estas alternativas responden a una incertidumbre nueva y concreta; no deben investigarse antes de probar el camino directo.

### Regla final

> Buffy no busca hacer más investigación. Busca obtener evidencia suficiente para realizar correctamente la tarea.

## Plataformas

- ✅ **Windows** (PowerShell/WMI)
- ✅ **Android/Termux** (bash/ADB/Shizuku)
- 🔜 **Linux** (Fase 2)

## Instalación

> ⚠️ El paquete npm público `buffy` **no es** Buffy Next. Es un módulo de terceros
> para lectura/escritura de datos binarios (felixge/node-buffy). No lo instales:
> no corresponde a este proyecto.

Instala Buffy Next desde el repositorio clonado:

```bash
git clone https://github.com/maneskinleon-del/buffy-next
cd buffy-next
npm install
npm run build
npm install -g .
buffy setup
```

Esto compila la CLI a `dist/cli.js` e instala el comando `buffy` globalmente
apuntando a este repositorio.

### ¿Complementar con Buffy Context? (opcional)

Puedes quedarte tal cual: Buffy Next es autosuficiente. Si quieres que tu agente
tenga además memoria persistente, knowledge y skills entre sesiones, existe el
proyecto **opcional e independiente** [Buffy Context](https://github.com/maneskinleon-del/buffy-context).
Ver la sección [Optional companion: Buffy Context](#optional-companion-buffy-context).

## Comandos

```
buffy                          Presentación + doctor rápido
buffy doctor                   Auditoría completa del sistema
buffy capabilities             Qué puede hacer Buffy
buffy diagnose "tu problema"   Diagnóstico dirigido
buffy act <action-id>          Ejecutar una acción
buffy setup                    Bootstrap de Buffy
```

## Modelo de seguridad

| Nivel | Significado | Ejemplo |
|---|---|---|
| **AUTO_SAFE** | Observación + acciones no destructivas | Diagnosticar, verificar driver, listar procesos |
| **CONFIRM** | Modifica el sistema (con tu permiso) | Instalar herramienta, cambiar config |
| **FORBIDDEN** | Buffy jamás ejecuta esto | Formatear, borrar partición |

`buffy act` SIEMPRE revalida plataforma + nivel + prerequisites, independientemente de propuestas previas.

## Arquitectura

```
CLI → doctor/diagnose/act → Check Selector → Adapter → Diagnosis → Action Registry → Security → Executor → Verify → Presenter
                                                                                                                    ↕
                                                                                                              state.json
```

**Core portable** + adapters de plataforma (PowerShell/bash). El core NO conoce WMI, `/proc/stat`, ni ADB.

## Optional companion: Buffy Context

Buffy Next funciona perfectamente solo. No depende de ningún otro proyecto ni de LLMs.

Existe un proyecto hermano **independiente y opcional** que cubre la capa que Buffy
Next deliberadamente no tiene (memoria):

| | Rol |
|---|---|
| **Buffy Next** (este repo) | Entorno vivo: observación del sistema, freshness, diagnóstico y acciones seguras (ActionGate) |
| **[Buffy Context](https://github.com/maneskinleon-del/buffy-context)** | Memoria: persistencia entre sesiones, knowledge, skills, sesión y handoff |

```
                    AGENTE
                  /        \
            Buffy Next   Buffy Context
              entorno       memoria
```

- **Repositorios independientes**: no hay dependencia de código, de runtime ni de
  npm entre ellos. Ninguno importa del otro.
- **Buffy Context es opcional**: sin él, Buffy Next hace todo lo documentado aquí,
  con el mismo contrato `buffy.context/v1` y el mismo modelo de seguridad.
- **¿Cuándo conviene usar ambos?** Cuando tu agente necesita recordar entre
  sesiones: memoria persistente, knowledge técnico por tarea y skills. La
  integración ocurre **en el nivel del agente** (el agente lee el contexto
  persistente de Buffy Context y consulta a Buffy Next para el estado actual del
  sistema), nunca por acoplamiento entre repos.
- Detalles de arquitectura y estado de adopción: [`docs/COMPANION-ARCHITECTURE.md`](docs/COMPANION-ARCHITECTURE.md) · [`docs/COMPANION-READINESS.md`](docs/COMPANION-READINESS.md).

## Desarrollo

```bash
npm install
npm run dev                    # Ejecutar sin compilar
npm run build                  # Compilar a dist/
npm run typecheck              # Verificar tipos
npm test                       # Ejecutar tests
```

## Especificación

Ver `docs/spec-v2.1.md` para el diseño completo.

## Licencia

MIT
