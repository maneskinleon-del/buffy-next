import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execSync before importing the adapter
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// Import after mock
const { AndroidTermuxAdapter } = await import('../src/adapters/android.js');

function mockSh(output: string) {
  mockExecSync.mockReturnValueOnce(output);
}

function mockShSequence(outputs: string[]) {
  for (const output of outputs) {
    mockExecSync.mockReturnValueOnce(output);
  }
}

function createAdapter(): InstanceType<typeof AndroidTermuxAdapter> {
  return new AndroidTermuxAdapter();
}

// ─── detect() ──────────────────────────────────────────────

describe('AndroidTermuxAdapter — detect()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return platform info from getprop', async () => {
    const adapter = createAdapter();
    // detect() calls: getprop ro.product.model, getprop ro.build.version.release, getprop ro.product.cpu.abi
    mockShSequence(['Pixel 6', '13', 'arm64-v8a']);

    const info = await adapter.detect();
    expect(info.name).toBe('android-termux');
    expect(info.os).toBe('Pixel 6');
    expect(info.version).toBe('13');
    expect(info.arch).toBe('arm64-v8a');
  });

  it('should fallback when getprop unavailable', async () => {
    const adapter = createAdapter();
    mockShSequence(['', '', '']);

    const info = await adapter.detect();
    expect(info.os).toBe('Android (Termux)');
  });
});

// ─── systemInfo() — CPU ────────────────────────────────────

describe('AndroidTermuxAdapter — systemInfo() CPU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect CPU from /proc/cpuinfo', async () => {
    const adapter = createAdapter();
    // systemInfo() call order: cpuinfo, nproc, meminfo, gpu (adb), thermal, storage (df /data),
    // storage fallback (stat -f), processes (ps -A), getprop (os-release), detectPrivileges
    mockShSequence([
      'Hardware\t: Qualcomm Snapdragon 865',  // cpuinfo
      '8',                                     // nproc
      'MemTotal:       8192000 kB\nMemAvailable:    4096000 kB',  // meminfo
      '',                                     // adb dumpsys SurfaceFlinger (empty)
      '',                                     // getprop ro.hardware.egl
      '',                                     // getprop ro.board.platform
      '',                                     // thermal zones
      '/dev/block/sda1  128000000 64000000  64000000  50% /data',  // df /data
      '',                                     // ps -A
      '',                                     // getprop ro.build.version.release (os-release in systemInfo)
      '',                                     // getprop ro.build.display.id
      '',                                     // getprop ro.product.cpu.abi
      'id',                                   // detectPrivileges: shell
      '',                                     // rish
      '',                                     // su
      '',                                     // adb devices
    ]);

    const info = await adapter.systemInfo();
    expect(info.cpu.model).toBe('Qualcomm Snapdragon 865');
    expect(info.cpu.cores).toBe(8);
    expect(info.cpu.usage).toBeNull();
  });
});

// ─── systemInfo() — RAM ────────────────────────────────────

describe('AndroidTermuxAdapter — systemInfo() RAM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect RAM from /proc/meminfo', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal:       8192000 kB\nMemAvailable:    4096000 kB',
      '', '', '', '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.memory.totalGB).toBeCloseTo(7.8, 0);
    expect(info.memory.availableGB).toBeCloseTo(3.9, 0);
  });
});

// ─── systemInfo() — GPU ────────────────────────────────────

describe('AndroidTermuxAdapter — systemInfo() GPU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect known mobile GPU (Adreno)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      'GLES: Qualcomm Adreno 650',  // adb dumpsys SurfaceFlinger
      '', '', '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.name).toBe('Qualcomm Adreno 650');
    expect(info.gpu.isGeneric).toBe(false);
  });

  it('should detect unknown GPU as generic', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '',  // adb empty
      '',  // getprop ro.hardware.egl empty
      '',  // getprop ro.board.platform empty
      '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.name).toBe('Unknown GPU');
    expect(info.gpu.isGeneric).toBe(true);
  });
});

// ─── systemInfo() — Temperature ────────────────────────────

describe('AndroidTermuxAdapter — systemInfo() temperature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect temperature from thermal zones', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '',
      '45000\n42000\n48000',  // thermal zones (45, 42, 48 → avg 45)
      '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).not.toBeNull();
    expect(info.temperature!.cpuCelsius).toBe(45);
  });

  it('should return null when no thermal zones', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '',
      '',  // thermal zones empty
      '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).toBeNull();
  });
});

// ─── systemInfo() — Storage ────────────────────────────────

describe('AndroidTermuxAdapter — systemInfo() storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect storage from df /data', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '', '',
      '/dev/block/sda1  128000000 64000000  64000000  50% /data',  // df /data
      '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.storage).toHaveLength(1);
    expect(info.storage[0].mount).toBe('/data');
    expect(info.storage[0].usedPercent).toBe(50);
  });
});

// ─── capabilities() ────────────────────────────────────────

describe('AndroidTermuxAdapter — capabilities()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect Termux tools', async () => {
    const adapter = createAdapter();
    // capabilities checks: node, npm, adb, rish, pkg, git, python, scrcpy, sqlite3
    mockShSequence([
      '/data/data/com.termux/files/usr/bin/node',
      'v24.18.0',
      '/data/data/com.termux/files/usr/bin/npm',
      '11.18.0',
      '',  // adb not found
      '',  // rish not found
      '/data/data/com.termux/files/usr/bin/pkg',
      '0.33',
      '/data/data/com.termux/files/usr/bin/git',
      'git version 2.55.0',
      '',  // python not found
      '',  // scrcpy not found
      '',  // sqlite3 not found
    ]);

    const caps = await adapter.capabilities();
    const node = caps.find(c => c.name === 'Node.js');
    expect(node).toBeDefined();
    expect(node!.status).toBe('installed');

    const pkg = caps.find(c => c.name === 'pkg');
    expect(pkg).toBeDefined();
    expect(pkg!.status).toBe('installed');

    const scrcpy = caps.find(c => c.name === 'scrcpy');
    expect(scrcpy).toBeDefined();
    expect(scrcpy!.status).toBe('missing');
  });
});

// ─── Contract: null semantics ──────────────────────────────

describe('AndroidTermuxAdapter — contract null semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cpu.usage should always be null', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.cpu.usage).toBeNull();
  });

  it('temperature should be null when no thermal zones (not 0)', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '',
      '',  // no thermal
      '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.temperature).toBeNull();
  });

  it('gpu.isGeneric should be true for unknown GPU', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '', '', '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    // Unknown GPU → isKnownMobileGpu('Unknown GPU') = false → !false = true
    expect(info.gpu.isGeneric).toBe(true);
  });

  it('gpu.isGeneric should be false for known mobile GPU', async () => {
    const adapter = createAdapter();
    mockShSequence([
      'model name\t: Test CPU', '4',
      'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      'GLES: Qualcomm Adreno 650',
      '', '', '', '', '',
      '0', '', '', '',
    ]);

    const info = await adapter.systemInfo();
    expect(info.gpu.isGeneric).toBe(false);
  });
});
