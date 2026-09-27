import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/core/doctor.js';
import { getActionCatalog, findActionById } from '../src/actions/registry.js';
import { renderCapabilities } from '../src/core/presenter.js';
import type { PlatformAdapter, SystemInfo, Capability, PlatformName } from '../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────

function mkAdapter(overrides: {
  capabilities?: Capability[];
  privileges?: { shell: boolean; shizuku: boolean; root: boolean; adb: boolean };
}): PlatformAdapter {
  const system: SystemInfo = {
    os: { name: 'Test OS', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test CPU', cores: 4 },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'Test GPU', driver: '1.0', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    privileges: overrides.privileges,
  };
  return {
    name: 'linux' as PlatformName,
    async detect() { return { name: 'linux' as PlatformName, os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return system; },
    async capabilities() { return overrides.capabilities ?? []; },
    async execute(action) { return action.execute(); },
  };
}

const capsWithAdb = (binary: boolean, connected?: boolean): Capability[] => [
  {
    name: 'ADB',
    status: binary ? 'installed' : 'missing',
    // D1-c: deviceConnected es medido por el adapter (linux/android), no fabricado.
    ...(connected !== undefined ? { deviceConnected: connected } : {}),
  },
];

// ─── H8: capabilities expone el catálogo (discovery ≠ authorization) ──

describe('H8 — capabilities expone catálogo de acciones', () => {
  it('getActionCatalog expone id + level + prerequisites de TODAS las acciones', () => {
    const catalog = getActionCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(['auto_safe', 'confirm', 'forbidden']).toContain(entry.level);
      expect(Array.isArray(entry.prerequisites)).toBe(true);
      // La acción real debe existir (el catálogo no fabrica ids)
      expect(findActionById(entry.id)).toBeDefined();
    }
  });

  it('cada acción del catálogo interno aparece en la superficie de discovery', () => {
    // Guard de contrato: si alguien agrega una acción a ALL_ACTIONS sin
    // repasar los campos públicos, getActionCatalog no puede quedarse corta.
    const catalog = getActionCatalog();
    for (const id of ['check-gpu-driver', 'install-tool', 'check-shizuku']) {
      expect(catalog.some(a => a.id === id)).toBe(true);
    }
  });

  it('renderCapabilities human muestra la sección de acciones con nivel y requisitos', () => {
    const out = renderCapabilities(
      [{ name: 'Node.js', status: 'installed', version: '22.0.0' }],
      getActionCatalog(),
    );
    expect(out).toContain('Acciones disponibles');
    expect(out).toContain('install-tool');
    expect(out).toContain('auto_safe');
  });

  it('renderCapabilities sigue funcionando sin acciones (backward compat)', () => {
    const out = renderCapabilities([{ name: 'Node.js', status: 'installed' }]);
    expect(out).not.toContain('Acciones disponibles');
  });

  it('DISCOVERY SIN EJECUCIÓN: getActionCatalog es metadata pura (no ejecuta nada)', () => {
    // El valor central del contrato: listar no autoriza. getActionCatalog
    // es un map sobre metadata estática — esta aserción es estructural:
    // la función no recibe adapter ni puede ejecutar acciones.
    const catalog = getActionCatalog();
    expect(catalog).toEqual(getActionCatalog()); // determinística
    expect(JSON.stringify(catalog)).not.toContain('execute');
  });
});

// ─── H1 (D1-c): instalado ≠ conectado ───────────────────────

describe('H1 — ADB desambiguado en doctor (binario vs dispositivo)', () => {
  it('binario instalado + dispositivo conectado → dos filas ok', async () => {
    const report = await runDoctor(mkAdapter({
      capabilities: capsWithAdb(true, true),
      privileges: { shell: true, shizuku: false, root: false, adb: true },
    }));
    const binario = report.items.find(i => i.id === 'adb-binario');
    const dispositivo = report.items.find(i => i.id === 'adb-dispositivo');
    expect(binario?.severity).toBe('ok');
    expect(binario?.message).toContain('instalado');
    expect(dispositivo?.severity).toBe('ok');
    expect(dispositivo?.message).toContain('conectado');
  });

  it('binario instalado + sin dispositivo → binario ok, dispositivo warning (instalado ≠ conectado)', async () => {
    const report = await runDoctor(mkAdapter({
      capabilities: capsWithAdb(true, false),
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    }));
    const binario = report.items.find(i => i.id === 'adb-binario');
    const dispositivo = report.items.find(i => i.id === 'adb-dispositivo');
    expect(binario?.severity).toBe('ok');
    expect(dispositivo?.severity).toBe('warning');
    expect(dispositivo?.message).toContain('no conectado');
  });

  it('privileges no medidos (adapter sin privileges) → fila dispositivo ausente (no fabricada a false)', async () => {
    // En los adapters reales privileges.adb = binario && device, así que
    // privileges presente + adb:false + binario instalado SÍ es una medición
    // ("no conectado"). El estado "no medido" real es privileges ausente.
    const report = await runDoctor(mkAdapter({
      capabilities: capsWithAdb(true, undefined),
      privileges: undefined,
    }));
    expect(report.items.find(i => i.id === 'adb-binario')).toBeDefined();
    expect(report.items.find(i => i.id === 'adb-dispositivo')).toBeUndefined();
  });

  it('sin binario → fila binario warning y SIN fila de dispositivo', async () => {
    const report = await runDoctor(mkAdapter({
      capabilities: capsWithAdb(false),
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    }));
    const binario = report.items.find(i => i.id === 'adb-binario');
    expect(binario?.severity).toBe('warning');
    expect(report.items.find(i => i.id === 'adb-dispositivo')).toBeUndefined();
  });

  it('la fila ambigua priv-adb ya no existe (guard de regresión H1)', async () => {
    const report = await runDoctor(mkAdapter({
      capabilities: capsWithAdb(true, true),
      privileges: { shell: true, shizuku: false, root: false, adb: true },
    }));
    expect(report.items.find(i => i.id === 'priv-adb')).toBeUndefined();
  });

  it('la fila genérica de dependencias no duplica ADB', async () => {
    const report = await runDoctor(mkAdapter({
      capabilities: [
        { name: 'ADB', status: 'missing' },
        { name: 'Node.js', status: 'missing' },
      ],
    }));
    const toolAdb = report.items.filter(i => i.id === 'tool-ADB');
    expect(toolAdb.length).toBe(0); // ADB va por sus filas dedicadas
    expect(report.items.find(i => i.id === 'tool-Node.js')).toBeDefined(); // resto intacto
  });
});
