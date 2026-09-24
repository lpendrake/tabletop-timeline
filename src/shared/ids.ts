const MAX_TRIES = 20;

function randomShortId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a random 4-character alphanumeric ID.
 * Probability of collision is low enough for our use case (notes in a vault).
 * Alphanumeric (a-z, 0-9) gives 36^4 = 1,679,616 combinations.
 *
 * When `existing` is given, regenerates on a collision with it, up to
 * `MAX_TRIES` attempts, throwing if every attempt clashes.
 */
export function generateShortId(existing?: ReadonlySet<string>): string {
  let id = randomShortId();
  if (!existing) return id;

  let tries = 1;
  while (existing.has(id)) {
    if (tries >= MAX_TRIES) {
      throw new Error(`Could not generate a unique id after ${MAX_TRIES} attempts`);
    }
    id = randomShortId();
    tries += 1;
  }
  return id;
}
