import * as fs from 'node:fs';

export function readJsonObject(file: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function writeJsonObject(file: string, obj: Record<string, unknown>): void {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}
