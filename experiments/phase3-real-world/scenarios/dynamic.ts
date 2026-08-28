// Phase 3 — Dynamic Scenarios (5)
// Queries with real system changes between measurements

import type { Scenario } from './static.js';

export const DYNAMIC_SCENARIOS: Scenario[] = [
  {
    id: 'D1',
    type: 'dynamic',
    query: '¿Cómo está mi RAM?',
    description: 'Consulta RAM antes y después de consumo',
    expectedFields: ['ram'],
    setup: async () => {
      // Ensure clean state
      const { execSync } = await import('child_process');
      execSync('sync', { encoding: 'utf-8' });
    },
    change: async () => {
      // Consume ~1GB RAM using node
      const { execSync } = await import('child_process');
      execSync(`
        node -e "
          const arr = [];
          for (let i = 0; i < 100; i++) {
            arr.push(Buffer.alloc(10 * 1024 * 1024)); // 10MB each = 1GB total
          }
          console.log('Allocated 1GB');
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
        notes: 'RAM should show increased usage after allocation',
      };
    },
  },
  {
    id: 'D2',
    type: 'dynamic',
    query: '¿Hay procesos consumiendo mucho CPU?',
    description: 'Consulta procesos antes y después de workload',
    expectedFields: ['processes', 'cpu'],
    change: async () => {
      // Create CPU load
      const { execSync } = await import('child_process');
      execSync(`
        node -e "
          let sum = 0;
          for (let i = 0; i < 1e9; i++) { sum += i; }
          console.log('Done');
        " &
      `, { encoding: 'utf-8', timeout: 5000 });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const topCpu = execSync('ps aux --sort=-%cpu | head -3', { encoding: 'utf-8' });
      return {
        actualState: { topCpuProcesses: topCpu.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should detect CPU-intensive process',
      };
    },
  },
  {
    id: 'D3',
    type: 'dynamic',
    query: '¿Cuánto espacio tengo en disco?',
    description: 'Consulta disco antes y después de crear archivos',
    expectedFields: ['storage'],
    change: async () => {
      // Create ~100MB of files
      const { execSync } = await import('child_process');
      execSync('dd if=/dev/zero of=/tmp/buffy-test-file bs=1M count=100 2>/dev/null', { encoding: 'utf-8' });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const diskFree = execSync("df -BM / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' });
      return {
        actualState: { diskFreeMB: parseInt(diskFree.trim()) },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Storage should reflect reduced free space',
      };
    },
    setup: async () => {
      // Clean up any previous test files
      const { execSync } = await import('child_process');
      try { execSync('rm -f /tmp/buffy-test-file', { encoding: 'utf-8' }); } catch {}
    },
  },
  {
    id: 'D4',
    type: 'dynamic',
    query: '¿Cómo está la temperatura de mi CPU?',
    description: 'Consulta temperatura antes y después de workload',
    expectedFields: ['temperature', 'cpu'],
    change: async () => {
      // Generate CPU load to increase temperature
      const { execSync } = await import('child_process');
      execSync(`
        node -e "
          let sum = 0;
          for (let i = 0; i < 2e9; i++) { sum += i; }
          console.log('Done');
        " &
      `, { encoding: 'utf-8', timeout: 5000 });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const temp = execSync('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1', { encoding: 'utf-8' });
      return {
        actualState: { temperatureRaw: parseInt(temp.trim()) || null },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Temperature should be available and accurate',
      };
    },
  },
  {
    id: 'D5',
    type: 'dynamic',
    query: 'Dame un resumen completo del estado de mi sistema',
    description: 'Consulta combinada que modifica 2+ variables',
    expectedFields: ['cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes'],
    change: async () => {
      // Combined workload: CPU + RAM + disk
      const { execSync } = await import('child_process');
      execSync(`
        node -e "
          // CPU load
          let sum = 0;
          for (let i = 0; i < 1e9; i++) { sum += i; }
          // RAM load
          const arr = [];
          for (let i = 0; i < 50; i++) {
            arr.push(Buffer.alloc(10 * 1024 * 1024));
          }
          console.log('Done');
          setTimeout(() => {}, 30000);
        " &
      `, { encoding: 'utf-8', timeout: 5000 });
      // Disk write
      execSync('dd if=/dev/zero of=/tmp/buffy-test-combined bs=1M count=50 2>/dev/null', { encoding: 'utf-8' });
    },
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const cpuLoad = execSync('cat /proc/loadavg', { encoding: 'utf-8' });
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      return {
        actualState: {
          loadAvg: cpuLoad.trim(),
          memAvailableKB: parseInt(memAvail.trim()),
        },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Combined state should reflect all changes',
      };
    },
    setup: async () => {
      const { execSync } = await import('child_process');
      try { execSync('rm -f /tmp/buffy-test-combined', { encoding: 'utf-8' }); } catch {}
    },
  },
];
