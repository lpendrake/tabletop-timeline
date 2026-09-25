import { useEffect, useState } from 'react';
import { SettingRow } from './controls/setting-row';
import { SearchablePicker } from '../../shared/searchable-picker';
import { notesData } from '../../notes/data';
import { relationshipsData } from '../../relationships/data';
import { notesToPickerOptions } from '../../relationships/domain/note-picker-options';
import { holderLabel } from './domain/holder-options';
import type { EntityIndexEntry } from '../../../types/global';

interface Props {
  campaignPath: string;
}

export function DefaultHolderRow({ campaignPath }: Props) {
  const [entityIndex, setEntityIndex] = useState<EntityIndexEntry[]>([]);
  const [holderId, setHolderId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    notesData.getEntityIndex(campaignPath).then((index) => {
      if (!cancelled) setEntityIndex(index);
    });
    relationshipsData.getDefaultHolder().then((id) => {
      if (!cancelled) setHolderId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignPath]);

  const label = holderLabel(entityIndex, holderId);

  const handlePick = (id: string) => {
    setHolderId(id);
    setPickerOpen(false);
    void relationshipsData.setDefaultHolder(id);
  };

  const handleClear = () => {
    setHolderId(null);
    void relationshipsData.setDefaultHolder(null);
  };

  return (
    <SettingRow
      label="Default Reputation Holder"
      description="The holder pre-filled when a relationship directive's holder blank is left unset."
    >
      <div className="default-holder-row">
        {pickerOpen ? (
          <SearchablePicker
            options={notesToPickerOptions(entityIndex)}
            value={holderId}
            autoFocus
            placeholder="Search notes…"
            onPick={(option) => handlePick(option.id)}
            onCancel={() => setPickerOpen(false)}
            ariaLabel="Default reputation holder"
          />
        ) : (
          <>
            <span className="default-holder-row__value">{label ?? 'None'}</span>
            <button type="button" className="settings-button" onClick={() => setPickerOpen(true)}>
              Choose…
            </button>
            {label && (
              <button type="button" className="settings-button" onClick={handleClear}>
                Clear
              </button>
            )}
          </>
        )}
      </div>
    </SettingRow>
  );
}
