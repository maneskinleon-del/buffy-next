// Phase 3 — Static Scenarios (5)
// Open queries without system changes

export interface Scenario {
  id: string;
  type: 'static' | 'dynamic' | 'stale';
  query: string;
  description: string;
  expectedFields: string[];
  setup?: () => Promise<void>;
  change?: () => Promise<void>;
  groundTruth: () => Promise<GroundTruth>;
}

export interface GroundTruth {
  actualState: Record<string, unknown>;
  timestamp: string;
  expectedCorrect: boolean;
  notes: string;
}

export const STATIC_SCENARIOS: Scenario[] = [
  {
    id: 'S1',
    type: 'static',
    query: 'Mi PC anda lenta, ¿qué revisarías primero?',
    description: 'Consulta abierta genérica de rendimiento',
    expectedFields: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const cpuInfo = execSync('cat /proc/cpuinfo | grep "model name" | head -1', { encoding: 'utf-8' });
      const memInfo = execSync('cat /proc/meminfo | head -3', { encoding: 'utf-8' });
      return {
        actualState: { cpu: cpuInfo.trim(), memory: memInfo.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should select cpu, ram, gpu, temperature, processes',
      };
    },
  },
  {
    id: 'S2',
    type: 'static',
    query: '¿Está en buenas condiciones mi equipo para trabajar ahora?',
    description: 'Consulta de estado general del sistema',
    expectedFields: ['cpu', 'ram', 'gpu', 'storage', 'temperature'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const uptime = execSync('uptime', { encoding: 'utf-8' });
      const loadAvg = execSync('cat /proc/loadavg', { encoding: 'utf-8' });
      return {
        actualState: { uptime: uptime.trim(), loadAvg: loadAvg.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should assess overall system health',
      };
    },
  },
  {
    id: 'S3',
    type: 'static',
    query: 'Quiero instalar un modelo local, ¿ves algún problema?',
    description: 'Consulta sobre capacidad del sistema',
    expectedFields: ['cpu', 'ram', 'gpu', 'storage'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const memAvail = execSync("cat /proc/meminfo | grep MemAvailable | awk '{print $2}'", { encoding: 'utf-8' });
      const diskFree = execSync("df -BM / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' });
      return {
        actualState: {
          memAvailableKB: parseInt(memAvail.trim()),
          diskFreeMB: parseInt(diskFree.trim()),
        },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should evaluate RAM, disk, and GPU for model installation',
      };
    },
  },
  {
    id: 'S4',
    type: 'static',
    query: 'Mi computador empezó a comportarse peor, ¿qué información necesitas?',
    description: 'Consulta que pide al agente qué necesita',
    expectedFields: ['cpu', 'ram', 'temperature', 'processes'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const processes = execSync('ps aux --sort=-%cpu | head -6', { encoding: 'utf-8' });
      return {
        actualState: { topProcesses: processes.trim() },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should identify what information is needed for diagnosis',
      };
    },
  },
  {
    id: 'S5',
    type: 'static',
    query: '¿Qué puedes afirmar con certeza sobre mi sistema actual?',
    description: 'Consulta que pide certeza sobre datos',
    expectedFields: ['cpu', 'ram', 'gpu', 'storage', 'temperature'],
    groundTruth: async () => {
      const { execSync } = await import('child_process');
      const cpuModel = execSync("cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2", { encoding: 'utf-8' });
      const memTotal = execSync("cat /proc/meminfo | grep MemTotal | awk '{print $2}'", { encoding: 'utf-8' });
      const gpuInfo = execSync('lspci | grep -i vga | head -1', { encoding: 'utf-8' });
      return {
        actualState: {
          cpuModel: cpuModel.trim(),
          memTotalKB: parseInt(memTotal.trim()),
          gpu: gpuInfo.trim(),
        },
        timestamp: new Date().toISOString(),
        expectedCorrect: true,
        notes: 'Should provide factual system information with confidence',
      };
    },
  },
];
