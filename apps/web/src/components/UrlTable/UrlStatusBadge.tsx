import type { UrlStatus } from '@repo/shared';

import styles from './UrlStatusBadge.module.css';

interface UrlStatusBadgeProps {
  status: UrlStatus;
}

const STATUS_LABELS: Record<UrlStatus, string> = {
  pending: 'Ожидает',
  running: 'Выполняется',
  done: 'Готово',
  error: 'Ошибка',
  cancelled: 'Отменено',
};

const STATUS_COLORS: Record<UrlStatus, string> = {
  pending: '#ff9900',
  running: '#0066cc',
  done: '#00cc66',
  error: '#cc0000',
  cancelled: '#999',
};

export function UrlStatusBadge({ status }: UrlStatusBadgeProps): JSX.Element {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? '#999';

  return (
    <span className={styles.badge} style={{ backgroundColor: color }}>
      {label}
    </span>
  );
}
