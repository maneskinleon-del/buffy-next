import { describe, it, expect } from 'vitest';
import { isGenericGpu, isKnownMobileGpu } from './gpu.js';

// ─── isGenericGpu (blacklist) ──────────────────────────────

describe('isGenericGpu — desktop blacklist', () => {

  // Should return true (generic)
  it('Microsoft Basic Display → generic', () => {
    expect(isGenericGpu('Microsoft Basic Display Adapter')).toBe(true);
  });

  it('Microsoft Basic Render → generic', () => {
    expect(isGenericGpu('Microsoft Basic Render Driver')).toBe(true);
  });

  it('Microsoft Generic → generic', () => {
    expect(isGenericGpu('Microsoft Generic PnP Monitor')).toBe(true);
  });

  it('Standard VGA → generic', () => {
    expect(isGenericGpu('Standard VGA Graphics Adapter')).toBe(true);
  });

  it('Microsoft Teredo → generic', () => {
    expect(isGenericGpu('Microsoft Teredo Tunneling Pseudo-Interface')).toBe(true);
  });

  it('VMware → generic', () => {
    expect(isGenericGpu('VMware SVGA 3D')).toBe(true);
  });

  it('VirtualBox → generic', () => {
    expect(isGenericGpu('VirtualBox Graphics Adapter')).toBe(true);
  });

  it('QXL → generic', () => {
    expect(isGenericGpu('QXL VGA')).toBe(true);
  });

  it('Bochs → generic', () => {
    expect(isGenericGpu('Bochs VGA')).toBe(true);
  });

  it('ASPEED → generic', () => {
    expect(isGenericGpu('ASPEED Technology ASPEED Graphics Family')).toBe(true);
  });

  it('Matrox → generic', () => {
    expect(isGenericGpu('Matrox G200')).toBe(true);
  });

  it('Cirrus → generic', () => {
    expect(isGenericGpu('Cirrus Logic GD 5446')).toBe(true);
  });

  // Should return false (real GPU)
  it('NVIDIA GeForce → not generic', () => {
    expect(isGenericGpu('NVIDIA GeForce GTX 1660 Ti')).toBe(false);
  });

  it('AMD Radeon → not generic', () => {
    expect(isGenericGpu('Radeon 550 Series')).toBe(false);
  });

  it('AMD Radeon RX → not generic', () => {
    expect(isGenericGpu('Radeon RX 580 Series')).toBe(false);
  });

  it('Intel UHD → not generic', () => {
    expect(isGenericGpu('Intel(R) UHD Graphics 630')).toBe(false);
  });

  it('Intel Iris → not generic', () => {
    expect(isGenericGpu('Intel(R) Iris(R) Xe Graphics')).toBe(false);
  });

  it('Qualcomm Adreno → not generic', () => {
    expect(isGenericGpu('Qualcomm Adreno 650')).toBe(false);
  });

  // Edge cases
  it('empty string → generic', () => {
    expect(isGenericGpu('')).toBe(true);
  });

  it('null → generic', () => {
    expect(isGenericGpu(null)).toBe(true);
  });

  it('undefined → generic', () => {
    expect(isGenericGpu(undefined)).toBe(true);
  });

  // Case insensitivity
  it('case insensitive: "MICROSOFT BASIC DISPLAY" → generic', () => {
    expect(isGenericGpu('MICROSOFT BASIC DISPLAY')).toBe(true);
  });

  it('case insensitive: "microsoft basic display" → generic', () => {
    expect(isGenericGpu('microsoft basic display')).toBe(true);
  });

  it('case insensitive: "VMWARE" → generic', () => {
    expect(isGenericGpu('VMWARE SVGA 3D')).toBe(true);
  });

  it('case insensitive: "nvidia geforce" → not generic', () => {
    expect(isGenericGpu('nvidia geforce gtx 1660')).toBe(false);
  });
});

// ─── isKnownMobileGpu (whitelist) ──────────────────────────

describe('isKnownMobileGpu — mobile whitelist', () => {

  // Should return true (known mobile vendor)
  it('Mali → known', () => {
    expect(isKnownMobileGpu('Mali-G78')).toBe(true);
  });

  it('Adreno → known', () => {
    expect(isKnownMobileGpu('Adreno 650')).toBe(true);
  });

  it('PowerVR → known', () => {
    expect(isKnownMobileGpu('PowerVR Rogue GE8320')).toBe(true);
  });

  it('Vivante → known', () => {
    expect(isKnownMobileGpu('Vivante GC7000UL')).toBe(true);
  });

  it('Qualcomm → known', () => {
    expect(isKnownMobileGpu('Qualcomm Adreno 610')).toBe(true);
  });

  it('ARM → known', () => {
    expect(isKnownMobileGpu('ARM Mali-T880')).toBe(true);
  });

  it('Apple → known', () => {
    expect(isKnownMobileGpu('Apple M1 GPU')).toBe(true);
  });

  // Should return false (not a known mobile vendor)
  it('NVIDIA → not known mobile', () => {
    expect(isKnownMobileGpu('NVIDIA GeForce')).toBe(false);
  });

  it('Radeon → not known mobile', () => {
    expect(isKnownMobileGpu('Radeon 550 Series')).toBe(false);
  });

  it('Intel → not known mobile', () => {
    expect(isKnownMobileGpu('Intel UHD Graphics')).toBe(false);
  });

  // Edge cases
  it('empty string → not known', () => {
    expect(isKnownMobileGpu('')).toBe(false);
  });

  it('null → not known', () => {
    expect(isKnownMobileGpu(null)).toBe(false);
  });

  it('undefined → not known', () => {
    expect(isKnownMobileGpu(undefined)).toBe(false);
  });

  // Case insensitivity
  it('case insensitive: "MALI" → known', () => {
    expect(isKnownMobileGpu('MALI-G78')).toBe(true);
  });

  it('case insensitive: "adreno" → known', () => {
    expect(isKnownMobileGpu('adreno 650')).toBe(true);
  });
});

// ─── Cross-strategy consistency ─────────────────────────────

describe('GPU classification cross-check', () => {

  it('real desktop GPU: not generic, not known mobile', () => {
    expect(isGenericGpu('NVIDIA GeForce GTX 1660')).toBe(false);
    expect(isKnownMobileGpu('NVIDIA GeForce GTX 1660')).toBe(false);
  });

  it('real mobile GPU: not generic, is known mobile', () => {
    expect(isGenericGpu('Mali-G78')).toBe(false);
    expect(isKnownMobileGpu('Mali-G78')).toBe(true);
  });

  it('generic display: is generic, not known mobile', () => {
    expect(isGenericGpu('Microsoft Basic Display Adapter')).toBe(true);
    expect(isKnownMobileGpu('Microsoft Basic Display Adapter')).toBe(false);
  });

  it('VMware virtual: is generic, not known mobile', () => {
    expect(isGenericGpu('VMware SVGA 3D')).toBe(true);
    expect(isKnownMobileGpu('VMware SVGA 3D')).toBe(false);
  });
});
