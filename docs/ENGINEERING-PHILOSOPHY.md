# Engineering Philosophy — Buffy Next

> Baseline: `31ec9d6` · 492 tests · typecheck 0 · CI green · 3 platforms

---

## Principios

### 1. La complejidad debe ser proporcional a la tarea

Soluciones pequeñas para problemas pequeños. Arquitectura adicional solo cuando la evidencia la justifica. No crear capas preventivas para problemas hipotéticos.

Si un problema se resuelve con 5 líneas, no diseñar 50.

### 2. Nunca aplicar un fix sobre una hipótesis sin instrumentar primero

```
hipótesis → instrumentación → evidencia → confirmar/descartar → fix mínimo
```

No asumir la causa de un bug. Medir primero. El 80% de los problemas en plataformas complejas (Android/HyperOS, drivers, permisos) son causas simples que no requieren arquitectura nueva.

### 3. La evidencia debe preceder al cambio

No tratar inferencias como hechos. Tipos de evidencia, en orden de confiabilidad:

1. **Ejecución en hardware real** — el.gold standard
2. **CI automatizado** — reproduce el entorno controlado
3. **Tests unitarios** — verifican contratos de interfaces
4. **Inspección de código** — verifica lógica estática
5. **Inferencia** — la menos confiable, nunca suficiente sola

### 4. Una deuda técnica no es un blocker hasta que la evidencia demuestra que bloquea

El dual registry de Buffy Next parecía bloquear el desarrollo. Las 3 features siguientes (`check-network`, Linux actions, `check-disk-space`) se implementaron sin refactorizarlo. Pasó de BLOCKER a TECHNICAL DEBT.

No refactorizar por preventiva. Refactorizar cuando la evidencia muestra que una feature no puede implementarse limpia.

### 5. Una feature vertical completa vale más que una arquitectura hipotética completa

```
FEATURE → MÍNIMO CAMBIO → TEST → HARDWARE → CI → SHIP
```

El objetivo es completar un ciclo observable de producto antes de ampliar la arquitectura. Una feature que funciona end-to-end demuestra más que un diseño perfecto no implementado.

---

## Regla de escalamiento

**NO** aumentar complejidad porque "podría ser necesario".

Aumentarla solamente cuando:

1. Existe un problema real
2. Está instrumentado
3. Reproducido
4. El cambio mínimo no es suficiente
5. La nueva arquitectura resuelve el problema demostrado

---

## Definición de "DONE"

Una feature está terminada solamente cuando:

- [ ] Implementación mínima
- [ ] Tests pasan
- [ ] Typecheck limpio
- [ ] Build produce dist
- [ ] Hardware real validado (cuando corresponda)
- [ ] CI verde
- [ ] Commit
- [ ] Push
- [ ] HEAD remoto confirmado

No declarar "done" por código escrito solamente.

---

## Casos reales

### Node 26 + Android (`6ce62ed`)

`process.platform` devolvía `"android"` en Node 26 — Behavior Change documentado. Primero se observó con un test inline, después se corrigió `detectPlatform()`. Fix mínimo: 1 línea.

### Shizuku / `RISH_APPLICATION_ID`

No asumir que era bug de Buffy. Se probó:

- `unset RISH_APPLICATION_ID` → falla
- `com.termux` → funciona
- Fallback interno de Buffy → funciona

Conclusión: el problema era del entorno, no del código.

### `capabilities()` fake "active" (`ec7311f`)

Parecía un problema funcional. La auditoría demostró que `checkPrerequisites()` usa `detectPrivileges()` (prueba funcional real), no el status informativo de `capabilities()`. Fix mínimo: eliminar `|| echo active`.

### Dual registry

Parecía blocker. Las features posteriores demostraron que no bloqueaba:

- `check-network` → implementada sin refactor
- Linux actions → implementadas sin refactor
- `check-disk-space` → implementada sin refactor

El dual registry sigue existiendo como deuda técnica. No se refactorizará hasta que la evidencia lo justifique.
