import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps): JSX.Element {
  return (
    <div className={styles.container}>
      <span className={styles.message}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Закрыть"
        >
          ×
        </button>
      )}
    </div>
  );
}
