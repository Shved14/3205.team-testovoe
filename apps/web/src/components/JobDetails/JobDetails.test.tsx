import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobDetail } from '@repo/shared';

import { jobsStore } from '../../store';
import { JobDetails } from './JobDetails';

describe('JobDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: null,
      detailsById: {},
      ui: {
        creating: false,
        createError: null,
        listLoading: false,
        listError: null,
        detailLoading: false,
        detailError: null,
        cancelling: false,
      },
    });
  });

  const mockJobDetail: JobDetail = {
    id: 'test-job-id',
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stats: {
      total: 10,
      completed: 5,
      failed: 2,
      pending: 3,
    },
    results: [
      {
        url: 'https://example.com/1',
        status: 'done',
        httpStatusCode: 200,
        errorMessage: null,
        checkedAt: '2026-01-01T00:00:01.000Z',
      },
      {
        url: 'https://example.com/2',
        status: 'error',
        httpStatusCode: 500,
        errorMessage: 'Internal Server Error',
        checkedAt: '2026-01-01T00:00:02.000Z',
      },
    ],
  };

  it('shows empty state when no job is selected', () => {
    render(<JobDetails />);

    expect(screen.getByText(/выберите задание для просмотра деталей/i)).toBeInTheDocument();
  });

  it('shows job details when job is selected', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
    });

    render(<JobDetails />);

    expect(screen.getByText(/детали задания/i)).toBeInTheDocument();
    expect(screen.getByText(/статус:/i)).toBeInTheDocument();
    expect(screen.getByText(/выполняется/i)).toBeInTheDocument();
  });

  it('shows cancel button when job status is non-terminal', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
    });

    render(<JobDetails />);

    const cancelButton = screen.getByRole('button', { name: /отменить задание/i });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).not.toBeDisabled();
  });

  it('shows cancelling text when ui.cancelling is true', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
      ui: {
        ...jobsStore.getState().ui,
        cancelling: true,
      },
    });

    render(<JobDetails />);

    const cancelButton = screen.getByRole('button', { name: /отменяется…/i });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toBeDisabled();
  });

  it('hides cancel button when job status is completed', () => {
    const completedJob: JobDetail = {
      ...mockJobDetail,
      status: 'completed',
      stats: {
        total: 10,
        completed: 10,
        failed: 0,
        pending: 0,
      },
    };

    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': completedJob,
      },
    });

    render(<JobDetails />);

    expect(screen.queryByRole('button', { name: /отменить задание/i })).not.toBeInTheDocument();
  });

  it('hides cancel button when job status is cancelled', () => {
    const cancelledJob: JobDetail = {
      ...mockJobDetail,
      status: 'cancelled',
    };

    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': cancelledJob,
      },
    });

    render(<JobDetails />);

    expect(screen.queryByRole('button', { name: /отменить задание/i })).not.toBeInTheDocument();
  });

  it('hides cancel button when job status is failed', () => {
    const failedJob: JobDetail = {
      ...mockJobDetail,
      status: 'failed',
    };

    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': failedJob,
      },
    });

    render(<JobDetails />);

    expect(screen.queryByRole('button', { name: /отменить задание/i })).not.toBeInTheDocument();
  });

  it('shows progress bar with correct values', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
    });

    render(<JobDetails />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '7'); // 5 completed + 2 failed
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '10');
    expect(progressBar).toHaveAttribute('aria-live', 'polite');

    expect(screen.getByText(/7 из 10 обработано/i)).toBeInTheDocument();
  });

  it('shows progress bar with zero processed when no results', () => {
    const pendingJob: JobDetail = {
      ...mockJobDetail,
      status: 'pending',
      stats: {
        total: 10,
        completed: 0,
        failed: 0,
        pending: 10,
      },
      results: [],
    };

    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': pendingJob,
      },
    });

    render(<JobDetails />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/0 из 10 обработано/i)).toBeInTheDocument();
  });

  it('shows detailError when present', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
      ui: {
        ...jobsStore.getState().ui,
        detailError: 'Failed to load job details',
      },
    });

    render(<JobDetails />);

    expect(screen.getByText('Failed to load job details')).toBeInTheDocument();
  });

  it('renders UrlTable with job results', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
    });

    render(<JobDetails />);

    expect(screen.getByText('https://example.com/1')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/2')).toBeInTheDocument();
  });

  it('calls cancelActiveJob when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const cancelSpy = vi.spyOn(jobsStore.getState(), 'cancelActiveJob').mockResolvedValue(undefined);

    jobsStore.setState({
      ...jobsStore.getState(),
      activeJobId: 'test-job-id',
      detailsById: {
        'test-job-id': mockJobDetail,
      },
    });

    render(<JobDetails />);

    const cancelButton = screen.getByRole('button', { name: /отменить задание/i });
    await user.click(cancelButton);

    expect(cancelSpy).toHaveBeenCalled();

    cancelSpy.mockRestore();
  });
});
