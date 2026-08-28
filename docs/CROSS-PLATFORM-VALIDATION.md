# Buffy Next — Cross-Platform Validation

## Estado: ✅ COMPLETADO

**Fecha:** 2026-08-28
**Tests:** 556/556
**Plataformas validadas:** Linux, Windows, Android/Termux

---

## Arquitectura validada

```
Task-adaptive
+ Freshness Contract
+ Freshness Gating
+ Compact
+ On-demand refresh
```

---

## Resultados por plataforma

### Linux

| Campo | Source | Status |
|-------|--------|--------|
| CPU | /proc/cpuinfo | ✅ |
| RAM | /proc/meminfo | ✅ |
| GPU | lspci | ✅ |
| Temperature | /sys/class/thermal | ✅ |
| Storage | df | ✅ |
| Processes | ps aux | ✅ |
| OS | /etc/os-release | ✅ |
| Kernel | uname -r | ✅ |

### Windows

| Campo | Source | Status |
|-------|--------|--------|
| CPU | Win32_Processor (WMI) | ✅ |
| RAM | Win32_OperatingSystem (WMI) | ✅ |
| GPU | Win32_VideoController (WMI) | ✅ |
| Temperature | MSAcpi_ThermalZoneTemperature | ✅ |
| Storage | Win32_LogicalDisk (WMI) | ✅ |
| Processes | Win32_Process (WMI) | ✅ |
| OS | Win32_OperatingSystem (WMI) | ✅ |
| Kernel | N/A (Windows) | ✅ |

### Android/Termux

| Campo | Source | Status |
|-------|--------|--------|
| CPU | /proc/cpuinfo | ✅ |
| RAM | /proc/meminfo | ✅ |
| GPU | dumpsys SurfaceFlinger | ✅ |
| Temperature | /sys/class/thermal | ✅ |
| Storage | df /data | ✅ |
| Processes | ps -A | ✅ |
| OS | getprop | ✅ |
| Kernel | N/A (Android) | ✅ |

---

## Tabla de comparación

| Campo | Linux | Windows | Android | Resultado |
|-------|-------|---------|---------|-----------|
| CPU | ✅ | ✅ | ✅ | EXPECTED |
| RAM | ✅ | ✅ | ✅ | EXPECTED |
| GPU | ✅ | ✅ | ✅ | EXPECTED |
| Temperature | ✅ | ✅ | ✅ | EXPECTED |
| Storage | ✅ | ✅ | ✅ | EXPECTED |
| Processes | ✅ | ✅ | ✅ | EXPECTED |
| OS | ✅ | ✅ | ✅ | EXPECTED |
| Kernel | ✅ | N/A | N/A | EXPECTED |

---

## Freshness cross-platform

### Fresh

Todas las plataformas:
- `observedAt` presente
- `ageMs < 1000ms`
- `epistemicState = 'observed'`

### Stale

Todas las plataformas:
- `classifyEpistemicState()` retorna `'stale'` cuando `ageMs > maxAgeMs`
- Refresh on-demand funciona correctamente

### Unknown

Todas las plataformas:
- Datos no disponibles producen `severity: 'unknown'`
- No se fabrican valores

---

## Audit trail

Cada plataforma registra:
- `query`
- `selectedFields`
- `staleFields`
- `refreshRequired`
- `refreshPerformed`
- `toolCalls`
- `contextBytes`
- `latencyMs`
- `finalCorrect`
- `unsupportedClaims`

---

## Diferencias entre plataformas

| Diferencia | Clasificación |
|------------|---------------|
| Windows no tiene kernel info | EXPECTED |
| Android usa getprop en vez de /etc/os-release | EXPECTED |
| Windows temperatura puede no estar disponible | EXPECTED |
| Android GPU driver es "bundled" | EXPECTED |

---

## Tests

### Unit tests
- `tests/freshness.test.ts` — 12 tests
- `tests/freshness-gating.test.ts` — 11 tests

### Integration tests
- `tests/temporal-contract.test.ts` — 7 tests
- `tests/external-validation.test.ts` — 6 tests
- `tests/production-integration.test.ts` — 10 tests

### Cross-platform tests
- `tests/cross-platform-validation.test.ts` — 18 tests

### Total
```
30 suites / 556 tests / 0 fallos
```

---

## Criterio de PASS

✅ Todos los tests existentes pasan
✅ No stale relevante llega al modelo como actual
✅ Refresh success >= 95%
✅ UNKNOWN preservado correctamente
✅ observedAt/source presente
✅ No corrupción factual por plataforma

---

## Próximos pasos

1. ~~Cross-platform validation~~ ✅
2. MiniMax smoke test
3. Uso real con usuarios
4. Observabilidad y métricas de uso
