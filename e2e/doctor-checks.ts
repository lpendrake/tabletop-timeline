export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail?: string;
  fix?: string;
}

/** The environment facts the cheap checks look at. */
export interface DoctorProbes {
  platform: NodeJS.Platform;
  nodeModulesInstalled: boolean;
  electronBinaryInstalled: boolean;
  /** Shared libraries `ldd` reports as "not found"; null when `ldd` could not be run. */
  missingLibraries: string[] | null;
  displaySet: boolean;
  xvfbRunOnPath: boolean;
  isRoot: boolean;
}

/** `detail` says why the trial launch failed; the output itself was streamed to the terminal. */
export type TrialLaunch = { ok: true } | { ok: false; detail: string };

export interface DoctorReport {
  checks: DoctorCheck[];
  ready: boolean;
}

export const ELECTRON_INSTALL_FIX =
  'node node_modules/electron/install.js (needs network access to github.com, or set ELECTRON_MIRROR)';

export const TRIAL_LAUNCH_COMMAND = 'npm run app:explore -- --fixture reputation';

function check(name: string, ok: boolean, detail: string, fix: string): DoctorCheck {
  return ok ? { name, status: 'pass' } : { name, status: 'fail', detail, fix };
}

function skipped(name: string, detail: string): DoctorCheck {
  return { name, status: 'skip', detail };
}

function librariesCheck(missing: string[] | null, fix: string): DoctorCheck {
  const name = 'Electron shared libraries';
  if (missing === null) return skipped(name, 'ldd not available');
  return check(name, missing.length === 0, `missing: ${missing.join(', ')}`, fix);
}

export function environmentChecks(probes: DoctorProbes): DoctorCheck[] {
  const linux = probes.platform === 'linux';
  const setupScript = `${probes.isRoot ? '' : 'sudo '}scripts/setup-linux-e2e.sh`;
  const display = 'Display available';
  return [
    check(
      'Dependencies installed',
      probes.nodeModulesInstalled,
      'node_modules is missing',
      'npm ci',
    ),
    check(
      'Electron binary installed',
      probes.electronBinaryInstalled,
      'the Electron binary is not downloaded',
      probes.nodeModulesInstalled ? ELECTRON_INSTALL_FIX : 'npm ci',
    ),
    linux
      ? librariesCheck(probes.missingLibraries, setupScript)
      : skipped('Electron shared libraries', 'Linux only'),
    linux
      ? check(
          display,
          probes.displaySet || probes.xvfbRunOnPath,
          'DISPLAY is not set and xvfb-run is not on PATH',
          setupScript,
        )
      : skipped(display, 'Linux only'),
  ];
}

/** The trial launch is only worth running when none of the environment checks failed. */
export function hasFailure(checks: DoctorCheck[]): boolean {
  return checks.some((c) => c.status === 'fail');
}

function trialLaunchCheck(trial: TrialLaunch | undefined): DoctorCheck {
  const name = 'Trial launch';
  if (!trial) return skipped(name, 'skipped because an earlier check failed');
  if (trial.ok) return { name, status: 'pass' };
  return { name, status: 'fail', detail: trial.detail, fix: TRIAL_LAUNCH_COMMAND };
}

/** `trial` is absent when the environment checks failed and the trial launch was not run. */
export function evaluateDoctor(probes: DoctorProbes, trial?: TrialLaunch): DoctorReport {
  const checks = [...environmentChecks(probes), trialLaunchCheck(trial)];
  return { checks, ready: trial?.ok === true && !hasFailure(checks) };
}
