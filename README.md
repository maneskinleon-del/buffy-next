# 🧛 Buffy Next

Motor de operaciones con interfaz de asistente para sistemas operativos.

## Qué es

Buffy es una herramienta que observa tu sistema, detecta problemas, te explica qué ocurre y, con tu autorización, ejecuta acciones para solucionarlos.

**No es un framework.** No es un agente de IA. No depende de LLM para funcionar.
Es un motor de operaciones que otros agentes (Claude, Gemini, Freebuff, MCP) pueden usar como herramienta.

## Plataformas

- ✅ **Windows** (PowerShell/WMI)
- ✅ **Android/Termux** (bash/ADB/Shizuku)
- 🔜 **Linux** (Fase 2)

## Instalación

```bash
npm install -g buffy
buffy setup
```

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
