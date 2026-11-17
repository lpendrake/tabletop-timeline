export interface ExploreOptions {
  fixture: string;
  script?: string;
  size?: { width: number; height: number };
  outputDir: string;
}

export interface ParseExploreInput {
  argv: string[];
  availableFixtures: string[];
  /** Filesystem-safe timestamp used in the default output folder, e.g. 2026-11-17T09-30-00-123. */
  timestamp: string;
}

export type ParseExploreResult =
  | { ok: true; options: ExploreOptions }
  | { ok: false; error: string };

const USAGE =
  'usage: npm run app:explore -- --fixture <name> [--script <path>] [--size WIDTHxHEIGHT] [--out <dir>]';

const FLAGS = ['--fixture', '--script', '--size', '--out'];

function parseSize(value: string): { width: number; height: number } | null {
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(value);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export function parseExploreOptions(input: ParseExploreInput): ParseExploreResult {
  const { argv, availableFixtures, timestamp } = input;
  const fail = (error: string): ParseExploreResult => ({ ok: false, error: `${error}\n${USAGE}` });
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!FLAGS.includes(flag)) return fail(`Unknown argument "${flag}".`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return fail(`${flag} needs a value.`);
    values[flag] = value;
  }

  const fixture = values['--fixture'];
  if (fixture === undefined || !availableFixtures.includes(fixture)) {
    const problem =
      fixture === undefined ? '--fixture is required' : `Unknown fixture "${fixture}"`;
    return fail(`${problem}. Available fixtures: ${availableFixtures.join(', ')}`);
  }

  let size: ExploreOptions['size'];
  if (values['--size'] !== undefined) {
    const parsedSize = parseSize(values['--size']);
    if (!parsedSize) {
      return fail(`Invalid --size "${values['--size']}". Use WIDTHxHEIGHT, e.g. 1000x700.`);
    }
    size = parsedSize;
  }

  return {
    ok: true,
    options: {
      fixture,
      script: values['--script'],
      size,
      outputDir: values['--out'] ?? `e2e/output/explore/${fixture}-${timestamp}`,
    },
  };
}
