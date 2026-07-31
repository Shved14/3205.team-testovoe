import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { jobUrlSchema } from '@repo/shared';

import { jobsStore, parseUrlsFromTextarea } from '../../store';

import styles from './CreateJobForm.module.css';

interface ValidationError {
  line: number;
  message: string;
}

export function CreateJobForm(): JSX.Element {
  const { createJob, ui } = jobsStore(
    useShallow((state) => ({
      createJob: state.createJob,
      ui: state.ui,
    })),
  );

  const [text, setText] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    const lines = text.split('\n');
    const errors: ValidationError[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return;
      }

      const result = jobUrlSchema.safeParse(trimmed);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? 'Invalid URL';
        errors.push({ line: index + 1, message });
      }
    });

    setValidationErrors(errors);
  }, [text]);

  const urls = parseUrlsFromTextarea(text);
  const validCount = urls.length - validationErrors.length;
  const hasValidUrls = validCount > 0;

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(event.target.value);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!hasValidUrls || ui.creating) {
      return;
    }

    await createJob(text);
    setText('');
    setValidationErrors([]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.textareaWrapper}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={handleTextChange}
          placeholder="https://example.com&#10;https://example.org"
          disabled={ui.creating}
          rows={10}
        />
        {validationErrors.length > 0 && (
          <div className={styles.errorList}>
            {validationErrors.map((error) => (
              <div key={error.line} className={styles.errorItem}>
                <span className={styles.errorLine}>Строка {error.line}:</span>{' '}
                <span className={styles.errorMessage}>{error.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.counter}>
          {urls.length} URL, {validationErrors.length} ошибка
          {validationErrors.length !== 1 ? 'и' : ''}
        </div>
        <button
          type="button"
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!hasValidUrls || ui.creating}
        >
          {ui.creating ? 'Создание...' : 'Запустить проверку'}
        </button>
      </div>

      {ui.createError && <div className={styles.createError}>{ui.createError}</div>}
    </div>
  );
}
