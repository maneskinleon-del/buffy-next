# Protocolo de Trabajo - Buffy Next

## Protocolo común para agentes
1. **Leer** `README.md`
2. **Leer** `CONTINUE.md` 
3. **Revisar** estado Git (`git status`, `git branch -a`, `git log --oneline -1`)
4. **Leer** documentación relevante para la tarea
5. **Formular** observación e hipótesis
6. **Ejecutar prueba** antes de cambiar código cuando corresponda
7. **Aplicar** cambio mínimo
8. **Validar** (tests, typecheck)
9. **Registrar** evidencia
10. **Actualizar** `CONTINUE.md` si hay cambios significativos

## Diagnóstico inicial
```bash
git status --short
git log --oneline -1
git branch -a
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | tail -5
```

## Principios
- **Evidencia > afirmaciones**
- **Integridad > disponibilidad**
- **Cambio mínimo > rediseño**
- **Recuperación conservadora > automatización peligrosa**
- **Compatibilidad > nuevas abstracciones**

## Reglas críticas
- ActionGate es la ÚNICA puerta de ejecución de efectos físicos
- Nunca liberar claim si journal no se persiste
- Nunca sobrescribir silenciosamente state.json corrupto
- Nunca eliminar locks abandonados automáticamente
- Mantener semántica de 7 niveles de evidencia
- No hacer commit/push/merge/deploy sin autorización
- No modificar buffy-context desde buffy-next

## Validación
Antes de dar por terminada una tarea:
- `npm test` debe pasar
- `npx tsc --noEmit` debe pasar
- Revisar estado Git
- Verificar que no hay regresiones
- Documentar cambios si es relevante
