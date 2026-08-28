// Buffy Next — Freshness Policy (E4.1)
// Pure functions, no side effects, fully testable.

import type { ObservationCategory, EpistemicState } from './types.js';

// ─── Freshness Policy ──────────────────────────────────────

export interface FreshnessPolicyEntry {
  /** Duración máxima en ms antes de que el dato se considere stale */
  maxAgeMs: number;
  /** Velocidad típica de cambio del dato */
  volatility: 'very-low' | 'low' | 'medium' | 'high';
  /** Justificación de la política */
  reasoning: string;
}

/**
 * Política de frescura por categoría.
 *
 * Cada categoría tiene un maxAge basado en la física del sistema:
 * - CPU usage cambia con carga → 1 minuto
 * - RAM cambia constantemente → 30 segundos
 * - GPU driver casi nunca cambia → 5 minutos
 * - Temperatura puede spikear → 30 segundos
 * - Procesos cambian en segundos → 30 segundos
 * - Disco cambia lentamente → 1 hora
 * - Red puede ser inestable → 1 minuto
 */
export const FRESHNESS_POLICY: Record<ObservationCategory, FreshnessPolicyEntry> = {
  cpu: {
    maxAgeMs: 60_000,
    volatility: 'medium',
    reasoning: 'CPU usage cambia con carga de trabajo; 1min es suficiente para observar tendencias sostenidas.',
  },

  memory: {
    maxAgeMs: 30_000,
    volatility: 'high',
    reasoning: 'RAM disponible cambia constantemente con asignaciones y garbage collection. 30s es el máximo para dato útil.',
  },

  gpu: {
    maxAgeMs: 300_000,
    volatility: 'low',
    reasoning: 'Driver y nombre de GPU casi nunca cambian. 5min es conservador para cubrir reescaneos normales.',
  },

  temperature: {
    maxAgeMs: 30_000,
    volatility: 'high',
    reasoning: 'Temperatura puede aumentar rápidamente bajo carga. 30s permite detectar spikes sin ruido.',
  },

  processes: {
    maxAgeMs: 30_000,
    volatility: 'high',
    reasoning: 'Lista de procesos y uso de CPU/mem puede cambiar en segundos. 30s es el máximo para datos útiles.',
  },

  storage: {
    maxAgeMs: 3_600_000,
    volatility: 'very-low',
    reasoning: 'Uso de disco cambia lentamente. 1 hora es apropiado para detección de patrones de llenado.',
  },

  network: {
    maxAgeMs: 60_000,
    volatility: 'medium',
    reasoning: 'Conectividad puede cambiar si la red es inestable. 1min permite detectar pérdidas de conexión.',
  },
};

// ─── Classification ────────────────────────────────────────

/**
 * Clasifica el estado epistémico de una observación
 * basándose en su edad y la política de frescura.
 *
 * @param observedAt - ISO timestamp de la medición
 * @param category - Categoría de la observación
 * @returns EpistemicState: 'observed' | 'stale'
 */
export function classifyEpistemicState(
  observedAt: string,
  category: ObservationCategory,
): 'observed' | 'stale' {
  const policy = FRESHNESS_POLICY[category];
  const ageMs = Date.now() - new Date(observedAt).getTime();

  if (ageMs > policy.maxAgeMs) {
    return 'stale';
  }
  return 'observed';
}

// ─── Age Calculation ───────────────────────────────────────

/**
 * Calcula la edad en milisegundos desde observedAt hasta "ahora".
 *
 * @param observedAt - ISO timestamp de la medición
 * @returns Edad en milisegundos
 */
export function calculateAgeMs(observedAt: string): number {
  return Date.now() - new Date(observedAt).getTime();
}

// ─── Policy Lookup ─────────────────────────────────────────

/**
 * Obtiene la política de frescura para una categoría.
 *
 * @param category - Categoría de observación
 * @returns FreshnessPolicyEntry con maxAgeMs, volatility y reasoning
 */
export function getFreshnessPolicy(category: ObservationCategory): FreshnessPolicyEntry {
  return FRESHNESS_POLICY[category];
}
