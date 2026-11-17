import { describe, it, expect } from 'vitest';
import { parseExploreOptions } from '../explore-options.js';

const availableFixtures = ['reputation', 'other'];
const timestamp = '2026-11-17T09-30-00-123';
const parse = (argv: string[]) => parseExploreOptions({ argv, availableFixtures, timestamp });

describe('parseExploreOptions', () => {
  it("explore requires --fixture and lists the available fixtures when it's missing or unknown", () => {
    for (const argv of [[], ['--fixture', 'nope']]) {
      const result = parse(argv);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Available fixtures: reputation, other');
    }
    const unknown = parse(['--fixture', 'nope']);
    expect(!unknown.ok && unknown.error).toContain('Unknown fixture "nope"');
    const unknownFlag = parse(['--fixture', 'reputation', '--bogus', '1']);
    expect(!unknownFlag.ok && unknownFlag.error).toContain('Unknown argument "--bogus"');
  });

  it('explore defaults the output folder to e2e/output/explore/<fixture>-<timestamp>', () => {
    expect(parse(['--fixture', 'reputation'])).toEqual({
      ok: true,
      options: {
        fixture: 'reputation',
        script: undefined,
        size: undefined,
        outputDir: 'e2e/output/explore/reputation-2026-11-17T09-30-00-123',
      },
    });
    const custom = parse(['--fixture', 'reputation', '--out', 'x/y', '--script', 's.ts']);
    expect(custom.ok && custom.options).toMatchObject({ outputDir: 'x/y', script: 's.ts' });
  });

  it('explore accepts --size WIDTHxHEIGHT and rejects malformed sizes', () => {
    const ok = parse(['--fixture', 'reputation', '--size', '800x600']);
    expect(ok.ok && ok.options.size).toEqual({ width: 800, height: 600 });
    for (const bad of ['800', '800x', 'x600', '0x600', '-800x600', '8.5x6', 'axb', '800X600']) {
      const result = parse(['--fixture', 'reputation', '--size', bad]);
      expect(result.ok).toBe(false);
    }
  });
});
