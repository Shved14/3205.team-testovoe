import type {
  JobDetail,
  JobStatus,
  JobSummary,
  ListJobsQuery,
} from '@repo/shared';
import { createJobSchema } from '@repo/shared';
import { create, type UseBoundStore } from 'zustand';

import { ApiError, isAbortError } from '../api/httpClient';
import * as defaultJobsApi from '../api/jobsApi';
import { PollController } from '../polling/poll-controller';

const LIST_POLL_ID = '__jobs_list__';
const DEFAULT_LIST_QUERY: ListJobsQuery = { limit: 20, offset: 0 };

export type JobsUiState = {
  creating: boolean;
  createError: string | null;
  listLoading: boolean;
  listError: string | null;
  detailLoading: boolean;
  detailError: string | null;
  cancelling: boolean;
};

export type JobsState = {
  jobs: JobSummary[];
  jobsTotal: number;
  activeJobId: string | null;
  detailsById: Record<string, JobDetail>;
  ui: JobsUiState;
};

export type JobsActions = {
  fetchJobs: () => Promise<void>;
  createJob: (rawText: string) => Promise<void>;
  setActiveJob: (id: string | null) => void;
  cancelActiveJob: () => Promise<void>;
  startDetailPolling: (jobId: string) => void;
  stopDetailPolling: () => void;
};

export type JobsStore = JobsState & JobsActions;

export type JobsApiPort = {
  createJob: typeof defaultJobsApi.createJob;
  getJobs: typeof defaultJobsApi.getJobs;
  getJob: typeof defaultJobsApi.getJob;
  cancelJob: typeof defaultJobsApi.cancelJob;
};

export type CreateJobsStoreOptions = {
  api?: JobsApiPort;
  detailPoller?: PollController;
  listPoller?: PollController;
  listQuery?: ListJobsQuery;
};

const initialUi: JobsUiState = {
  creating: false,
  createError: null,
  listLoading: false,
  listError: null,
  detailLoading: false,
  detailError: null,
  cancelling: false,
};

const initialState: JobsState = {
  jobs: [],
  jobsTotal: 0,
  activeJobId: null,
  detailsById: {},
  ui: initialUi,
};

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'cancelled',
  'failed',
]);

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function hasNonTerminalJobs(jobs: readonly JobSummary[]): boolean {
  return jobs.some((job) => !isTerminalJobStatus(job.status));
}

export function parseUrlsFromTextarea(rawText: string): string[] {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Unexpected error';
}

