# Frente D — Conclusión corregida

## Condición inicial
- Dos procesos ejecutan simultáneamente operaciones de lectura-modificación-escritura sobre el mismo archivo de estado.
- Cada worker lee el archivo, incrementa un contador y lo reescribe.
- Se comparan dos variantes: escritura directa y escritura atómica (temporal + rename).

## Comandos ejecutados
- Script: `ai-context/research/execution-journal-phase1/frente-d-concurrencia.js`
- Ejecución: `node ai-context/research/execution-journal-phase1/frente-d-concurrencia.js`
- Entorno: directorio temporal aislado bajo `/tmp/comms-d-<hash>`, sin modificar código productivo.

## Resultados
- **Escritura directa:** counter final = 50 / esperado 100. Pérdidas confirmadas.
- **Escritura atómica (temporal + rename):** counter final = 52 / esperado 100. Pérdidas confirmadas.
- En ambas variantes se perden actualizaciones bajo concurrencia real.

## Conclusión
- La atomicidad del reemplazo evita truncamiento, pero **no** garantiza exclusión mutua.
- No presentar atomicidad y exclusión mutua como equivalentes.
- Para evitar actualizaciones perdidas se necesita un mecanismo adicional de serialización (ej. lock de archivo), que el Frente C ya validó como diseño viable.
- Este frente queda cerrado con la evidencia reproducible requerida por el usuario, sin como evidencia de concurrencia o integridad los experimentos anteriores.

## Archivos generados
- `frente-d-concurrencia.js`
- `estado-frente-d.md`
- directorio temporal `/tmp/comms-d-*` removido al finalizar la ejecución del script.
