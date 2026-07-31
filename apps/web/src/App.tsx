import { CreateJobForm, JobList, JobDetails } from './components';
import { useJobUrlSync } from './hooks';

import styles from './App.module.css';

export function App(): JSX.Element {
  useJobUrlSync();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>3205.team</h1>
      </header>
      <main className={styles.main}>
        <div className={styles.sidebar}>
          <CreateJobForm />
          <JobList />
        </div>
        <div className={styles.content}>
          <JobDetails />
        </div>
      </main>
    </div>
  );
}
