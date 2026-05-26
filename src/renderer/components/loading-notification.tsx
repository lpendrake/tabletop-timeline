import { useEffect } from 'react';
import { ThemeProvider } from '../theme';
import './loading-notification.css';

interface LoadingNotificationProps {
  message: string;
  variant: 'success' | 'info' | 'error';
  onDismiss: () => void;
  autoDismissMs?: number;
  sticky?: boolean;
}

export function LoadingNotification({
  message,
  variant,
  onDismiss,
  autoDismissMs,
  sticky = false,
}: LoadingNotificationProps) {
  const bs = ThemeProvider.get().bootstrap;

  useEffect(() => {
    if (sticky || !autoDismissMs) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss, sticky]);

  const accentColor =
    variant === 'success' ? bs.success : variant === 'error' ? bs.danger : bs.primary;

  return (
    <div
      className="loading-notification"
      style={{
        backgroundColor: bs.cardBg,
        border: `1px solid ${bs.cardBorder}`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
      }}
      role="status"
    >
      <div className="loading-notification-body">
        <span className="loading-notification-dot" style={{ backgroundColor: accentColor }} />
        <span className="loading-notification-message" style={{ color: bs.text }}>
          {message}
        </span>
      </div>
      <button
        className="loading-notification-dismiss"
        style={{ color: bs.textMuted }}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
