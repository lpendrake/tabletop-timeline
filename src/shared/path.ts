/** The last segment of a '/'-separated path. */
export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}
