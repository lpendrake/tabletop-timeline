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
