// Buffy Next — Model Feasibility (v0.9)
// Determines if a model can run on the current system
//
// Decision tree:
// 1. Check RAM: available >= required * 1.5? → FIT, >= required? → CONSTRAINED, < required? → UNFIT
// 2. Check CPU: cores >= minCores? → no change, >= minCores - 1? → downgrade to CONSTRAINED, < minCores - 1? → UNFIT
// 3. Check GPU: gpuAvailable >= requiresGpu? → no change, < requiresGpu? → UNFIT
// 4. Check Temperature: < 75°C? → no change, >= 75°C? → downgrade to CONSTRAINED

import type {
  SystemInfo,
  ModelSpec,
  ModelFeasibility,
  FeasibilityLevel,
  ExecutionLimits,
  ModelAlternative,
} from './types.js';

// ─── Thermal Thresholds ────────────────────────────────────

const THERMAL_CONSTRAIN_THRESHOLD = 75; // °C
const THERMAL_UNFIT_THRESHOLD = 90;     // °C

// ─── RAM Headroom ──────────────────────────────────────────

const FIT_RAM_MULTIPLIER = 1.5;    // 50% headroom for FIT
const CONSTRAINED_RAM_MULTIPLIER = 1.0; // no headroom for CONSTRAINED

// ─── Alternative Models ────────────────────────────────────

const ALTERNATIVE_MODELS: ModelAlternative[] = [
  {
    model: 'gemma-2b-q4',
    reason: 'Smaller model, requires less RAM',
    estimatedRamGB: 1.5,
    expectedLevel: 'fit',
  },
  {
    model: 'gemma-2b-q8',
    reason: 'Smaller model with higher quality',
    estimatedRamGB: 2.5,
    expectedLevel: 'fit',
  },
  {
    model: 'qwen2.5-7b-q4',
    reason: 'Lower quantization, less RAM',
    estimatedRamGB: 4.0,
    expectedLevel: 'constrained',
  },
];

// ─── Feasibility Assessment ────────────────────────────────

/**
 * Determine if a model can run on the current system.
 *
 * @param model - Model specification
 * @param system - Current system information
 * @returns Feasibility assessment with level, reason, limits, and alternatives
 */
export function canExecute(
  model: ModelSpec,
  system: SystemInfo,
): ModelFeasibility {
  let level: FeasibilityLevel = 'fit';
  const reasons: string[] = [];
  let limits: ExecutionLimits | undefined;

  // 1. Check RAM
  const ramResult = checkRAM(model, system);
  if (ramResult.level === 'unfit') {
    return createUnfitResult(
      `Insufficient RAM: ${system.memory.availableGB}GB available, ${model.estimatedRamGB}GB required`,
      model,
    );
  }
  if (ramResult.level === 'constrained') {
    level = 'constrained';
    reasons.push(ramResult.reason);
  }

  // 2. Check CPU
  const cpuResult = checkCPU(model, system);
  if (cpuResult.level === 'unfit') {
    return createUnfitResult(
      `Insufficient CPU: ${system.cpu.cores} cores available, ${model.minCpuCores} cores required`,
      model,
    );
  }
  if (cpuResult.level === 'constrained' && level === 'fit') {
    level = 'constrained';
    reasons.push(cpuResult.reason);
  }

  // 3. Check GPU
  const gpuResult = checkGPU(model, system);
  if (gpuResult.level === 'unfit') {
    return createUnfitResult(
      `GPU required but not available: ${model.name} requires GPU`,
      model,
    );
  }

  // 4. Check Temperature
  const tempResult = checkTemperature(system);
  if (tempResult.level === 'unfit') {
    return createUnfitResult(
      `CPU temperature critical: ${system.temperature?.cpuCelsius}°C exceeds safety threshold`,
      model,
    );
  }
  if (tempResult.level === 'constrained' && level === 'fit') {
    level = 'constrained';
    reasons.push(tempResult.reason);
  }

  // Create limits if constrained
  if (level === 'constrained') {
    limits = createExecutionLimits(model, system);
  }

  return {
    level,
    reason: reasons.length > 0 ? reasons.join('; ') : 'System meets all requirements',
    limits,
  };
}

// ─── Individual Checks ─────────────────────────────────────

