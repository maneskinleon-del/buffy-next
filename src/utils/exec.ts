// Buffy Next — Exec utility
// Safe command execution wrapper

import { execSync } from 'child_process';
import type { ExecOptions, ExecResult } from '../core/types.js';

export function runCommand(command: string, options?: ExecOptions): ExecResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: options?.timeout ?? 10000,
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
    });

    return {
      exitCode: 0,
      stdout: stdout.toString(),
      stderr: '',
      success: true,
    };
  } catch (error: any) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message,
      success: false,
    };
  }
}

export function runPowerShell(command: string, options?: ExecOptions): ExecResult {
  if (process.platform !== 'win32') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'PowerShell only available on Windows',
      success: false,
    };
  }

  const escaped = command.replace(/"/g, '\\"');
  return runCommand(`powershell -NoProfile -NonInteractive -Command "${escaped}"`, options);
}
