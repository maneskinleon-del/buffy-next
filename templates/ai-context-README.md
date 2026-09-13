# README — contexto global (ai-context)

Punto de entrada de contexto para sesiones de agentes (Freebuff/OpenCode)
desde cualquier carpeta de trabajo. Este archivo es un índice generado y
verificado; no duplica el contrato de Buffy.

Artefactos derivados:
    manifest: ~/.buffy/layout.json
    índice:   ~/ai-context/README.md

## Descubrimiento de Buffy

Buffy se distribuye como una unidad compuesta de dos repositorios
independientes: Next (entorno vivo) y Context (memoria, opcional).
Este índice proporciona ubicaciones verificadas para los archivos
canónicos que el agente necesita para descubrir y consumir Buffy.

Repositorio fuente (Buffy Next):
    __NEXT__

Buffy Context:
    __CONTEXT__

Contrato compacto — leer primero:
    __COMPACT__

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
