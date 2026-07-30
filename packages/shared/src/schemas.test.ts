import { describe, expect, it } from 'vitest';

import { createJobSchema } from '../src/schemas';

function expectFailureAtUrlIndex(
  urls: string[],
  expectedIndex: number,
): void {
  const result = createJobSchema.safeParse({ urls });

  expect(result.success).toBe(false);

  if (result.success) {
    return;
  }

  const issueWithIndex = result.error.issues.find((issue) =>
    issue.path.includes(expectedIndex),
  );

  expect(issueWithIndex).toBeDefined();
}

describe('createJobSchema', () => {
  it('accepts valid http and https URLs', () => {
    const result = createJobSchema.safeParse({
      urls: ['https://example.com', 'http://example.org/path?q=1'],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.urls).toEqual([
        'https://example.com',
        'http://example.org/path?q=1',
      ]);
    }
  });

  it('trims URL strings before validation', () => {
    const result = createJobSchema.safeParse({
      urls: ['  https://example.com/trimmed  '],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.urls).toEqual(['https://example.com/trimmed']);
    }
  });

  it('rejects ftp:// with the problematic URL index', () => {
    expectFailureAtUrlIndex(['ftp://example.com'], 0);
  });

  it('rejects host without protocol with the problematic URL index', () => {
    expectFailureAtUrlIndex(['example.com'], 0);
  });

  it('rejects javascript: URLs with the problematic URL index', () => {
    expectFailureAtUrlIndex(['javascript:alert(1)'], 0);
  });

  it('rejects URLs longer than 2048 characters with the problematic URL index', () => {
    expectFailureAtUrlIndex([`https://example.com/${'a'.repeat(3000)}`], 0);
  });

  it('rejects URLs with username and password with the problematic URL index', () => {
    expectFailureAtUrlIndex(['https://u:p@example.com'], 0);
  });

  it('rejects an empty urls array', () => {
    const result = createJobSchema.safeParse({ urls: [] });

    expect(result.success).toBe(false);
  });

  it('rejects 501 URLs and reports the index of the overflow element', () => {
    const urls = Array.from({ length: 501 }, (_, index) => `https://example.com/${index}`);

    expectFailureAtUrlIndex(urls, 500);
  });
});
