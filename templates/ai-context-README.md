# README — contexto global (ai-context)

Punto de entrada de contexto para sesiones de agentes (Freebuff/OpenCode)
desde cualquier carpeta de trabajo. Este archivo es un índice generado y
verificado; no duplica el contrato de Buffy.

Artefactos derivados:
    manifest: ~/.buffy/layout.json
    índice:   ~/ai-context/README.md

## Capacidades

Buffy se compone de dos capacidades complementarias e independientes
(ninguna depende de la otra):

**Buffy Context — memoria / conocimiento / contexto:**
    repo:            __CONTEXT__
    protocolo:       __CONTEXT_LOAD__
    scripts:         __CONTEXT_SCRIPTS__

**Buffy Next — entorno vivo / diagnóstico / operaciones:**
    repo:            __NEXT__
    entrypoint CLI:  __NEXT_CLI__
    contrato:        __COMPACT__

Son complementarias, no dependientes: Buffy Context aporta memoria
persistente y conocimiento de sesión; Buffy Next aporta observación del
estado vivo y operación del sistema.

## Índice de descubrimiento

Rutas canónicas verificadas (el README de Buffy Next es la fuente del
contrato; este índice solo localiza):

Contrato completo:
    __CONTRACT__

Guía de descubrimiento para harnesses:
    __DISCOVERY__

Bootstrap de distribución (genera este índice):
    __DISTRIBUTE__

Bootstrap SessionStart (inyección de contexto de sesión):
    __SESSIONSTART__

## Reglas

1. No inventar rutas ni comandos de Buffy.
2. No asumir que el comando `buffy` está disponible en PATH.
3. No asumir la existencia de scripts auxiliares de Buffy fuera de los
   archivos listados en este índice.
4. Antes de utilizar Buffy, leer la guía de descubrimiento y el contrato
   compacto desde las rutas listadas arriba.
5. Toda referencia de este índice se verificó al generarlo. Lo que declare
   "NO DISPONIBLE" no está presente en este entorno.
6. Si el CLI de Buffy no está compilado o no está disponible, reportarlo
   como capacidad no disponible; no inventar un wrapper alternativo.
__CONTEXT_RULE__

## Precedencia

Este README es el punto de descubrimiento global de Buffy para agentes que
comienzan desde cualquier workspace. Los documentos del repositorio de Buffy
Next son la fuente de verdad del contrato. Este archivo no duplica ese
contrato: solo proporciona ubicaciones verificadas y reglas de descubrimiento.