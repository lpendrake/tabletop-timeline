import { useCallback, useEffect, useState } from 'react';
import './label-override-editor.css';

interface Props {
  title: string;
  initialValue: string;
  placeholder: string;
  saving?: boolean;
  onSave: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Shared presentational shell for the two label-editor dialogs: the
 * `entityIndex`-backed `LabelOverrideEditor` and the local (in-markdown)
 * label prompt mounted via `showLocalLabelEditor`. Owns only the input
 * state, the Escape-capture effect, and backdrop click-to-close — no IO of
 * its own. Callers supply the current value and the save/reset callbacks.
 *
 * When `saving` is set, Reset/Cancel/Save are disabled and the primary
 * button reads "Saving…"; this is used by the connected wrapper while its
 * async update is in flight. The local editor's save is synchronous, so it
 * omits `saving` entirely.
 */
export function LabelEditorDialog({
  title,
  initialValue,
  placeholder,
  saving,
  onSave,
  onReset,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(value.trim());
  }, [value, onSave]);

  return (
    <div
      className="label-editor-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="label-editor-modal">
        <button type="button" className="label-editor-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="label-editor-content">
          <h2 className="label-editor-title">{title}</h2>
          <input
            type="text"
            className="label-editor-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) handleSave();
            }}
            placeholder={placeholder}
            autoFocus
          />
          <div className="label-editor-actions">
            <button
              type="button"
              className="label-editor-btn"
              title="Default is the first heading in the note, or the event title"
              onClick={onReset}
              disabled={saving}
            >
              Reset to Default
            </button>
            <button type="button" className="label-editor-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="label-editor-btn label-editor-btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
