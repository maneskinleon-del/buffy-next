// Buffy Next — Context delegator (PR5, 2026-09-27)
//
// Boundary contract (C1=c, ajustes 1-3 del operador):
// Next conoce exactamente tres cosas de Context: la ubicación del repo
// (resoluble vía BUFFY_CONTEXT_REPO), la convención de nombres de scripts
// (scripts/buffy-<cmd>.sh) y el passthrough de streams/exit codes.
// NO conoce la lista de subcomandos (discovery por filesystem — Ajuste 2),
// el contenido de sus archivos, ni su estado.
//
// EXCEPCIÓN DOCUMENTADA: leer <repo>/VERSION. Es metadata de topología para
// `buffy env` (diagnóstico R3: versionado cruzado). Ausencia → null honesto,
// nunca inventado. Ningún otro archivo de Context se lee.
//
// Errores: nombran la capa (R2) y fallan explícito (R4).

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

/**
 * Nombre válido de comando ctx. Rechaza path traversal (`../`), separadores
 * y caracteres de inyección ANTES de interpolar en una ruta (H1b lesson:
 * validar el token, no confiar en el formato del caller).
 */
const CMD_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Repo de Context (Ajuste 1): "REPO", no "HOME" — BUFFY_HOME ya existe en
 * Context con otra semántica (estado generado en ~/.buffy). Dos nombres que
 * parecen uno es el patrón H1; REPO es preciso: es la ubicación del checkout.
 */
export function resolveContextRepo(): string {
  return process.env.BUFFY_CONTEXT_REPO || join(homedir(), 'buffy-context');
}

/** Ruta al script de Context para `cmd`, o null si el nombre es inválido. */
export function resolveScriptPath(cmd: string): string | null {
  if (!CMD_NAME_RE.test(cmd)) return null;
  return join(resolveContextRepo(), 'scripts', `buffy-${cmd}.sh`);
}

/**
 * Descubre comandos disponibles por filesystem (Ajuste 2): Context puede
 * agregar scripts sin tocar Next. Solo nombres válidos según CMD_NAME_RE.
 */
export function listCtxCommands(): string[] {
  const dir = join(resolveContextRepo(), 'scripts');
  if (!existsSync(dir)) return [];
  const prefix = 'buffy-';
  const suffix = '.sh';
  return readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith(suffix))
    .map(f => f.slice(prefix.length, f.length - suffix.length))
    .filter(name => CMD_NAME_RE.test(name))
    .sort();
}

/** Versión de Context (VERSION en la raíz del repo) — null si no existe. */
export function readContextVersion(): string | null {
  try {
    const v = readFileSync(join(resolveContextRepo(), 'VERSION'), 'utf-8').trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Topología de instalación — insumo de `buffy env` (diagnóstico R3). */
export function contextEnvInfo(): {
  repo: string;
  present: boolean;
  version: string | null;
  commands: string[];
} {
  const repo = resolveContextRepo();
  return {
    repo,
    present: existsSync(repo),
    version: readContextVersion(),
    commands: listCtxCommands(),
  };
}

/**
 * Ejecuta un script de Context como subprocess (frontera única entre Next
 * y Context). Pass-through estricto:
 *  - args van VERBATIM al script (incluidos flags como --json — el
 *    delegador nunca reinterpreta; ver test de args verbatim).
 *  - stdio inherit: stdout/stderr del script fluyen sin mediación.
 *  - CWD = repo root: los scripts de Context lo asumen (CONFIRMADO en
 *    set-version.sh: REPO_ROOT y rutas relativas ai-context/).
 *  - exit code del script = return value, sin reinterpretación.
 *
 * Señales (pregunta del operador, Q2): si el PADRE recibe SIGINT/SIGTERM
 * (kill programático de un runtime tipo Herdr — no Ctrl+C de TTY, que ya
 * alcanza a ambos procesos por process group), el signal se FORWARDEA al
 * hijo antes de salir. Sin esto, un kill al padre deja al hijo huérfano.
 */
export async function execCtx(cmd: string, args: string[]): Promise<number> {
  const script = resolveScriptPath(cmd);
  if (!script) {
    console.error(`ctx: nombre de comando inválido: "${cmd}"`);
    return 1;
  }
  if (!existsSync(script)) {
    console.error(`ctx: script no encontrado: ${script}`);
    console.error('¿Está clonado buffy-context en la ruta esperada? Diagnóstico: buffy env');
    return 1;
  }

  const child = spawn('bash', [script, ...args], {
    stdio: 'inherit',
    cwd: resolveContextRepo(),
    // Grupo de procesos propio: permite forward de señales AL GRUPO
    // (kill -pid), alcanzando también a los nietos del script (p.ej. el
    // `sleep` de un bash). Sin esto, un kill programático al padre deja
    // huérfanos a los procesos internos del script.
    detached: true,
  });

  let signaled = false;
  const forward = (sig: NodeJS.Signals, exitCode: number) => {
    if (signaled) return;
    signaled = true;
    try {
      process.kill(-child.pid!, sig); // al grupo completo (hijo + nietos)
    } catch {
      try { child.kill(sig); } catch { /* el hijo ya murió */ }
    }
    process.exit(exitCode);
  };
  const onInt = () => forward('SIGINT', 130);
  const onTerm = () => forward('SIGTERM', 143);
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);

  return new Promise((resolve) => {
    child.on('error', (err) => {
      process.removeListener('SIGINT', onInt);
      process.removeListener('SIGTERM', onTerm);
      console.error(`ctx: fallo al ejecutar ${script}: ${err.message}`);
      resolve(1);
    });
    child.on('close', (code) => {
      process.removeListener('SIGINT', onInt);
      process.removeListener('SIGTERM', onTerm);
      resolve(code ?? 1);
    });
  });
}
