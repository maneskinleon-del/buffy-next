// Buffy Next — Shared GPU Classification
// Single source of truth for generic GPU detection.
//
// Two strategies:
//   1. Blacklist: known generic/virtual/basic display adapters
//   2. Whitelist (mobile): known real GPU vendors — anything NOT listed is generic
//
// Desktop platforms (Windows, Linux) use the blacklist.
// Mobile (Android) uses the whitelist (inverted logic).

/**
 * Known generic, virtual, and basic display adapters.
 * Merged from: Windows adapter, Linux adapter, check-gpu-driver action.
 * Case-insensitive matching.
 */
const GENERIC_GPU_PATTERNS = [
  // Microsoft basic/virtual
  'Microsoft Basic Display',
  'Microsoft Basic Render',
  'Microsoft Generic',
  'Standard VGA',
  'Microsoft Teredo',
  // Virtual machine adapters
  'VMware',
  'VirtualBox',
  'QXL',
  'Bochs',
  // Legacy/server
  'ASPEED',
  'Matrox',
  'Cirrus',
];

/**
 * Known real mobile GPU vendors.
 * Used for Android: if a GPU name doesn't match any of these, it's considered generic.
 */
const MOBILE_GPU_VENDORS = [
  'Mali',
  'Adreno',
  'PowerVR',
  'Vivante',
  'Qualcomm',
  'ARM',
  'Apple',
];

/**
 * Check if a GPU is generic/virtual/basic based on known patterns.
 * Works for desktop platforms (Windows, Linux).
 *
 * @param name - GPU name string (case-insensitive)
 * @returns true if the GPU matches a known generic pattern
 */
export function isGenericGpu(name: string | null | undefined): boolean {
  if (!name) return true;
  const lower = name.toLowerCase();
  return GENERIC_GPU_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

// ─── lspci parsing (H1b fix) ───────────────────────────────

/**
 * Extract the PCI slot address from an lspci device line.
 *
 * H1b (2026-09-25): the Linux adapter grepped the driver from the WHOLE
 * `lspci -k` output, grabbing the first "Kernel driver in use:" line —
 * usually a root complex bridge (e.g. "pcieport"), not the GPU.
 *
 * Fix strategy: get the slot of the VGA/3D/Display device, then read its
 * driver with `lspci -k -s <slot>`. This function only extracts the slot.
 *
 * @param lspciLine One line of `lspci` output, e.g.
 *        "07:00.0 VGA compatible controller: AMD/ATI Renoir"
 * @returns Slot address (e.g. "07:00.0") or null if not found
 */
export function extractGpuSlot(lspciLine: string): string | null {
  if (!lspciLine) return null;
  // Slot = hex bus ':' hex device '.' hex function, anchored at line start
  const m = lspciLine.match(/^([0-9a-fA-F]{1,4}:[0-9a-fA-F]{2}\.[0-9a-fA-F])\s/);
  return m ? m[1] : null;
}

/**
 * Extract the kernel driver of a SPECIFIC device from scoped `lspci -k -s <slot>` output.
 *
 * Scoped output contains exactly one device block:
 *   "07:00.0 VGA compatible controller: AMD/ATI Renoir\n\tKernel driver in use: amdgpu"
 *
 * @param lspciKOutput Full stdout of `lspci -k -s <slot>`
 * @returns Driver name (e.g. "amdgpu") or null if absent (unbound device)
 */
export function extractDriverFromLspciK(lspciKOutput: string): string | null {
  if (!lspciKOutput) return null;
  const m = lspciKOutput.match(/Kernel driver in use:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

/**
 * Check if a GPU is a known real mobile GPU vendor.
 * Used by Android adapter: if NOT in this list, the GPU is considered generic.
 *
 * @param name - GPU name string (case-insensitive)
 * @returns true if the GPU matches a known mobile vendor
 */
export function isKnownMobileGpu(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return MOBILE_GPU_VENDORS.some(v => lower.includes(v.toLowerCase()));
}
