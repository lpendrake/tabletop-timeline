import type { EntityIndexEntry } from '../../types/global';

export const entityIndex = {
  getAll(): Promise<EntityIndexEntry[]> {
    return window.fsApi.getEntityIndex();
  },

  updateLabelOverride(
    id: string,
    target: 'tagLabel' | 'linkLabel',
    value: string | null,
  ): Promise<boolean> {
    return window.fsApi.updateEntityLabelOverride(id, target, value);
  },
};
