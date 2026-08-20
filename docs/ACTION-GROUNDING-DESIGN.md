# Action Grounding — Design v0.7

> Estado: **Diseño** (no implementar todavía)
> Baseline: v0.6 (`0cf0014`) — 96% correct, 2% over-selection, 78% recall

## Cambio de fase

```text
v0.5-B/v0.6: ¿QUÉ checks seleccionar?
v0.7:        ¿CÓMO convertir resultados en acciones utilizables?
```

El caso de Killian demostró que Buffy puede diagnosticar correctamente pero producir
recomendaciones que un usuario real no sabe ejecutar.

```text
Inference: "GPU/CPU pueden estar limitando el rendimiento"
Action:    "baja Graphics Quality"
❌ demasiado abstracto para un usuario básico
```

Una respuesta operativa debería ser:

```text
Abre Roblox → entra a cualquier juego → pulsa Esc
→ Settings → Graphics Mode → Manual
→ Graphics Quality → mueve la barra hacia la izquierda
```

## Pregunta central

> ¿Puede Buffy convertir un diagnóstico técnico correcto en instrucciones
> que una persona no técnica pueda ejecutar, sin inventar pasos que no puede verificar?

## Los 3 pilares de v0.7

### Pilar 1: Action Grounding

Cada recomendación debe estar vinculada a una cadena completa:

```text
observed     → qué medimos (datos del adapter)
inferred     → qué conclusiones sacamos (con evidencia)
recommended  → qué queremos cambiar (acción de alto nivel)
instruction  → cómo hacerlo (pasos concretos y verificables)
```

**Regla:** Si no existen `instruction` steps verificables, la acción queda
como `recommended` con confianza baja. No se inventan instrucciones.

**Ejemplo:**

```text
observed:    CPU usage 85%, Chrome using 4GB RAM
inferred:    Browser consuming excessive resources
recommended: Close unused Chrome tabs
instruction: [
  "Abre Chrome",
  "Haz clic en el icono de pestañas (arriba a la derecha)",
  "Cierra las pestañas que no estés usando",
  "Alternativa: presiona Shift+Esc para abrir el administrador de tareas de Chrome"
]
confidence:  high  (instrucciones verificadas para Windows/Linux/Android)
```

### Pilar 2: Platform/UI Awareness

Las instrucciones deben ser **específicas para la plataforma detectada**.

```text
PlatformAdapter.name
  → Windows: PowerShell, Settings UI, Registry
  → Linux:   bash, desktop settings, systemd
  → Android: ADB, Shizuku, system settings
```

**Cada instrucción debe incluir:**
- `platform`: para qué plataforma aplica
- `ui_path`: ruta de navegación en UI (si aplica)
- `command`: comando alternativo (si aplica)
- `requires`: prerequisite (admin, root, shizuku, etc.)

**Ejemplo:**

```json
{
  "action": "close-unused-tabs",
  "platforms": ["windows", "linux", "android-termux"],
  "instructions": {
    "windows": {
      "ui_path": "Chrome → Shift+Esc → cerrar pestañas",
      "command": null,
      "requires": []
    },
    "linux": {
      "ui_path": "Chrome → Shift+Esc → cerrar pestañas",
      "command": null,
      "requires": []
    },
    "android-termux": {
      "ui_path": null,
      "command": "am force-stop com.android.chrome",
      "requires": ["adb"]
    }
  }
}
```

### Pilar 3: Confidence + Instruction Status

Cada elemento de la cadena tiene su propio nivel de confianza.

La confianza **controla la salida** — no es solo metadata:

```text
high    → "Haz esto"
medium  → "Puedes probar esto"
low     → "Podría estar relacionado; no tengo suficiente evidencia"
none    → "No tengo instrucciones verificadas para este caso"
```

**InstructionStatus** (nuevo tipo explícito):

```typescript
type InstructionStatus =
  | 'verified'    // Pasos verificados para esta plataforma
  | 'partial'     // Pasos genéricos o parcialmente verificados
  | 'unsupported'; // Sin pasos verificados — NO inventar
```

**Importante:** `confidence: low` y `instruction: unsupported` no significan lo mismo.

