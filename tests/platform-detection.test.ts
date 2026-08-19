import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../src/adapters/index.js';

// Minimal env for Linux base — no Android indicators
const LINUX_ENV: Record<string, string | undefined> = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/user',
};

describe('detectPlatform', () => {
  // ── Windows ──────────────────────────────────────────────

  it('detects Windows (win32)', () => {
    expect(detectPlatform({}, 'win32')).toBe('windows');
  });

  // ── Android/Termux — definitive indicators ───────────────

  it('detects Termux via TERMUX_VERSION', () => {
    expect(detectPlatform({ ...LINUX_ENV, TERMUX_VERSION: '0.118' }, 'linux')).toBe('android-termux');
  });

  it('detects Termux via TERMUX_APP_PACKAGE_MANAGER', () => {
    expect(detectPlatform({ ...LINUX_ENV, TERMUX_APP_PACKAGE_MANAGER: 'apt' }, 'linux')).toBe('android-termux');
  });

  it('detects Termux via PREFIX containing com.termux', () => {
    expect(detectPlatform({ ...LINUX_ENV, PREFIX: '/data/data/com.termux/files/usr' }, 'linux')).toBe('android-termux');
  });

  it('detects Termux via HOME containing com.termux', () => {
    expect(detectPlatform({ ...LINUX_ENV, HOME: '/data/data/com.termux/files/home' }, 'linux')).toBe('android-termux');
  });

  // ── Android — combined indicators ────────────────────────

  it('detects Android when ANDROID_ROOT=/system AND ANDROID_DATA=/data', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_ROOT: '/system',
      ANDROID_DATA: '/data',
    }, 'linux')).toBe('android-termux');
  });

  // ── Linux — false positives that must NOT match Android ──

  it('ANDROID_HOME alone → linux (not Android)', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_HOME: '/opt/android-sdk',
    }, 'linux')).toBe('linux');
  });

  it('SERIAL alone → linux (not Android)', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      SERIAL: 'HGE12345',
    }, 'linux')).toBe('linux');
  });

  it('ANDROID_ROOT alone (without /system) → linux', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_ROOT: '/opt/android',
    }, 'linux')).toBe('linux');
  });

  it('ANDROID_DATA alone → linux', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_DATA: '/home/user/android-data',
    }, 'linux')).toBe('linux');
  });

  it('ANDROID_ROOT=/system alone (without ANDROID_DATA) → linux', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_ROOT: '/system',
    }, 'linux')).toBe('linux');
  });

  it('ANDROID_DATA=/data alone (without ANDROID_ROOT) → linux', () => {
    expect(detectPlatform({
      ...LINUX_ENV,
      ANDROID_DATA: '/data',
    }, 'linux')).toBe('linux');
  });

  it('plain Linux with no indicators → linux', () => {
    expect(detectPlatform(LINUX_ENV, 'linux')).toBe('linux');
  });

  // ── Unknown platforms ────────────────────────────────────

  it('darwin → unknown', () => {
    expect(detectPlatform(LINUX_ENV, 'darwin')).toBe('unknown');
  });

  it('freebsd → unknown', () => {
    expect(detectPlatform(LINUX_ENV, 'freebsd')).toBe('unknown');
  });

  // ── Determinism ──────────────────────────────────────────

  it('same inputs always produce the same result', () => {
    const env = { ...LINUX_ENV, TERMUX_VERSION: '0.118' };
    const r1 = detectPlatform(env, 'linux');
    const r2 = detectPlatform(env, 'linux');
    const r3 = detectPlatform(env, 'linux');
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('does not mutate the env object', () => {
    const env = { ...LINUX_ENV, ANDROID_ROOT: '/system', ANDROID_DATA: '/data' };
    const original = { ...env };
    detectPlatform(env, 'linux');
    expect(env).toEqual(original);
  });
});

// ── GPU parsing (android.ts logic) ─────────────────────────
// These test the regex pattern that extracts GPU info from dumpsys output.
// The pattern must anchor to lines starting with 'GLES:' to avoid matching
// unrelated strings like SingleSuppressCallback.

describe('GPU parsing — GLES line extraction', () => {
  /**
   * Simulates the GPU extraction logic from AndroidTermuxAdapter.
   * Extracts the GLES line from dumpsys SurfaceFlinger output.
   */
  function extractGpu(dumpsysOutput: string): string {
    const match = dumpsysOutput.match(/^\s*GLES:\s*(.+)$/m);
    return match?.[1]?.trim() ?? '';
  }

  it('extracts GPU from real dumpsys output', () => {
    const output = `GPU modules:
  SingleSuppressCallback
  GLES: ARM, Mali-G57 MC2
  EGL extensions:
    EGL_KHR_...`;
    const gpu = extractGpu(output);
    expect(gpu).toBe('ARM, Mali-G57 MC2');
    expect(gpu).not.toContain('SingleSuppressCallback');
  });

  it('does not match GLES as substring in other identifiers', () => {
    const output = `SomethingWithGLESInName: fake
  GLES: Adreno (TM) 610
  Other stuff`;
    const gpu = extractGpu(output);
    expect(gpu).toBe('Adreno (TM) 610');
  });

  it('handles output with no GLES line', () => {
    const output = `GPU modules:
  SomeModule
  No GPU info here`;
    const gpu = extractGpu(output);
    expect(gpu).toBe('');
  });

  it('handles GLES line with leading whitespace', () => {
    const output = `    GLES: PowerVR Rogue GE8320`;
    const gpu = extractGpu(output);
    expect(gpu).toBe('PowerVR Rogue GE8320');
  });

  it('handles GLES line with no space after colon', () => {
    const output = `GLES:Qualcomm Adreno 650`;
    const gpu = extractGpu(output);
    expect(gpu).toBe('Qualcomm Adreno 650');
  });
});
