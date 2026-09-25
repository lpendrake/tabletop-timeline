import type {
  AddOptionResult,
  InvalidDirectiveEntry,
  Ledger,
  LedgersAs,
  ParsedDirective,
  TrackLibrary,
} from '../../shared/relationships';

/**
 * Renderer-side IO port for relationship data. Thin typed wrappers over
 * `window.fsApi` — React code must go through this, never `window.fsApi`
 * directly. Values (current worth, formatted display, step traces) are
 * computed by the renderer from these raw ledgers/tracks, never over IPC.
 */
export const relationshipsData = {
  async getLedgers(entityId: string, as: LedgersAs): Promise<Ledger[]> {
    return window.fsApi.getRelationshipLedgers(entityId, as);
  },

  async getAllLedgers(): Promise<Ledger[]> {
    return window.fsApi.getAllRelationshipLedgers();
  },

  async getTracks(): Promise<TrackLibrary> {
    return window.fsApi.getRelationshipTracks();
  },

  async addOption(
    trackId: string,
    input: { label: string; mutual: boolean },
  ): Promise<AddOptionResult> {
    return window.fsApi.addRelationshipOption(trackId, input);
  },

  async getInvalid(): Promise<InvalidDirectiveEntry[]> {
    return window.fsApi.getInvalidRelationshipDirectives();
  },

  async getDirectives(
    paths: string[],
  ): Promise<Array<{ path: string; title?: string; directives: ParsedDirective[] }>> {
    return window.fsApi.getRelationshipDirectives(paths);
  },

  async getDefaultHolder(): Promise<string | null> {
    return window.fsApi.getDefaultReputationHolder();
  },

  async setDefaultHolder(id: string | null): Promise<void> {
    await window.fsApi.setDefaultReputationHolder(id);
  },

  onChanged(callback: (data: { paths: string[] }) => void): () => void {
    return window.fsApi.onRelationshipsChanged(callback);
  },
};
