import { useState, useEffect, useRef, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CalendarProvider } from '../calendar/provider';
import { formatExpanded } from '../calendar/format';
import './AdvanceTimePopover.css';

interface AdvanceTimePopoverProps {
  /** Screen coordinates of the now-marker labels element's top-left corner. */
  anchor: { x: number; y: number };
  currentNow: string;
  onSave: (newNow: string) => Promise<void>;
  onClose: () => void;
}

/** Parse "+5h", "+2d", "+30m", "+1w" style relative deltas. Returns seconds or null. */
export function parseRelativeDelta(s: string): number | null {
  const m = /^\+\s*(\d+)\s*([mhdw])$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const cal = CalendarProvider.get();
  const spd = cal.secondsPerDay();
  const multipliers: Record<string, number> = {
    m: 60,
    h: 3600,
    d: spd,
    w: cal.weekLength() * spd,
  };
  return n * multipliers[m[2].toLowerCase()];
}

export function AdvanceTimePopover({
  anchor,
  currentNow,
  onSave,
  onClose,
}: AdvanceTimePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const baseSecs = useMemo(() => {
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse(currentNow);
    return parsed !== null ? cal.toEpochSeconds(parsed) : 0;
  }, [currentNow]);

  const [pendingSecs, setPendingSecs] = useState(baseSecs);
  const [inputValue, setInputValue] = useState(currentNow);
  const [inputError, setInputError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    let removeHandler: (() => void) | undefined;
    const id = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler, true);
      removeHandler = () => document.removeEventListener('mousedown', handler, true);
    }, 0);
    return () => {
      clearTimeout(id);
      removeHandler?.();
    };
  }, [onClose]);

  function applyDelta(delta: number) {
    const cal = CalendarProvider.get();
    const next = pendingSecs + delta;
    setPendingSecs(next);
    setInputValue(cal.format(cal.fromEpochSeconds(next)));
    setInputError(false);
  }

  function handleInput(value: string) {
    setInputValue(value);
    // Try relative delta first (+5h, +2d, +1w, etc.)
    const relDelta = parseRelativeDelta(value);
    if (relDelta !== null) {
      setPendingSecs(baseSecs + relDelta);
      setInputError(false);
      return;
    }
    // Fall back to absolute date
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse(value.trim());
    if (parsed !== null) {
      setPendingSecs(cal.toEpochSeconds(parsed));
      setInputError(false);
    } else {
      setInputError(true);
    }
  }

  async function handleSave() {
    if (inputError || saving) return;
    setSaving(true);
    try {
      const cal = CalendarProvider.get();
      await onSave(cal.format(cal.fromEpochSeconds(pendingSecs)));
      onClose();
    } catch {
      // parent error toast surfaces the failure; keep popover open
    } finally {
      setSaving(false);
    }
  }

  // Build quick-delta buttons from the active calendar
  const cal = CalendarProvider.get();
  const spd = cal.secondsPerDay();
  const quickDeltas: { label: string; delta: number }[] = [
    { label: '+1 min', delta: 60 },
    { label: '+10 min', delta: 600 },
    { label: '+1 hour', delta: 3600 },
    { label: '+1 day', delta: spd },
    { label: '+1 week', delta: cal.weekLength() * spd },
  ];

  const popoverWidth = 300;
  const left = Math.min(anchor.x, window.innerWidth - popoverWidth - 12);
  const style: CSSProperties = {
    position: 'fixed',
    left: Math.max(12, left),
    bottom: window.innerHeight - anchor.y + 6,
    zIndex: 500,
  };

  return createPortal(
    <div ref={popoverRef} className="advance-time-popover" style={style}>
      <div className="atp-title">Advance Time</div>
      <div className="atp-current">{formatExpanded(cal.fromEpochSeconds(pendingSecs))}</div>
      <div className="atp-quick-row">
        {quickDeltas.map(({ label, delta }) => (
          <button key={label} onClick={() => applyDelta(delta)}>
            {label}
          </button>
        ))}
      </div>
      <div className="atp-row">
        <label className="atp-label">Set directly</label>
        <input
          className={`atp-input${inputError ? ' is-error' : ''}`}
          type="text"
          value={inputValue}
          placeholder="+5h, +2d or 4726-05-04T09:30"
          onChange={(e) => handleInput(e.target.value)}
        />
      </div>
      <div className="atp-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="is-primary"
          onClick={() => void handleSave()}
          disabled={inputError || saving}
        >
          Save
        </button>
      </div>
    </div>,
    document.body,
  );
}
