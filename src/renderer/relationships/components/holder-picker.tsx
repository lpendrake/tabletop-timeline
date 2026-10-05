import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchablePicker } from '../../shared/searchable-picker';
import { holderDisplayName, holderPickerOptions } from '../domain/holders';
import type { HolderPickerModel } from '../domain/view-state';
import './toolbar.css';

export interface HolderPickerProps {
  picker: HolderPickerModel;
  labelFor: (id: string) => string;
  onSelect: (holderId: string) => void;
}

/** Button showing the current holder, opening a searchable Pinned/All dropdown beneath it. */
export function HolderPicker({ picker, labelFor, onSelect }: HolderPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { options, pinned } = useMemo(
    () =>
      holderPickerOptions({
        holders: picker.holders,
        pinned: picker.pinned,
        allHoldersLabel: picker.allLabel,
        labelFor,
      }),
    [picker.holders, picker.pinned, picker.allLabel, labelFor],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!picker.show) return null;

  return (
    <div className="rel-holder-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="rel-holder-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="rel-holder-caption">{picker.label}</span>
        <strong className="rel-holder-name">
          {holderDisplayName(picker.selectedId, picker.allLabel, labelFor)}
        </strong>
        <span className="rel-holder-count">{picker.selectedCount}</span>
        <span className="rel-holder-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="rel-holder-dropdown">
          <SearchablePicker
            options={options}
            pinned={pinned}
            pinnedLabel="Pinned"
            allLabel="All"
            highlightMatches
            value={picker.selectedId}
            placeholder={`Search ${picker.holders.length} entities…`}
            ariaLabel={`Search ${picker.label.toLowerCase()}s`}
            autoFocus
            onPick={(option) => {
              onSelect(option.id);
              setOpen(false);
            }}
            onCancel={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
