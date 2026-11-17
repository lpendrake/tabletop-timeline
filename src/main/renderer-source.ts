export const RENDERER_ENV_VAR = 'TT_RENDERER';
export const RENDERER_ENV_DIST = 'dist';
export const DEV_SERVER_URL = 'http://localhost:5173';

export type RendererSource = typeof RENDERER_ENV_DIST | 'dev-server';

/**
 * Packaged builds always load the built renderer. Unpackaged builds load the Vite dev server
 * unless TT_RENDERER=dist asks for the built renderer.
 */
export function resolveRendererSource(isPackaged: boolean, env: NodeJS.ProcessEnv): RendererSource {
  if (isPackaged) return RENDERER_ENV_DIST;

  const requested = env[RENDERER_ENV_VAR];
  if (requested === undefined || requested === '') return 'dev-server';
  if (requested === RENDERER_ENV_DIST) return RENDERER_ENV_DIST;

  throw new Error(
    `${RENDERER_ENV_VAR} must be "${RENDERER_ENV_DIST}" or unset, got "${requested}"`,
  );
}
