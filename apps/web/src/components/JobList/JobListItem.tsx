import type { JobSummary } from '@repo/shared';

import styles from './JobListItem.module.css';

interface JobListItemProps {
  job: JobSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  running: 'Выполняется',
  completed: 'Завершено',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#ff9900',
  running: '#0066cc',
  completed: '#00cc66',
  failed: '#cc0000',
  cancelled: '#999',
};

export function JobListItem({ job, isActive, onSelect }: JobListItemProps): JSX.Element {
  const handleClick = (): void => {
    onSelect(job.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(job.id);
    }
  };

  const shortId = job.id.slice(0, 8);
  const date = new Date(job.createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusLabel = STATUS_LABELS[job.status] ?? job.status;
  const statusColor = STATUS_COLORS[job.status] ?? '#999';

  const handleCopyId = (event: React.MouseEvent): void => {
    event.stopPropagation();
    void navigator.clipboard.writeText(job.id);
  };

  return (
    <li
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
    >
      <div className={styles.header}>
        <span className={styles.id} title={job.id} onClick={handleCopyId}>
          {shortId}
        </span>
        <span className={styles.date}>{date}</span>
      </div>
      <div className={styles.statusRow}>
        <span
          className={styles.statusBadge}
          style={{ backgroundColor: statusColor }}
        >
          {statusLabel}
        </span>
        <div className={styles.stats}>
          <span className={styles.stat}>
            {job.stats.completed} / {job.stats.failed} / {job.stats.total}
          </span>
        </div>
      </div>
    </li>
  );
}
