// Buffy Next — Adapter Factory
// Detects the current platform and returns the appropriate adapter

import type { PlatformAdapter } from '../core/types.js';
import { WindowsAdapter } from './windows.js';
import { AndroidTermuxAdapter } from './android.js';
import { LinuxAdapter } from './linux.js';
// Legacy alias for old code that imports AndroidTermuxAdapter from this path
export { AndroidTermuxAdapter } from './android.js';

/**
 * Detect platform from env vars and process.platform.
 * Accepts optional `env` and `platform` overrides for deterministic testing.
 */
export function detectPlatform(
  env?: Record<string, string | undefined>,
  platform?: string,
): 'windows' | 'android-termux' | 'linux' | 'unknown' {
  const os = platform ?? process.platform;
  const e = env ?? process.env;

  // Windows
  if (os === 'win32') return 'windows';

  // Linux (covers both desktop Linux and Android/Termux)
  if (os === 'linux') {
    // Termux detection — these are definitive Termux indicators
    const isTermux = !!e.TERMUX_VERSION
      || !!e.TERMUX_APP_PACKAGE_MANAGER
      || e.PREFIX?.includes('com.termux')
      || e.HOME?.includes('com.termux')
      || e.PREFIX?.includes('/data/data/com.termux');

    if (isTermux) return 'android-termux';

    // Android detection — requires BOTH ANDROID_ROOT=/system AND ANDROID_DATA=/data
    // Single indicators (ANDROID_HOME, SERIAL, standalone ANDROID_ROOT) are NOT sufficient
    // because they appear in desktop Linux environments with ADB installed.
    const isAndroid = e.ANDROID_ROOT === '/system'
      && e.ANDROID_DATA === '/data';

    if (isAndroid) return 'android-termux';

    // Pure Linux desktop — Phase 2
    return 'linux';
  }

  return 'unknown';
}

/**
 * Create the appropriate adapter for the current platform.
 * Throws if the platform is not supported.
 */
export async function createAdapter(): Promise<PlatformAdapter> {
  const platform = detectPlatform();

  switch (platform) {
    case 'windows':
      return new WindowsAdapter();

    case 'android-termux':
      return new AndroidTermuxAdapter();

    case 'linux':
      return new LinuxAdapter();

    case 'unknown':
    default:
      throw new Error(
        `Plataforma no soportada: ${process.platform}. `
        + `Buffy Next soporta Windows (PowerShell) y Android/Termux (bash).`,
      );
  }
}
