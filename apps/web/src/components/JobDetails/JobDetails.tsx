import { useShallow } from 'zustand/react/shallow';

import { isTerminalJobStatus, jobsStore, selectActiveDetail, selectProgress } from '../../store';

import { EmptyState } from '../EmptyState';
import { UrlTable } from '../UrlTable';

import styles from './JobDetails.module.css';

export function JobDetails(): JSX.Element {
  const { activeJobId, cancelActiveJob, ui } = jobsStore(
    useShallow((state) => ({
      activeJobId: state.activeJobId,
      cancelActiveJob: state.cancelActiveJob,
      ui: state.ui,
    })),
  );

  const detail = jobsStore(selectActiveDetail);
  const progress = jobsStore(selectProgress);

  if (!activeJobId || !detail) {
    return (
      <div className={styles.container}>
        <EmptyState message="Выберите задание для просмотра деталей" />
      </div>
    );
  }

  const isTerminal = selectIsTerminalJobStatus(detail.status);
  const isCancelling = ui.cancelling;

  const handleCancel = async (): Promise<void> => {
    await cancelActiveJob();
  };

  const STATUS_LABELS: Record<string, string> = {
    pending: 'Ожидает',
    running: 'Выполняется',
    completed: 'Завершено',
    failed: 'Ошибка',
    cancelled: 'Отменено',
  };

  const statusLabel = STATUS_LABELS[detail.status] ?? detail.status;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Детали задания</h2>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>Статус:</span>
          <span className={styles.statusValue}>{statusLabel}</span>
        </div>
      </div>

      {progress && (
        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`,
              }}
              role="progressbar"
              aria-valuenow={progress.processed}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-live="polite"
            />
          </div>
          <div className={styles.progressText}>
            {progress.processed} из {progress.total} обработано
          </div>
        </div>
      )}

      {!isTerminal && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? 'Отменяется…' : 'Отменить задание'}
          </button>
        </div>
      )}

      {ui.detailError && (
        <div className={styles.error}>{ui.detailError}</div>
      )}

      <div className={styles.tableSection}>
        <UrlTable results={detail.results} />
      </div>
    </div>
  );
}
