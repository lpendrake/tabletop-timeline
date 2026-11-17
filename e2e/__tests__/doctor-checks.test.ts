import { describe, it, expect } from 'vitest';
import {
  evaluateDoctor,
  hasFailure,
  environmentChecks,
  type DoctorProbes,
  type TrialLaunch,
} from '../doctor-checks.js';

const healthy: DoctorProbes = {
  platform: 'linux',
  nodeModulesInstalled: true,
  electronBinaryInstalled: true,
  missingLibraries: [],
  displaySet: false,
  xvfbRunOnPath: true,
  isRoot: true,
};
// Mirrors doctor.ts: the trial launch only runs when the environment checks pass.
const doctor = (overrides: Partial<DoctorProbes>, trial: TrialLaunch = { ok: true }) => {
  const probes = { ...healthy, ...overrides };
  return evaluateDoctor(probes, hasFailure(environmentChecks(probes)) ? undefined : trial);
};
const named = (report: ReturnType<typeof doctor>, name: string) =>
  report.checks.find((c) => c.name === name);

describe('evaluateDoctor', () => {
  it('doctor gives `npm ci` as the fix when the Electron binary is missing', () => {
    const noModules = doctor({ nodeModulesInstalled: false, electronBinaryInstalled: false });
    expect(named(noModules, 'Electron binary installed')?.fix).toBe('npm ci');
    expect(named(noModules, 'Dependencies installed')?.fix).toBe('npm ci');

    const onlyBinary = doctor({ electronBinaryInstalled: false });
    const fix = named(onlyBinary, 'Electron binary installed')?.fix;
    expect(fix).toContain('node node_modules/electron/install.js');
    expect(fix).toContain('github.com');
    expect(fix).toContain('ELECTRON_MIRROR');
  });

  it('doctor gives the setup script as the fix for missing Linux libraries or no display', () => {
    const asRoot = doctor({
      missingLibraries: ['libgbm.so.1'],
      displaySet: false,
      xvfbRunOnPath: false,
    });
    expect(named(asRoot, 'Electron shared libraries')).toMatchObject({
      status: 'fail',
      detail: 'missing: libgbm.so.1',
      fix: 'scripts/setup-linux-e2e.sh',
    });
    expect(named(asRoot, 'Display available')?.fix).toBe('scripts/setup-linux-e2e.sh');

    const asUser = doctor({ missingLibraries: ['libgbm.so.1'], isRoot: false });
    expect(named(asUser, 'Electron shared libraries')?.fix).toBe('sudo scripts/setup-linux-e2e.sh');
  });

  it('doctor skips the library and display checks on Windows and macOS', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const report = doctor({ platform, missingLibraries: ['x'], xvfbRunOnPath: false });
      expect(named(report, 'Electron shared libraries')?.status).toBe('skip');
      expect(named(report, 'Display available')?.status).toBe('skip');
      expect(report.ready).toBe(true);
    }
  });

  it('doctor skips the trial launch when an earlier check failed and reports not ready', () => {
    const report = doctor({ missingLibraries: ['libgbm.so.1'] });
    expect(named(report, 'Trial launch')?.status).toBe('skip');
    expect(report.ready).toBe(false);
  });

  it('doctor reports ready only when every check passes', () => {
    expect(doctor({}).ready).toBe(true);
    expect(evaluateDoctor(healthy).ready).toBe(false);
    const failed = doctor({}, { ok: false, detail: 'exited with code 1 — see the output above' });
    expect(named(failed, 'Trial launch')).toMatchObject({
      status: 'fail',
      detail: 'exited with code 1 — see the output above',
      fix: 'npm run app:explore -- --fixture reputation',
    });
    expect(failed.ready).toBe(false);
  });

  it('doctor skips the library check with "ldd not available" when ldd cannot run', () => {
    const report = doctor({ missingLibraries: null });
    expect(named(report, 'Electron shared libraries')).toMatchObject({
      status: 'skip',
      detail: 'ldd not available',
    });
    expect(report.ready).toBe(true);
  });
});
