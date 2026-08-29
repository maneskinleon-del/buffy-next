# Versioning — Buffy Next

## Fuente única de verdad

```
package.json  →  "version": "X.Y.Z"
      ↓
src/core/version.ts  →  readPackageVersion()  (lee package.json en runtime)
      ↓
CLI / context / health / telemetry  →  BUFFY_VERSION
```

**Nunca hardcodear** la versión en source code. Siempre leer de `package.json` vía `version.ts`.

## Cómo se construye

```bash
npm run build   # esbuild: src/cli.ts → dist/cli.js
```

El bundle es autocontenido — `version.ts` busca `package.json` en ubicaciones candidatas (`../package.json` relativo al source empaquetado).

## Cómo se publica

1. Actualizar `package.json` → `"version": "X.Y.Z"`
2. Agregar entrada en `CHANGELOG.md` con fecha y cambios
3. `git commit`
4. `git tag vX.Y.Z`
5. `git push origin master --tags`

## Cómo verificar la versión runtime

```bash
buffy --version           # buffy-next vX.Y.Z
buffy health --json       # { "version": "X.Y.Z" }
buffy doctor --context    # { "buffy_version": "X.Y.Z" }
```

Todos deben reportar la misma versión.

## Versiones históricas

| Tag | Fecha | Cambio principal |
|---|---|---|
| v0.2.0-rc | 2026-08-18 | Release candidate — MVP |
| v0.2.1 | 2026-08-28 | Typecheck cleanup (10 errores TS) |
| v0.2.2 | 2026-08-28 | Onboarding — version.ts, --version flag, health |