function checkRAM(
  model: ModelSpec,
  system: SystemInfo,
): { level: FeasibilityLevel; reason: string } {
  const available = system.memory.availableGB;
  const required = model.estimatedRamGB;

  if (available === null) {
    return { level: 'fit', reason: 'RAM data unavailable' };
  }

  if (available >= required * FIT_RAM_MULTIPLIER) {
    return { level: 'fit', reason: '' };
  }

  if (available >= required * CONSTRAINED_RAM_MULTIPLIER) {
    return {
      level: 'constrained',
      reason: `RAM near limit: ${available}GB available, ${required}GB required`,
    };
  }

  return {
    level: 'unfit',
    reason: `Insufficient RAM: ${available}GB available, ${required}GB required`,
  };
}

function checkCPU(
  model: ModelSpec,
  system: SystemInfo,
): { level: FeasibilityLevel; reason: string } {
  const cores = system.cpu.cores;
  const required = model.minCpuCores;

  if (cores >= required) {
    return { level: 'fit', reason: '' };
  }

  if (cores >= required - 1) {
    return {
      level: 'constrained',
      reason: `CPU cores near limit: ${cores} cores available, ${required} required`,
    };
  }

  return {
    level: 'unfit',
    reason: `Insufficient CPU: ${cores} cores available, ${required} required`,
  };
}

function checkGPU(
  model: ModelSpec,
  system: SystemInfo,
): { level: FeasibilityLevel; reason: string } {
  if (!model.requiresGpu) {
    return { level: 'fit', reason: '' };
  }

  // For now, we check if GPU is available (not generic)
  const gpuAvailable = system.gpu && !system.gpu.isGeneric;

  if (gpuAvailable) {
    return { level: 'fit', reason: '' };
  }

  return {
    level: 'unfit',
    reason: `GPU required but not available`,
  };
}

function checkTemperature(
  system: SystemInfo,
): { level: FeasibilityLevel; reason: string } {
  const temp = system.temperature?.cpuCelsius;

  if (temp === undefined || temp === null) {
    return { level: 'fit', reason: '' };
  }

  if (temp >= THERMAL_UNFIT_THRESHOLD) {
    return {
      level: 'unfit',
      reason: `CPU temperature critical: ${temp}°C exceeds safety threshold (${THERMAL_UNFIT_THRESHOLD}°C)`,
    };
  }

  if (temp >= THERMAL_CONSTRAIN_THRESHOLD) {
    return {
      level: 'constrained',
      reason: `Elevated CPU temperature: ${temp}°C`,
    };
  }

  return { level: 'fit', reason: '' };
}

// ─── Helper Functions ──────────────────────────────────────

function createExecutionLimits(
  model: ModelSpec,
  system: SystemInfo,
): ExecutionLimits {
  const maxContext = Math.min(
    model.maxContext,
    Math.floor(model.maxContext * 0.7), // Max 70% of model's max context
  );

  return {
    maxContext,
    concurrency: 1, // Single request when constrained
    monitorMemory: true,
    timeout: 60, // 60 seconds timeout
  };
}

function createUnfitResult(
  reason: string,
  model: ModelSpec,
): ModelFeasibility {
  // Filter alternatives that might work
  const viableAlternatives = ALTERNATIVE_MODELS.filter(
    (alt) => alt.estimatedRamGB < model.estimatedRamGB,
  );

  return {
    level: 'unfit',
    reason,
    alternatives: viableAlternatives.length > 0 ? viableAlternatives : undefined,
  };
}

// ─── Pre-defined Model Specs ───────────────────────────────

export const MODEL_SPECS: Record<string, ModelSpec> = {
  'gemma-2b-q4': {
    name: 'gemma-2b-q4',
    estimatedRamGB: 1.5,
    minCpuCores: 2,
    requiresGpu: false,
    maxContext: 2048,
  },
  'gemma-2b-q8': {
    name: 'gemma-2b-q8',
    estimatedRamGB: 2.5,
    minCpuCores: 2,
    requiresGpu: false,
    maxContext: 2048,
  },
  'qwen2.5-7b-q4': {
    name: 'qwen2.5-7b-q4',
    estimatedRamGB: 4.0,
    minCpuCores: 4,
    requiresGpu: false,
    maxContext: 4096,
  },
  'qwen2.5-7b-q8': {
    name: 'qwen2.5-7b-q8',
    estimatedRamGB: 7.0,
    minCpuCores: 4,
    requiresGpu: false,
    maxContext: 4096,
  },
  'llama-70b-q4': {
    name: 'llama-70b-q4',
    estimatedRamGB: 40.0,
    minCpuCores: 8,
    requiresGpu: true,
    minVramGB: 24,
    maxContext: 8192,
  },
};
