import { describe, expect, it } from 'vitest';
import { nextVersion } from '../next-version.mjs';

describe('nextVersion', () => {
  it('bumps the prerelease number', () => {
    expect(nextVersion('v0.1.0-alpha.7')).toBe('0.1.0-alpha.8');
    expect(nextVersion('v0.1.0-alpha.9')).toBe('0.1.0-alpha.10');
  });

  it('bumps the patch number of a full release', () => {
    expect(nextVersion('v1.2.3')).toBe('1.2.4');
  });

  it('starts numbering a prerelease that has no number', () => {
    expect(nextVersion('v1.0.0-beta')).toBe('1.0.0-beta.1');
  });

  it('accepts tags without a leading v', () => {
    expect(nextVersion('0.1.0-alpha.7')).toBe('0.1.0-alpha.8');
  });

  it('uses the override when given, ignoring the latest tag', () => {
    expect(nextVersion('v0.1.0-alpha.7', '0.2.0')).toBe('0.2.0');
    expect(nextVersion('v0.1.0-alpha.7', 'v1.0.0-rc.1')).toBe('1.0.0-rc.1');
  });

  it('ignores a blank override', () => {
    expect(nextVersion('v0.1.0-alpha.7', '  ')).toBe('0.1.0-alpha.8');
  });

  it('rejects an invalid override', () => {
    expect(() => nextVersion('v0.1.0-alpha.7', '0.1.0alpha8')).toThrow(/not a valid version/);
  });

  it('rejects a missing or invalid latest tag', () => {
    expect(() => nextVersion('')).toThrow(/not a valid version/);
    expect(() => nextVersion(undefined)).toThrow(/not a valid version/);
    expect(() => nextVersion('nightly')).toThrow(/not a valid version/);
  });
});
