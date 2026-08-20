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
