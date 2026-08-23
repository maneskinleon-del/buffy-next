import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execSync before importing the adapter
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// Import after mock
const { LinuxAdapter } = await import('../src/adapters/linux.js');

function mockSh(output: string) {
  mockExecSync.mockReturnValueOnce(output);
}

function mockShSequence(outputs: string[]) {
  for (const output of outputs) {
    mockExecSync.mockReturnValueOnce(output);
  }
}

function createAdapter(): InstanceType<typeof LinuxAdapter> {
  return new LinuxAdapter();
}

// ─── detect() ──────────────────────────────────────────────

describe('LinuxAdapter — detect()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return platform info from /etc/os-release and uname', async () => {
    const adapter = createAdapter();
    // detect() calls: os-release, uname -r, uname -m
    mockShSequence([
      'PRETTY_NAME="EndeavourOS Linux"\nNAME="EndeavourOS"',
      '6.18.42-1-lts',
      'x86_64',
    ]);

    const info = await adapter.detect();
    expect(info.name).toBe('linux');
    expect(info.os).toBe('EndeavourOS Linux');
    expect(info.version).toBe('6.18.42-1-lts');
    expect(info.arch).toBe('x86_64');
  });

  it('should fallback to "Linux" when os-release is unavailable', async () => {
    const adapter = createAdapter();
    mockShSequence(['', '', '']);

    const info = await adapter.detect();
    expect(info.os).toBe('Linux');
  });
});

// ─── systemInfo() — CPU ────────────────────────────────────

describe('LinuxAdapter — systemInfo() CPU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect CPU model and cores from /proc/cpuinfo and nproc', async () => {
    const adapter = createAdapter();
    // systemInfo() call order: cpu, mem, gpu, storage, temp, processes, os-release, uname, privileges
    mockShSequence([
      'model name\t: AMD Ryzen 5 3400G\nmodel name\t: AMD Ryzen 5 3400G',
      '8',
      'MemTotal:       16384000 kB\nMemAvailable:    8192000 kB',
      '',  // lspci (no GPU found)
      '',  // /sys/class/drm (no GPU found)
      'Filesystem     1M-blocks  Used Available Use% Mounted on\n/dev/sda1        500000 250000    250000  50% /',
      '',  // thermal zones
      '',  // sensors
      '',  // ps aux (empty)
      'PRETTY_NAME="Linux"',
      '6.1.0',
      'x86_64',
      '0', // id -u
      '',  // adb not found
    ]);

    const info = await adapter.systemInfo();
    expect(info.cpu.model).toBe('AMD Ryzen 5 3400G');
    expect(info.cpu.cores).toBe(8);
    expect(info.cpu.usage).toBeNull();
  });

  it('should fallback to "Unknown CPU" when /proc/cpuinfo has no model', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'processor\t: 0\nprocessor\t: 1',
      '2',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      'Filesystem 1M-blocks Used Available Use% Mounted on\n/dev/sda1 100000 50000 50000 50% /',
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.cpu.model).toBe('Unknown CPU');
  });
});

// ─── systemInfo() — RAM ────────────────────────────────────

describe('LinuxAdapter — systemInfo() RAM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect RAM from /proc/meminfo', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU',
      '4',
      'MemTotal:       16384000 kB\nMemAvailable:    8192000 kB',
      '', '',
      'Filesystem     1M-blocks  Used Available Use% Mounted on\n/dev/sda1        500000 250000    250000  50% /',
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.memory.totalGB).toBeCloseTo(15.6, 0);
    expect(info.memory.availableGB).toBeCloseTo(7.8, 0);
    expect(info.memory.usedPercent).toBeGreaterThan(40);
    expect(info.memory.usedPercent).toBeLessThan(60);
  });

  it('should preserve null when /proc/meminfo is unavailable', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU',
      '4',
      '',  // empty meminfo
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.memory.totalGB).toBeNull();
    expect(info.memory.availableGB).toBeNull();
    expect(info.memory.usedPercent).toBe(0);
  });
});

// ─── systemInfo() — GPU ────────────────────────────────────

