import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { jobsStore } from '../../store';

import { EmptyState } from '../EmptyState';
import { JobListItem } from './JobListItem';

import styles from './JobList.module.css';

export function JobList(): JSX.Element {
  const { jobs, fetchJobs, ui, setActiveJob, activeJobId } = jobsStore(
    useShallow((state) => ({
      jobs: state.jobs,
      fetchJobs: state.fetchJobs,
      ui: state.ui,
      setActiveJob: state.setActiveJob,
      activeJobId: state.activeJobId,
    })),
  );

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleSelectJob = (id: string): void => {
    setActiveJob(id);
  };

  if (jobs.length === 0 && !ui.listLoading) {
    return <EmptyState message="Нет заданий" />;
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Задания</h2>
      {ui.listError && <div className={styles.error}>{ui.listError}</div>}
      <ul className={styles.list}>
        {jobs.map((job) => (
          <JobListItem
            key={job.id}
            job={job}
            isActive={job.id === activeJobId}
            onSelect={handleSelectJob}
          />
        ))}
      </ul>
    </div>
  );
}
