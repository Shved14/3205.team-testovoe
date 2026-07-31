import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jobsStore } from '../../store';
import { CreateJobForm } from './CreateJobForm';

describe('CreateJobForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobsStore.setState({
      ...jobsStore.getState(),
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

  it('renders textarea and submit button', () => {
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);
    const button = screen.getByRole('button', { name: /запустить проверку/i });

    expect(textarea).toBeInTheDocument();
    expect(button).toBeInTheDocument();
  });

  it('shows validation error for invalid URL', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await user.type(textarea, 'not-a-valid-url');

    await waitFor(() => {
      expect(screen.getByText(/строка 1:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/invalid url/i)).toBeInTheDocument();
  });

  it('shows validation error for URL with unsupported protocol', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await user.type(textarea, 'ftp://example.com');

    await waitFor(() => {
      expect(screen.getByText(/строка 1:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/protocol must be http or https/i)).toBeInTheDocument();
  });

  it('shows validation error for URL with username/password', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await user.type(textarea, 'https://user:pass@example.com');

    await waitFor(() => {
      expect(screen.getByText(/строка 1:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/must not contain username or password/i)).toBeInTheDocument();
  });

  it('shows counter with correct counts', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await user.type(textarea, 'https://example.com\nnot-valid\nhttps://example.org');

    await waitFor(() => {
      expect(screen.getByText(/3 url, 1 ошибка/i)).toBeInTheDocument();
    });
  });

  it('disables submit button when no valid URLs', () => {
    render(<CreateJobForm />);

    const button = screen.getByRole('button', { name: /запустить проверку/i });

    expect(button).toBeDisabled();
  });

  it('enables submit button when valid URL is entered', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);
    const button = screen.getByRole('button', { name: /запустить проверку/i });

    expect(button).toBeDisabled();

    await user.type(textarea, 'https://example.com');

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('disables submit button when ui.creating is true', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      ui: {
        ...jobsStore.getState().ui,
        creating: true
      }
    });

    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);
    const button = screen.getByRole('button', { name: /создание\.\.\./i });

    expect(button).toBeDisabled();
    expect(textarea).toBeDisabled();
  });

  it('shows createError from store', () => {
    jobsStore.setState({
      ...jobsStore.getState(),
      ui: {
        ...jobsStore.getState().ui,
        createError: 'Test error'
      }
    });

    render(<CreateJobForm />);

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('calls createJob with valid URLs on submit', async () => {
    const user = userEvent.setup();
    const createJobSpy = vi.spyOn(jobsStore.getState(), 'createJob');

    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);
    const button = screen.getByRole('button', { name: /запустить проверку/i });

    await user.type(textarea, 'https://example.com\nhttps://example.org');

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    await user.click(button);

    expect(createJobSpy).toHaveBeenCalledWith(
      'https://example.com\nhttps://example.org'
    );
  });

  it('clears textarea and errors after successful submit', async () => {
    const user = userEvent.setup();
    const createJobSpy = vi.spyOn(jobsStore.getState(), 'createJob').mockResolvedValue(undefined);

    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/) as HTMLTextAreaElement;
    const button = screen.getByRole('button', { name: /запустить проверку/i });

    await user.type(textarea, 'https://example.com');

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    await user.click(button);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });

    expect(screen.queryByText(/строка \d+:/i)).not.toBeInTheDocument();

    createJobSpy.mockRestore();
  });

  it('shows multiple validation errors for multiple invalid URLs', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    await user.type(textarea, 'not-valid-1\nnot-valid-2');

    await waitFor(() => {
      expect(screen.getByText(/строка 1:/i)).toBeInTheDocument();
      expect(screen.getByText(/строка 2:/i)).toBeInTheDocument();
    });
  });

  it('validates URL length limit', async () => {
    const user = userEvent.setup();
    render(<CreateJobForm />);

    const textarea = screen.getByPlaceholderText(/https:\/\/example\.com/);

    const longUrl = 'https://example.com/' + 'a'.repeat(3000);

    await user.type(textarea, longUrl);

    await waitFor(() => {
      expect(screen.getByText(/строка 1:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/invalid url/i)).toBeInTheDocument();
  });
});
