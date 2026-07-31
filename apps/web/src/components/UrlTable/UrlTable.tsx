import { useState } from 'react';
import type { UrlResult, UrlStatus } from '@repo/shared';

import { UrlStatusBadge } from './UrlStatusBadge';

import styles from './UrlTable.module.css';

const PAGE_SIZE = 200;

interface UrlTableProps {
  results: UrlResult[];
}

const STATUS_ORDER: Record<UrlStatus, number> = {
  error: 0,
  cancelled: 1,
  done: 2,
  running: 3,
  pending: 4,
};

export function UrlTable({ results }: UrlTableProps): JSX.Element {
  const [page, setPage] = useState(0);

  const sortedResults = [...results].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 999;
    const orderB = STATUS_ORDER[b.status] ?? 999;
    return orderA - orderB;
  });

  const totalPages = Math.ceil(sortedResults.length / PAGE_SIZE);
  const paginatedResults = sortedResults.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const handlePreviousPage = (): void => {
    setPage((p) => Math.max(0, p - 1));
  };

  const handleNextPage = (): void => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  };

  const formatDuration = (checkedAt: string | null): string => {
    if (!checkedAt) return '-';
    // For now, just return placeholder since we don't have start time data
    return '-';
  };

  const formatTime = (checkedAt: string | null): string => {
    if (!checkedAt) return '-';
    return new Date(checkedAt).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.headerUrl}>URL</th>
            <th className={styles.headerStatus}>Статус</th>
            <th className={styles.headerCode}>HTTP-код</th>
            <th className={styles.headerError}>Ошибка</th>
            <th className={styles.headerDuration}>Длительность</th>
            <th className={styles.headerTime}>Время начала</th>
          </tr>
        </thead>
        <tbody>
          {paginatedResults.map((result, index) => (
            <tr key={`${result.url}-${index}`} className={styles.row}>
              <td className={styles.cellUrl} title={result.url}>
                {result.url}
              </td>
              <td className={styles.cellStatus}>
                <UrlStatusBadge status={result.status} />
              </td>
              <td className={styles.cellCode}>
                {result.httpStatusCode ?? '-'}
              </td>
              <td className={styles.cellError}>
                {result.errorMessage
                  ? `${result.httpStatusCode ?? 'N/A'}: ${result.errorMessage}`
                  : '-'}
              </td>
              <td className={styles.cellDuration}>
                {formatDuration(result.checkedAt)}
              </td>
              <td className={styles.cellTime}>
                {formatTime(result.checkedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageButton}
            onClick={handlePreviousPage}
            disabled={page === 0}
          >
            Назад
          </button>
          <span className={styles.pageInfo}>
            Страница {page + 1} из {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={handleNextPage}
            disabled={page === totalPages - 1}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
