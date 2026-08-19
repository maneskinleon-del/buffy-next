// Buffy Next — Adapter Factory
// Detects the current platform and returns the appropriate adapter

import type { PlatformAdapter } from '../core/types.js';
import { WindowsAdapter } from './windows.js';
import { AndroidTermuxAdapter } from './android.js';
// Legacy alias for old code that imports AndroidTermuxAdapter from this path
export { AndroidTermuxAdapter } from './android.js';

function detectPlatform(): 'windows' | 'android-termux' | 'unknown' {
  const platform = process.platform;

  // Windows
  if (platform === 'win32') return 'windows';

  // Android/Termux detection
  if (platform === 'linux') {
    // Any of these indicators is sufficient for Termux detection
    const isTermux = !!process.env.TERMUX_VERSION
      || !!process.env.TERMUX_APP_PACKAGE_MANAGER
      || process.env.PREFIX?.includes('com.termux')
      || process.env.HOME?.includes('com.termux')
      || process.env.PREFIX?.includes('/data/data/com.termux');

    // Android indicators — one is enough
    const isAndroid = !!process.env.SERIAL
      || !!process.env.ANDROID_ROOT
      || !!process.env.ANDROID_DATA
      || !!process.env.ANDROID_HOME;

    // If either Termux or Android indicators match, it's android-termux
    if (isTermux || isAndroid) return 'android-termux';
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

    case 'unknown':
    default: {
      // Fallback: try to detect Android even without Termux env vars
      const { execSync } = await import('node:child_process');
      try {
        execSync('adb devices', { encoding: 'utf-8', timeout: 5000 });
        return new AndroidTermuxAdapter();
      } catch {
        throw new Error(
          `Plataforma no soportada: ${process.platform}. ` +
          `Buffy Next soporta Windows (PowerShell) y Android/Termux (bash).`,
        );
      }
    }
  }
}
