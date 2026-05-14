declare module 'js-yaml' {
  export const CORE_SCHEMA: unknown;
  export function load(str: string, opts?: { schema?: unknown }): unknown;
  export function dump(obj: unknown, opts?: { schema?: unknown }): string;
}
