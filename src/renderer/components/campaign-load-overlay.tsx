import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ThemeProvider } from '../theme';
import './campaign-load-overlay.css';

type Phase = 'idle' | 'loading' | 'mask-fading' | 'morphing' | 'notification' | 'error';

interface CampaignLoadOverlayProps {
  result: 'idle' | 'loading' | 'success' | 'error';
  progress: { percentage: number; taskName: string };
  errorMessage: string | null;
  fileCount: number;
  onDismissNotification: () => void;
}

export function CampaignLoadOverlay({
  result,
  progress,
  errorMessage,
  fileCount,
  onDismissNotification,
}: CampaignLoadOverlayProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const boxRef = useRef<HTMLDivElement>(null);
  const fromRect = useRef<DOMRect | null>(null);
  const bs = ThemeProvider.get().bootstrap;

  useEffect(() => {
    if (result === 'loading') {
      setPhase('loading');
    } else if (result === 'success') {
      setPhase((curr) => (curr === 'loading' ? 'mask-fading' : curr));
    } else if (result === 'error') {
      setPhase('error');
    } else if (result === 'idle') {
      setPhase((curr) =>
        curr === 'notification' || curr === 'error' || curr === 'morphing' ? 'idle' : curr,
      );
    }
  }, [result]);

  useEffect(() => {
    if (phase !== 'mask-fading') return;
    const timer = setTimeout(() => {
      if (boxRef.current) {
        fromRect.current = boxRef.current.getBoundingClientRect();
      }
      setPhase('morphing');
    }, 200);
    return () => clearTimeout(timer);
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== 'morphing' || !boxRef.current || !fromRect.current) return;
    const from = fromRect.current;
    const to = boxRef.current.getBoundingClientRect();
    if (from.width === 0) {
      setPhase('notification');
      return;
    }
    const deltaX = from.x - to.x;
    const deltaY = from.y - to.y;
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    const anim = boxRef.current.animate(
      [
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
          transformOrigin: '0 0',
        },
        { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: '0 0' },
      ],
      { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    anim.onfinish = () => setPhase('notification');
  }, [phase]);

  useEffect(() => {
    if (phase !== 'notification') return;
    const timer = setTimeout(onDismissNotification, 5000);
    return () => clearTimeout(timer);
  }, [phase, onDismissNotification]);

  if (phase === 'idle') return null;

  const isLoadingPhase = phase === 'loading' || phase === 'mask-fading';
  const clampedPct = Math.min(100, Math.max(0, progress.percentage));

  return (
    <>
      {isLoadingPhase && (
        <div
          className={`campaign-load-mask${phase === 'mask-fading' ? ' campaign-load-mask--fading' : ''}`}
        />
      )}

      <div
        ref={boxRef}
        className={`campaign-load-box${isLoadingPhase ? ' campaign-load-box--loading' : ' campaign-load-box--notification'}`}
        style={{ backgroundColor: bs.cardBg, border: `1px solid ${bs.cardBorder}` }}
      >
        {isLoadingPhase && (
          <>
            <h2 className="campaign-load-title" style={{ color: bs.primary }}>
              Loading Your Universe
            </h2>
            <div
              className="campaign-load-bar-track"
              style={{ backgroundColor: bs.bg, border: `1px solid ${bs.cardBorder}` }}
              role="progressbar"
              aria-valuenow={clampedPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="campaign-load-bar-fill"
                style={{ width: `${clampedPct}%`, backgroundColor: bs.primary }}
              />
            </div>
            <div className="campaign-load-task" style={{ color: bs.textMuted }}>
              {progress.taskName}
            </div>
          </>
        )}

        {(phase === 'morphing' || phase === 'notification') && (
          <div className="campaign-load-notification-body">
            <span
              className="campaign-load-notification-dot"
              style={{ backgroundColor: bs.success }}
            />
            <div className="campaign-load-notification-text">
              <span style={{ color: bs.text }}>Campaign loaded</span>
              <span style={{ color: bs.textMuted }}>{fileCount} files indexed</span>
            </div>
            <button
              className="campaign-load-notification-dismiss"
              style={{ color: bs.textMuted }}
              onClick={onDismissNotification}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="campaign-load-notification-body">
            <span
              className="campaign-load-notification-dot"
              style={{ backgroundColor: bs.danger }}
            />
            <span style={{ color: bs.text }}>{errorMessage ?? 'Failed to load campaign'}</span>
            <button
              className="campaign-load-notification-dismiss"
              style={{ color: bs.textMuted }}
              onClick={onDismissNotification}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </>
  );
}