```text
confidence low + instruction verified
→ "No estoy seguro de que esta sea la solución,
   pero sí sé cómo ejecutar la acción"

instruction unsupported
→ "Ni siquiera tenemos un procedimiento verificado"
```

Esto garantiza **invention rate = 0%**:
- `verified` → mostrar pasos
- `partial` → mostrar con caveat
- `unsupported` → NO mostrar pasos, solo acción recomendada

## Arquitectura propuesta

```
diagnostic result (v0.5-B/v0.6)
  │
  ▼
[1] Action Mapper              ← checked → recommended action
  │
  ▼
[2] Instruction Resolver       ← recommended → platform-specific steps
  │
  ▼
[3] Confidence Evaluator       ← asigna confidence a cada nivel
  │
  ▼
[4] Presenter                  ← formatea para el usuario
```

### Capa 1: Action Mapper

Toma los `CheckResult` del diagnóstico y los convierte en `RecommendedAction`.

```typescript
interface RecommendedAction {
  id: string;
  /** What we observed (from diagnosis) */
  observed: string;
  /** What we infer (with evidence) */
  inferred: string;
  /** What we recommend (high-level) */
  recommended: string;
  /** Platform-specific instructions */
  instructions: PlatformInstructions;
  /** Confidence in this recommendation */
  confidence: Confidence;
}
```

### Capa 2: Instruction Resolver

Para cada `RecommendedAction`, resuelve instrucciones específicas
para la plataforma detectada.

```typescript
interface PlatformInstructions {
  platform: PlatformName;
  /** UI navigation path (if applicable) */
  ui_path: string | null;
  /** CLI command (if applicable) */
  command: string | null;
  /** Prerequisites */
  requires: string[];
  /** Verification status — controls output behavior */
  status: InstructionStatus;
}
```

### Capa 3: Confidence Evaluator

Asigna confidence a cada nivel de la cadena:

```typescript
function evaluateConfidence(
  observed: CheckResult[],
  inferred: string,
  instruction: PlatformInstructions,
): Confidence {
  // observed is always high (from adapter)
  // inferred is medium (based on evidence)
  // instruction depends on verification
  if (instruction.verified) return 'high';
  if (instruction.ui_path || instruction.command) return 'medium';
  return 'low';
}
```

### Capa 4: Presenter

Formatea la respuesta para el usuario:

```text
🔍 Diagnosticado:
   CPU: 85% de uso (medido)

💡 Inferencia:
   Chrome está consumiendo demasiados recursos

🎯 Recomendación:
   Cierra pestañas de Chrome que no estés usando

📋 Pasos:
   1. Abre Chrome
   2. Presiona Shift+Esc
   3. Cierra las pestañas con más uso de CPU

   (Instrucciones verificadas para Linux)
```

## Benchmark de usuario real

### Caso de Killian (golden test #1)

```text
Input:    "Roblox tiene lag"
Platform: Windows
Observed: CPU/RAM/GPU/processes
Inference: possible performance bottleneck
Action:    adjust Roblox graphics
Instruction: ???
```

v0.7 debe distinguir:
```text
Tengo pasos verificados  → los entrego
No tengo pasos verificados → NO INVENTO
```

Este caso es el test principal porque precisamente mostró el problema real:
Buffy diagnosticó correctamente pero produjo instrucciones que el usuario
no sabía ejecutar.

### 10-20 escenarios objetivo

| # | Platform | Query | Diagnostic | Expected Instruction Quality |
|---|----------|-------|------------|------------------------------|
| 1 | Windows | "Roblox va lento" | CPU/GPU bottleneck | Specific: settings path in Roblox |
| 2 | Windows | "mi PC se calienta" | Temp 85°C | Specific: dust cleaning, fan check |
| 3 | Windows | "no tengo espacio" | Disk 95% full | Specific: disk cleanup steps |
| 4 | Linux | "va lento después de actualizar" | RAM 90% | Specific: clear cache, check services |
| 5 | Linux | "el wifi se desconecta" | Network unstable | Specific: restart NetworkManager |
| 6 | Android | "se traba cuando juego" | Thermal throttle | Specific: close background apps |
| 7 | Android | "no funciona Shizuku" | Shizuku not running | Specific: restart via ADB |
| 8 | Windows | "Chrome va lento" | Too many tabs | Specific: Shift+Esc, close tabs |
| 9 | Linux | "el mouse se mueve solo" | (ambiguous) | No instruction — report ambiguity |
| 10 | Windows | "antes andaba mejor" | (vague) | Generic: run diagnostics |