export function createJobsStore(
  options: CreateJobsStoreOptions = {},
): UseBoundStore<JobsStore> {
  const api = options.api ?? defaultJobsApi;
  const detailPoller = options.detailPoller ?? new PollController({ intervalMs: 1000 });
  const listPoller = options.listPoller ?? new PollController({ intervalMs: 5000 });
  const listQuery = options.listQuery ?? DEFAULT_LIST_QUERY;

  return create<JobsStore>((set, get) => {
    const syncListPolling = (): void => {
      if (hasNonTerminalJobs(get().jobs)) {
        if (!listPoller.isRunning) {
          listPoller.start(LIST_POLL_ID, async (_id, signal) => {
            try {
              const response = await api.getJobs(listQuery, signal);
              set({
                jobs: response.items,
                jobsTotal: response.total,
                ui: { ...get().ui, listError: null },
              });
              return hasNonTerminalJobs(response.items) ? 'continue' : 'stop';
            } catch (error) {
              if (isAbortError(error)) {
                throw error;
              }
              set({
                ui: { ...get().ui, listError: readErrorMessage(error) },
              });
              return 'continue';
            }
          });
        }
      } else if (listPoller.isRunning) {
        listPoller.stop();
      }
    };

    const writeDetailIfCurrent = (
      jobId: string,
      generation: number,
      detail: JobDetail,
    ): boolean => {
      // generation — отсекает ответы после stop()/рестарта поллера (in-flight от старого цикла).
      // activeJobId — отсекает ответы после переключения пользователя на другое задание.
      if (generation !== detailPoller.generation || get().activeJobId !== jobId) {
        return false;
      }

      set((state) => ({
        detailsById: { ...state.detailsById, [jobId]: detail },
        jobs: state.jobs.map((job) =>
          job.id === jobId
            ? {
                id: detail.id,
                status: detail.status,
                createdAt: detail.createdAt,
                updatedAt: detail.updatedAt,
                stats: detail.stats,
              }
            : job,
        ),
        ui: {
          ...state.ui,
          detailLoading: false,
          detailError: null,
        },
      }));
      return true;
    };

    return {
      ...initialState,

      stopDetailPolling: () => {
        detailPoller.stop();
        set((state) => ({
          ui: { ...state.ui, detailLoading: false },
        }));
      },

      startDetailPolling: (jobId: string) => {
        const missingDetail = get().detailsById[jobId] === undefined;
        set((state) => ({
          ui: {
            ...state.ui,
            detailLoading: missingDetail,
            detailError: null,
          },
        }));

        detailPoller.start(jobId, async (polledJobId, signal, generation) => {
          try {
            const detail = await api.getJob(polledJobId, signal);
            const written = writeDetailIfCurrent(polledJobId, generation, detail);
            if (!written) {
              return 'stop';
            }
            return isTerminalJobStatus(detail.status) ? 'stop' : 'continue';
          } catch (error) {
            if (isAbortError(error)) {
              throw error;
            }

            if (
              generation !== detailPoller.generation ||
              get().activeJobId !== polledJobId
            ) {
              return 'stop';
            }

            set((state) => ({
              ui: {
                ...state.ui,
                detailLoading: false,
                detailError: readErrorMessage(error),
              },
            }));
            return 'continue';
          }
        });
      },

      setActiveJob: (id: string | null) => {
        get().stopDetailPolling();
        set({ activeJobId: id });
        if (id !== null) {
          get().startDetailPolling(id);
        }
      },

      fetchJobs: async () => {
        set((state) => ({
          ui: { ...state.ui, listLoading: true, listError: null },
        }));

        try {
          const response = await api.getJobs(listQuery);
          set((state) => ({
            jobs: response.items,
            jobsTotal: response.total,
            ui: { ...state.ui, listLoading: false, listError: null },
          }));
          syncListPolling();
        } catch (error) {
          if (isAbortError(error)) {
            set((state) => ({
              ui: { ...state.ui, listLoading: false },
            }));
            return;
          }
          set((state) => ({
            ui: {
              ...state.ui,
              listLoading: false,
              listError: readErrorMessage(error),
            },
          }));
        }
      },

      createJob: async (rawText: string) => {
        const urls = parseUrlsFromTextarea(rawText);
        const parsed = createJobSchema.safeParse({ urls });
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? 'Invalid URLs';
          set((state) => ({
            ui: { ...state.ui, createError: message, creating: false },
          }));
          return;
        }

        set((state) => ({
          ui: { ...state.ui, creating: true, createError: null },
        }));

        try {
          const created = await api.createJob(parsed.data.urls);
          get().stopDetailPolling();
          set((state) => ({
            activeJobId: created.jobId,
            ui: { ...state.ui, creating: false, createError: null },
          }));
          get().startDetailPolling(created.jobId);
          await get().fetchJobs();
        } catch (error) {
          if (isAbortError(error)) {
            set((state) => ({
              ui: { ...state.ui, creating: false },
            }));
            return;
          }
          set((state) => ({
            ui: {
              ...state.ui,
              creating: false,
              createError: readErrorMessage(error),
            },
          }));
        }
      },

      cancelActiveJob: async () => {
        const jobId = get().activeJobId;
        if (jobId === null) {
          return;
        }

        set((state) => ({
          ui: { ...state.ui, cancelling: true, detailError: null },
        }));

        try {
          await api.cancelJob(jobId);
          if (get().activeJobId === jobId) {
            detailPoller.requestTick();
          }
        } catch (error) {
          if (!isAbortError(error) && get().activeJobId === jobId) {
            set((state) => ({
              ui: {
                ...state.ui,
                detailError: readErrorMessage(error),
              },
            }));
          }
        } finally {
          set((state) => ({
            ui: { ...state.ui, cancelling: false },
          }));
        }
      },
    };
  });
}

export const useJobsStore = createJobsStore();
