import { createJobsStore } from './jobs-store';

export const jobsStore = createJobsStore();

export {
  createJobsStore,
  hasNonTerminalJobs,
  isTerminalJobStatus,
  parseUrlsFromTextarea,
  useJobsStore,
} from './jobs-store';
export type {
  CreateJobsStoreOptions,
  JobsActions,
  JobsApiPort,
  JobsState,
  JobsStore,
  JobsUiState,
} from './jobs-store';
export {
  selectActiveDetail,
  selectHasActiveJobs,
  selectIsTerminalStatus,
  selectProgress,
} from './selectors';
export { isTerminalJobStatus as selectIsTerminalJobStatus } from './jobs-store';
