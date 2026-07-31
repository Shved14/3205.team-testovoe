import styles from './EmptyState.module.css';

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.icon} aria-hidden="true">
        &ndash;
      </div>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
