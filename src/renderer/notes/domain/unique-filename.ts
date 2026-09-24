/** Maximum number of numbered-filename candidates createNote will try before giving up. */
export const MAX_CREATE_ATTEMPTS = 50;

/**
 * Builds the filename to try for the given attempt number.
 * attempt 0 -> `${slug}.md`, attempt n>=1 -> `${slug}-${n + 1}.md`.
 */
export function candidateFilename(slug: string, attempt: number): string {
  if (attempt <= 0) return `${slug}.md`;
  return `${slug}-${attempt + 1}.md`;
}

/**
 * Generates an id via `generate()`, regenerating on collision with `existingIds`.
 * Throws if no unique id is found within `maxTries` attempts.
 */
export function pickUnusedId(
  generate: () => string,
  existingIds?: ReadonlySet<string>,
  maxTries = 20,
): string {
  let id = generate();
  if (!existingIds) return id;
  let tries = 1;
  while (existingIds.has(id)) {
    if (tries >= maxTries) {
      throw new Error(`Could not generate a unique id after ${maxTries} attempts`);
    }
    id = generate();
    tries += 1;
  }
  return id;
}
