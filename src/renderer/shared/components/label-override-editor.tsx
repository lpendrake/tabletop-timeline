import { useCallback, useEffect, useState } from 'react';
import type { EntityIndexEntry } from '../../../types/global';
import { entityIndex } from '../entity-index';
import { LabelEditorDialog } from './label-editor-dialog';

interface Props {
  entityId: string;
  target: 'tagLabel' | 'linkLabel';
  onClose: () => void;
}

export function LabelOverrideEditor({ entityId, target, onClose }: Props) {
  const [entry, setEntry] = useState<EntityIndexEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    entityIndex.getAll().then((all) => {
      const found = all.find((e) => e.id === entityId) ?? null;
      setEntry(found);
      setLoaded(true);
    });
  }, [entityId, target]);

  const handleSave = useCallback(
    async (value: string) => {
      setSaving(true);
      try {
        await entityIndex.updateLabelOverride(entityId, target, value || null);
        onClose();
      } catch (err) {
        console.error('[LabelOverrideEditor] save failed', err);
      } finally {
        setSaving(false);
      }
    },
    [entityId, target, onClose],
  );

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      await entityIndex.updateLabelOverride(entityId, target, null);
      onClose();
    } catch (err) {
      console.error('[LabelOverrideEditor] reset failed', err);
    } finally {
      setSaving(false);
    }
  }, [entityId, target, onClose]);

  if (!loaded) return null;

  const title = target === 'tagLabel' ? 'Edit Tag Label' : 'Edit Link Label';
  const seededValue =
    (target === 'tagLabel' ? entry?.tagLabelOverride : entry?.linkLabelOverride) ?? '';
  const placeholder = entry?.title ?? '';

  return (
    <LabelEditorDialog
      title={title}
      initialValue={seededValue}
      placeholder={placeholder}
      saving={saving}
      onSave={handleSave}
      onReset={handleReset}
      onClose={onClose}
    />
  );
}
