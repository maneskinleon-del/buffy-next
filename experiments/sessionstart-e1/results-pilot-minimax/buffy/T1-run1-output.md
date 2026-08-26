Ignoring --allowedTools rule "/proc/*)": Wildcard tool name "/proc/*)" is not supported in allow rules. An allow pattern must name the scope it widens — globs are permitted only in the tool position after a literal mcp__<server>__ prefix. Deny and ask rules accept wildcards anywhere.
"minimax/minimax-m3:free" is not a model this version of Claude Code recognizes, so auto-compact will keep this session within 200k tokens (the context window it assumes). If the model accepts more, append [1m] to the model name for 1M, or set CLAUDE_CODE_MAX_CONTEXT_TOKENS to its real window; to make it recognized, map it in the modelOverrides setting or update Claude Code; CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 restores the previous wait-for-the-API behavior.
[claude-code:unrecognized_model] {"model":"minimax/minimax-m3:free","query_source":"sdk"}
El sandbox del entorno está bloqueando la mayoría de las rutas del sistema (`/sys`, `/proc`, `/usr/bin`, find sobre `/`, sudo). Solo me ha dejado ejecutar `lspci` y `uname -a`. Con la evidencia de que dispongo, puedo responder igualmente, pero conviene que sepas qué no he podido verificar.

## Hardware

`lspci -nn` reporta un único controlador de vídeo:

```
07:00.0 VGA compatible controller [0300]:
  Advanced Micro Devices, Inc. [AMD/ATI]
  Picasso/Raven 2 [Radeon Vega Series / Radeon Vega Mobile Series]
  [1002:15d8] (rev c8)
```

Es decir, una **APU AMD Picasso / Raven 2** (familia Ryzen con gráficos integrados Vega). El ID de dispositivo `0x15d8` y el nombre "Radeon Vega Series" corresponden a la iGPU de CPUs como Ryzen 3 2200G / Ryzen 5 2400G (Raven Ridge). El nombre de host `sabrewulf-a320ms2h` (A320M-S2H, Gigabyte) encaja con ese tipo de plataforma AM4.

## ¿Driver genérico o específico?

**No puedo afirmarlo con total certeza** desde este entorno, porque cada intento de leer el driver del kernel en uso ha sido bloqueado por el sandbox (`/sys/class/drm/...`, `lsmod`, `sudo`, `glxinfo`). Lo que sí sabemos con la evidencia disponible es lo siguiente, y **lo que NO sabría por ese motivo**:

- La **identidad del hardware es inequívoca**: el PCI ID `1002:15d8` es específico de Raven/Picasso. En Linux existen dos drivers in‑kernel capaces de manejarlo: el específico **`amdgpu`** (KMS + GFX, soporta DC, vulkan, etc.) y el antiguo **`radeon`** (más conservador, sin DC). Ambos son específicos de AMD — no son "vesa" ni "fbdev" genéricos.
- No hay otro fabricante de GPU en la salida de `lspci` (sin NVIDIA, sin Intel iGPU dedicada, sin "VGA compatible controller" adicional), por lo que esta APU es la única candidata.

**Conclusión honesta**: por hardware (PCI ID 1002:15d8) y por la práctica habitual de las distros modernas en 2026, lo esperable es que el driver en uso sea **`amdgpu`** (específico para esta familia) y no un driver genérico tipo `vesa`/`fbdev`. Pero **no he podido verificarlo leyendo `/sys/class/drm/card*/device/driver` ni `lsmod` ni `glxinfo`** porque esas rutas/comandos están bloqueados por el sandbox de la sesión, y por tanto no puedo darte la prueba directa. Si quieres, ejecuta tú cualquiera de estos y te confirmo el driver exacto:

- `cat /sys/class/drm/card0/device/driver/module/drivers`
- `lsmod | grep -E 'amdgpu|radeon'`
- `glxinfo | grep -E 'OpenGL vendor|OpenGL renderer|driver string'`
- `loginctl show-seat seat0 -p ActiveSessionId` y luego `cat /proc/$(loginctl show-seat seat0 -p ActiveSessionId | cut -d= -f2)/status | grep Driver` (no, el driver de GPU no vive por proceso; mejor la primera).
