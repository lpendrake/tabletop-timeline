import yaml from 'js-yaml';

// Prevent js-yaml from auto-casting YAML date fields to JS Date objects.
// CORE_SCHEMA covers only null/bool/int/float — no !!timestamp type.
// Without this, Date.UTC(year, ...) maps years 0-99 to 1900-1999, so a
// Golarion year like 0005 would silently arrive as 1905.
// The calendar's tryParse also accepts the .sssZ suffix as a secondary
// guard, but the source of truth is keeping strings as strings here.
//
// PARSE uses CORE_SCHEMA to prevent JS Date creation on read.
// STRINGIFY uses DEFAULT schema (no explicit schema arg) so that
// timestamp-like strings (e.g. "0000-01-02T07:00:00") are QUOTED in the
// output — CORE_SCHEMA stringify leaves them unquoted, which causes
// gray-matter's default reader to parse them as JS Date objects and corrupt
// year 0 to 1900.
export const MATTER_OPTS = {
  engines: {
    yaml: {
      parse: (s: string) => yaml.load(s, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>,
      stringify: (o: object) => yaml.dump(o),
    },
  },
} as const;
