// Buffy Next — Action: Check Shizuku
// AUTO_SAFE: runs rish -c "id" to verify Shizuku is functional
// Read-only — no system modifications

import { execSync } from 'node:child_process';
import type { ActionDefinition } from '../../core/types.js';

export const checkShizuku: ActionDefinition = {
  id: 'check-shizuku',
  name: 'Verificar Shizuku',
  description: 'Ejecuta un comando read-only vía rish para confirmar que Shizuku está funcional',
  level: 'auto_safe',
  reversible: false,
  platforms: ['android-termux'],
  prerequisites: ['shizuku'],

  async dryRun() {
    const appId = process.env.RISH_APPLICATION_ID ?? 'com.termux';
    return `RISH_APPLICATION_ID=${appId} rish -c "id"`;
  },

  async execute() {
    try {
      const appId = process.env.RISH_APPLICATION_ID ?? 'com.termux';
      const result = execSync('rish -c "id"', {
        encoding: 'utf-8',
        timeout: 10_000,
        env: { ...process.env, RISH_APPLICATION_ID: appId },
      }).trim();

      // Parse uid from output: "uid=2000(shell) gid=2000(shell) ..."
      const uidMatch = result.match(/uid=(\d+)\(([^)]+)\)/);
      const uid = uidMatch?.[1] ?? 'unknown';
      const identity = uidMatch?.[2] ?? 'unknown';

      return {
        success: true,
        message: `Shizuku funcional — UID: ${uid} (${identity})`,
        details: {
          rawOutput: result,
          uid,
          identity,
          rishApplicationId: appId,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Shizuku no responde: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async verify() {
    try {
      const appId = process.env.RISH_APPLICATION_ID ?? 'com.termux';
      const result = execSync('rish -c "id"', {
        encoding: 'utf-8',
        timeout: 10_000,
        env: { ...process.env, RISH_APPLICATION_ID: appId },
      });
      return result.includes('uid=');
    } catch {
      return false;
    }
  },
};