### Métricas nuevas

| Métrica | Descripción | Target |
|---------|-------------|--------|
| **Diagnostic correctness** | ¿El diagnóstico es correcto? | ≥96% (v0.6 baseline) |
| **Action correctness** | ¿La acción recomendada es apropiada? | ≥90% |
| **Instruction completeness** | ¿Los pasos cubren la acción completa? | ≥80% |
| **Instruction executability** | ¿Un usuario no técnico puede ejecutarlos? | ≥70% |
| **Unsupported-action rate** | ¿Cuántas acciones no tienen instrucciones? | ≤20% |
| **Invention rate** | ¿Buffy inventó pasos falsos? | 0% |
| **Platform accuracy** | ¿Las instrucciones son para la plataforma correcta? | 100% |

### Gates de aceptación

```text
G1: No regression en selector v0.5-B (92%)
G2: No regression en scoring v0.6 (96%)
G3: Action correctness ≥ 90%
G4: Instruction completeness ≥ 80%
G5: Instruction executability ≥ 70%
G6: Unsupported-action rate ≤ 20%
G7: Invention rate = 0% (CRÍTICO)
G8: Platform accuracy = 100%
G9: Confidence levels present en cada recomendación
G10: 10+ escenarios de benchmark pasan
```

## Decisiones de diseño (resueltas)

### D4: Action Mapper → **Función separada**

```typescript
function mapActions(
  diagnostic: DiagnosticResult,
  platform: PlatformName,
): RecommendedAction[]
```

Igual que `scoreContext()` en v0.6: capa separada que se llama después del diagnóstico.
Permite probarlo aisladamente y evita contaminar el core diagnóstico.

### D5: Instrucciones → **Hardcoded primero**

Instrucciones hardcoded por plataforma + acción. Sin LLM.

Para una acción conocida:
```text
Windows + high CPU
→ action: inspect_processes
→ instruction: PowerShell conocida
```

Un LLM podría redactar instrucciones en el futuro, pero no debe ser
la fuente de verdad de una acción operativa.

Medir `unsupported-action rate`. Si es >30%, considerar híbrido.

### D6: Confidence → **Afecta el output**

La confianza controla qué se muestra al usuario:

```text
high    → "Haz esto" + pasos completos
medium  → "Puedes probar esto" + pasos con caveat
low     → "Podría estar relacionado" + pasos parciales
none    → "No tengo instrucciones" + solo acción recomendada
```

`instruction: unsupported` → NO mostrar pasos. Preferible a inventar.

## Scope de v0.7

### In scope

- [ ] Action Mapper (CheckResult → RecommendedAction)
- [ ] Instruction Resolver (platform-specific steps)
- [ ] Confidence Evaluator (observed/inferred/recommended/instruction)
- [ ] Presenter (formatted output with confidence)
- [ ] 10-20 escenarios de benchmark
- [ ] Golden case de Killian como test principal

### Out of scope (candidatos para v0.8+)

- LLM-generated instructions
- Dynamic instruction discovery
- Multi-step action execution
- Undo/rollback for actions
- User feedback loop
- Session learning

## Regla metodológica

> **v0.7 no debe inventar instrucciones que no puede verificar.**
>
> Si no existen pasos conocidos para una acción en una plataforma,
> la respuesta correcta es:
>
> "No tengo instrucciones específicas para este caso en tu plataforma.
> La acción recomendada es [X], pero no puedo guiarte paso a paso."
>
> Esto es preferible a inventar pasos incorrectos que confundan al usuario.

## Referencias

- v0.5-B baseline: commit `9a49408`
- v0.6 baseline: commit `0cf0014`
- Benchmark selector: `experiments/check-selector-benchmark.ts`
- Caso de Killian: sesión 2026-08-20 (Roblox + Windows)
