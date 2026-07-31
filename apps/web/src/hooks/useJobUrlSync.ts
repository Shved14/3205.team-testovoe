import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { jobsStore } from '../store';

export function useJobUrlSync(): void {
  const { activeJobId, setActiveJob } = jobsStore(
    useShallow((state) => ({
      activeJobId: state.activeJobId,
      setActiveJob: state.setActiveJob,
    })),
  );

  // Sync from URL to store on mount and URL changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobFromUrl = params.get('job');

    if (jobFromUrl && jobFromUrl !== activeJobId) {
      setActiveJob(jobFromUrl);
    }
  }, [activeJobId, setActiveJob]);

  // Sync from store to URL when activeJobId changes
  useEffect(() => {
    const url = new URL(window.location.href);

    if (activeJobId) {
      url.searchParams.set('job', activeJobId);
    } else {
      url.searchParams.delete('job');
    }

    const newUrl = url.toString();
    if (newUrl !== window.location.href) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [activeJobId]);
}
