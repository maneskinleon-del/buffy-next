// Phase 3 — Stale Scenarios (5)
// Queries where relevant observations become stale

import type { Scenario } from './static.js';

export const STALE_SCENARIOS: Scenario[] = [
  {
    id: 'T1',
    type: 'stale',
    query: '¿Cómo está mi RAM ahora?',
    description: 'RAM measurement becomes stale after 30s threshold',
    expectedFields: ['ram'],
    setup: async () => {
      // Force initial measurement
      const { execSync } = await import('child_process');
      execSync('free -m', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness (35 seconds > 30s threshold)
      await new Promise(resolve => setTimeout(resolve, 35_000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: { memAvailableKB: parseInt(memAvail.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Observation should be refreshed due to staleness',
      };
    },
  },
  {
    id: 'T2',
    type: 'stale',
    query: '¿Qué procesos están corriendo?',
    description: 'Process list becomes stale after 30s',
    expectedFields: ['processes'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('ps aux | head -5', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness + spawn a new process
      await new Promise(resolve => setTimeout(resolve, 35_000));
      const { execSync } = await import('child_process');
      execSync('sleep 60 &', { encoding: 'utf-8' });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const processes = execSync('ps aux | wc -l', { encoding: 'utf-8' });
      return {
        actualState: { processCount: parseInt(processes.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Process list should be refreshed',
      };
    },
  },
  {
    id: 'T3',
    type: 'stale',
    query: '¿Cuánto espacio queda en disco?',
    description: 'Storage measurement becomes stale after 1 hour threshold',
    expectedFields: ['storage'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('df -BM /', { encoding: 'utf-8' });
    },
    change: async () => {
      // Storage has 1-hour threshold, so we test with a fresh measurement
      // that should still be valid
      const { execSync } = await import('child_process');
      execSync('dd if=/dev/zero of=/tmp/buffy-stale-test bs=1M count=10 2>/dev/null', { encoding: 'utf-8' });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const diskFree = execSync("df -BM / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' });
      return {
        actualState: { diskFreeMB: parseInt(diskFree.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Storage should reflect current state',
      };
    },
    setup: async () => {
      const { execSync } = await import('child_process');
      try { execSync('rm -f /tmp/buffy-stale-test', { encoding: 'utf-8' }); } catch {}
    },
  },
  {
    id: 'T4',
    type: 'stale',
    query: '¿Qué temperatura tiene mi CPU?',
    description: 'Temperature becomes stale after 30s',
    expectedFields: ['temperature'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness
      await new Promise(resolve => setTimeout(resolve, 35_000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const temp = execSync('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1', { encoding: 'utf-8' });
      return {
        actualState: { temperatureRaw: parseInt(temp.trim()) || null },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Temperature should be refreshed',
      };
    },
  },
  {
    id: 'T5',
    type: 'stale',
    query: 'Dame un reporte completo del sistema',
    description: 'Multiple fields become stale after 30s',
    expectedFields: ['cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes'],
    setup: async () => {
      const { execSync } = await import('child_process');
      execSync('free -m && ps aux | head -3', { encoding: 'utf-8' });
    },
    change: async () => {
      // Wait for staleness on fast-changing fields
      await new Promise(resolve => setTimeout(resolve, 35_000));
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const loadAvg = execSync('cat /proc/loadavg', { encoding: 'utf-8' });
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: {
          loadAvg: loadAvg.trim(),
          memAvailableKB: parseInt(memAvail.trim()),
        },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Multiple fields should be refreshed',
      };
    },
  },
];
