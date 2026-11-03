# Buffy Next - Contexto de Trabajo

## ¿Qué es Buffy?
Buffy es un asistente técnico de diagnóstico y asistencia para sistemas operativos. Proporciona capacidades de diagnóstico, ejecución controlada de acciones y seguimiento verificable de operaciones.

## Responsabilidades

### buffy-next (este repositorio)
- **Runtime**: Núcleo de ejecución y orquestación
- **Diagnóstico**: Detección de sistema, capacidades y estado
- **MCP**: Integración con Model Context Protocol
- **ActionGate**: Única puerta autorizada para ejecución de efectos físicos
- **Persistencia**: Gestión de estado y journaling
- **Journal**: Execution Journal para trazabilidad y recuperación
- **Evidencias**: Sistema de evidencia verificable
- **Herramientas operativas**: CLI y utilidades

### buffy-context (repositorio separado)
- **Contexto persistente**: Conocimiento acumulado entre sesiones
- **Skills reutilizables**: Habilidades y patrones
- **Documentación y continuidad**: Handoff entre agentes y sesiones
- **Conocimiento del sistema**: Información compartida

## Relación entre repositorios
`buffy-next` es el runtime ejecutable. `buffy-context` proporciona el contexto persistente y las skills. Ambos se complementan pero mantienen responsabilidades separadas - el runtime no debe duplicar el contexto persistente.

## Documentación principal
- [Execution Journal](architecture/execution-journal.md)
- [Protocolo de trabajo](operations/working-protocol.md)
- [Garantías críticas](testing/critical-guarantees.md)
- [Continuidad](CONTINUE.md)

## Comenzar una sesión de trabajo
1. Leer `CONTINUE.md` para entender el estado actual
2. Revisar estado Git (`git status`, `git log --oneline -1`)
3. Revisar documentación relevante para la tarea
4. Ejecutar pruebas si es necesario
5. Seguir el protocolo de trabajo establecido
