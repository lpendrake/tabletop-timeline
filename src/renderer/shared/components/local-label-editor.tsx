import { useCallback, useEffect, useState } from 'react';
import './label-override-editor.css';

interface Props {
  title: string;
  initialValue: string;
  placeholder: string;
  onSave: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * A text-prompt dialog for editing a link's *local* label (the text stored
 * directly in the `[[label|id]]` markdown, as opposed to the entity index's
 * global override). Mirrors `LabelOverrideEditor`'s markup and reuses its CSS
 * so the two dialogs look identical, but carries no `entityIndex` dependency
 * of its own — the caller supplies the current value and the save/reset
 * callbacks, so this stays a dumb prompt.
 */
export function LocalLabelEditor({
  title,
  initialValue,
  placeholder,
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
    onClose();
  }, [value, onSave, onClose]);

  const handleReset = useCallback(() => {
    onReset();
    onClose();
  }, [onReset, onClose]);

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
              if (e.key === 'Enter') handleSave();
            }}
            placeholder={placeholder}
            autoFocus
          />
          <div className="label-editor-actions">
            <button
              type="button"
              className="label-editor-btn"
              title="Default is the first heading in the note, or the event title"
              onClick={handleReset}
            >
              Reset to Default
            </button>
            <button type="button" className="label-editor-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="label-editor-btn label-editor-btn--primary"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
