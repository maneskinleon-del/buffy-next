// Phase 3 — Adversarial Cases (A1-A8)
// Cases that attempt to break the temporal contract

import type { Scenario } from './static.js';

export const ADVERSARIAL_SCENARIOS: Scenario[] = [
  {
    id: 'A1',
    type: 'stale',
    query: '¿Cómo está mi RAM?',
    description: 'Buffy has correct but stale data — should refresh, not send stale as current',
    expectedFields: ['ram'],
    setup: async () => {
      // Force initial measurement
      const { execSync } = await import('child_process');
      execSync('free -m', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness (35s > 30s threshold)
      await new Promise(resolve => setTimeout(resolve, 35_000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: { memAvailableKB: parseInt(memAvail.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Stale data MUST be refreshed, not sent as current',
      };
    },
  },
  {
    id: 'A2',
    type: 'static',
    query: '¿Qué GPU tengo?',
    description: 'Fresh data exists — should NOT refresh unnecessarily',
    expectedFields: ['gpu'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const gpu = execSync('lspci | grep -i vga | head -1', { encoding: 'utf-8' });
      return {
        actualState: { gpu: gpu.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Fresh data should be used as-is, no unnecessary refresh',
      };
    },
  },
  {
    id: 'A3',
    type: 'static',
    query: '¿Cómo está mi red?',
    description: 'Network field may not exist or be observable',
    expectedFields: ['network'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const ping = execSync('ping -c 1 8.8.8.8 2>&1 | head -3', { encoding: 'utf-8' });
      return {
        actualState: { pingResult: ping.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should handle missing/non-observable fields gracefully',
      };
    },
  },
  {
    id: 'A4',
    type: 'static',
    query: '¿Qué temperatura tiene mi GPU?',
    description: 'GPU temperature may not be available (UNKNOWN)',
    expectedFields: ['gpu', 'temperature'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const gpuTemp = execSync('cat /sys/class/drm/card*/device/hwmon/*/temp1_input 2>/dev/null | head -1', { encoding: 'utf-8' });
      return {
        actualState: { gpuTempRaw: parseInt(gpuTemp.trim()) || null },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should handle UNKNOWN gracefully, not fabricate data',
      };
    },
  },
  {
    id: 'A5',
    type: 'dynamic',
    query: 'Dame dos mediciones de RAM con tiempo diferente',
    description: 'Two observations of same category with different ages',
    expectedFields: ['ram'],
    change: async () => {
      // Create time gap between measurements
      await new Promise(resolve => setTimeout(resolve, 5000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: { memAvailableKB: parseInt(memAvail.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should handle multiple observations with different timestamps',
      };
    },
  },
  {
    id: 'A6',
    type: 'static',
    query: 'Mi computador se siente raro últimamente',
    description: 'Indirect query requiring inference of needed context',
    expectedFields: ['cpu', 'ram', 'temperature', 'processes'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const loadAvg = execSync('cat /proc/loadavg', { encoding: 'utf-8' });
      return {
        actualState: { loadAvg: loadAvg.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should infer diagnostic context from indirect query',
      };
    },
  },
  {
    id: 'A7',
    type: 'dynamic',
    query: '¿Está bien mi RAM para un modelo de IA?',
    description: 'Stale RAM is relevant, but fresh CPU might answer partially',
    expectedFields: ['ram', 'cpu'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('free -m', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for RAM to become stale
      await new Promise(resolve => setTimeout(resolve, 35_000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: { memAvailableKB: parseInt(memAvail.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should refresh stale RAM even if CPU is fresh',
      };
    },
  },
  {
    id: 'A8',
    type: 'dynamic',
    query: '¿Cómo está mi sistema ahora?',
    description: 'System changes between refresh and final answer',
    expectedFields: ['cpu', 'ram', 'temperature'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('free -m', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness, then change system
      await new Promise(resolve => setTimeout(resolve, 35_000));
      const { execSync } = await import('child_process');
      execSync(`
        node -e "
          const arr = [];
          for (let i = 0; i < 20; i++) {
            arr.push(Buffer.alloc(10 * 1024 * 1024));
          }
          console.log('Allocated 200MB');
          setTimeout(() => {}, 30000);
        " &
      `, { encoding: 'utf-8', timeout: 5000 });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: { memAvailableKB: parseInt(memAvail.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should capture system state at measurement time',
      };
    },
  },
];
