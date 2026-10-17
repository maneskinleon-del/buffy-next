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

/**
 * Result of a captured subprocess execution.
 * Used by MCP tools that need to inspect script output programmatically
 * rather than streaming it to the terminal.
 */
export interface CapturedResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/*
 * ── execCtxCaptured: captured execution for the MCP tool boundary ──────────
 *
 * POR QUÉ NO REUSA execCtx (future-fusion guard — este comentario previene
 * la regresión de un "refactor de limpieza" que unifique ambas funciones):
 *
 * 1. stdio: 'inherit'  vs  stdio: 'pipe'
 *    execCtx usa stdio: 'inherit' — la salida del script fluye DIRECTAMENTE al
 *    terminal del proceso padre. Para herramientas MCP necesitamos CAPTURAR
 *    stdout/stderr para devolverlos como contenido de la tool (el protocolo
 *    MCP responde con el output, no lo escribe al terminal del agente).
 *    Con 'inherit' no podríamos leer la salida en JavaScript. Cambiar execCtx
 *    a 'pipe' rompería la pass-through verificada por ctx-env.test.ts
 *    (stdout del script fluye sin mediación → Ajuste 3b del operador).
 *    Son contratos de I/O fundamentalmente distintos; no es un "modo extra".
 *
 * 2. Signal forwarding  vs  no signal forwarding
 *    execCtx instala listeners SIGINT/SIGTERM que propagan la señal al grupo
 *    de procesos del hijo y luego llaman process.exit(). Correcto para la CLI
 *    interactiva: Ctrl+C debe terminar el script y su salida. Pero en el
 *    canal MCP, el ciclo de vida del server lo gestiona el proceso padre (el
 *    agente/herramienta que habla JSON-RPC por stdio). Si execCtxCaptured
 *    reenviara señales y llamara process.exit(), moriría al server MCP entero,
 *    no solo al subprocess. El forward de señales es un leak de capa CLI → MCP.
 *
 * 3. Timeout
 *    execCtx no impone límite de tiempo. Para la CLI es aceptable — el usuario
 *    espera o interrumpe manualmente. Pero una tool MCP bloqueada indefinidamente
 *    (ej. buffy-verify.sh haciendo network lento, o un hang en facts_engine)
 *    colgaría al agente llamador sin recovery. MCP implica bounded execution;
 *    30s es el default razonado en el planning (ver D1-MCP-003).
 *
 * 4. Tipo de retorno
 *    execCtx devuelve Promise<number> (solo exit code). execCtxCaptured devuelve
 *    Promise<CapturedResult> con {code, stdout, stderr, timedOut}. La estructura
 *    es incompatible — un caller de MCP no necesita ni señales ni exit-code-only.
 *
 * Si en el futuro execCtx evoluciona para soportar captura + timeout, usar un
 * flag EXPLÍCITO (ej. { capture: true, timeoutMs }) — NUNCA heredar el
 * signal-forwarding + process.exit de la CLI en el canal MCP.
 */
export async function execCtxCaptured(
  cmd: string,
  args: string[],
  timeoutMs: number = 30000,
): Promise<CapturedResult> {
  const script = resolveScriptPath(cmd);
  if (!script) {
    return {
      code: 1,
      stdout: '',
      stderr: `ctx: nombre de comando inválido: "${cmd}"`,
      timedOut: false,
    };
  }
  if (!existsSync(script)) {
    return {
      code: 1,
      stdout: '',
      stderr:
        `ctx: script no encontrado: ${script}\n` +
        '¿Está clonado buffy-context en la ruta esperada? Diagnóstico: buffy env',
      timedOut: false,
    };
  }

  return new Promise((resolve) => {
    const child = spawn('bash', [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'], // stdin:ignore, stdout/stderr: capturados
      cwd: resolveContextRepo(),
      // NOT detached: MCP server owns the process tree; no signal forwarding.
      // (Ver comentario expositivo arriba — este es el boundary CLI → MCP.)
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: stderr + `ctx: fallo al ejecutar ${script}: ${err.message}`,
        timedOut: false,
      });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL'); // SIGKILL: no graceful fallback on timeout
      } catch {
        /* already dead */
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}