describe('LinuxAdapter — systemInfo() GPU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect real GPU from lspci', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 8000000 kB\nMemAvailable: 4000000 kB',
      '07:00.0 VGA compatible controller: AMD/ATI Renoir',
      'Kernel driver in use: amdgpu',
      'Filesystem 1M-blocks Used Available Use% Mounted on\n/dev/sda1 200000 100000 100000 50% /',
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.name).toBe('AMD/ATI Renoir');
    expect(info.gpu.driver).toBe('amdgpu');
    expect(info.gpu.isGeneric).toBe(false);
  });

  it('should detect generic GPU (VMware)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '00:0f.0 VGA compatible controller: VMware SVGA II Adapter',
      '',
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.name).toBe('VMware SVGA II Adapter');
    expect(info.gpu.isGeneric).toBe(true);
  });

  it('should return null when GPU not detected', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '',  // lspci empty
      '',  // /sys/class/drm empty
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.name).toBe('Unknown GPU');
    expect(info.gpu.isGeneric).toBeNull();
  });
});

// ─── systemInfo() — Temperature ────────────────────────────

describe('LinuxAdapter — systemInfo() temperature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect temperature from /sys/class/thermal', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      '',  // df (empty → storage [])
      '52000',  // thermal zone temp (52°C)
      '',  // sensors
      '',  // ps aux
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).not.toBeNull();
    expect(info.temperature!.cpuCelsius).toBe(52);
  });

  it('should return null when no thermal zones available', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      '',
      '',  // thermal zones empty
      '',  // sensors empty
      '',  // ps aux
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).toBeNull();
  });
});

// ─── systemInfo() — Storage ────────────────────────────────

describe('LinuxAdapter — systemInfo() storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect storage from df', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      '/dev/sda1        500000 250000    250000  50% /',
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.storage).toHaveLength(1);
    expect(info.storage[0].mount).toBe('/');
    expect(info.storage[0].usedPercent).toBe(50);
  });
});

// ─── systemInfo() — Processes ──────────────────────────────

describe('LinuxAdapter — systemInfo() processes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect processes from ps aux', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      '',
      '', '',
      'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.1 169432 13456 ?        Ss   Oct01   0:05 /sbin/init\nuser      1234  5.0  2.0 1234567 163840 ?      Sl   10:00   1:30 firefox',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.processes.length).toBeGreaterThan(0);
    const init = info.processes.find(p => p.pid === 1);
    expect(init).toBeDefined();
    expect(init!.name).toBe('/sbin/init');
  });
});

// ─── capabilities() ────────────────────────────────────────

describe('LinuxAdapter — capabilities()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect installed tools', async () => {
    const adapter = createAdapter();
    // capabilities checks: node, npm, git, python3, gcc, make, docker, adb, curl, wget
    mockShSequence([
      '/usr/bin/node',
      'v24.18.0',
      '/usr/bin/npm',
      '11.18.0',
      '/usr/bin/git',
      'git version 2.55.0',
      '/usr/bin/python3',
      'Python 3.12.4',
      '',  // gcc not found
      '',  // make not found
      '',  // docker not found
      '',  // adb not found
      '/usr/bin/curl',
      'curl 8.5.0',
      '',  // wget not found
    ]);

    const caps = await adapter.capabilities();
    const node = caps.find(c => c.name === 'Node.js');
    expect(node).toBeDefined();
    expect(node!.status).toBe('installed');

    const gcc = caps.find(c => c.name === 'GCC');
    expect(gcc).toBeDefined();
    expect(gcc!.status).toBe('missing');
  });
});

// ─── Contract: null semantics ──────────────────────────────

describe('LinuxAdapter — contract null semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cpu.usage should always be null (no real-time CPU%)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.cpu.usage).toBeNull();
  });

  it('gpu.isGeneric should be null when GPU not detected (not true)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',  // no GPU
      '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.isGeneric).toBeNull();
    expect(info.gpu.isGeneric).not.toBe(true);
  });

  it('temperature should be null when no thermal zones (not 0)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '',
      '',
      '',  // no thermal
      '',
      '',  // ps aux
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).toBeNull();
  });

  it('memory.totalGB should be null when /proc/meminfo unavailable (not 0)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      '',  // empty meminfo
      '', '', '', '', '',
      'PRETTY_NAME="Linux"', '6.1.0', 'x86_64',
      '0', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.memory.totalGB).toBeNull();
    expect(info.memory.availableGB).toBeNull();
  });
});
