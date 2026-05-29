import { describe, it, expect, vi } from 'vitest';
import { copyText } from '../clipboard';

describe('copyText', () => {
  it('calls navigator.clipboard.writeText once with the provided text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await copyText('[[abc]]');

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('[[abc]]');
  });

  it('propagates rejection if writeText rejects', async () => {
    const clipboardError = new Error('clipboard unavailable');
    const writeText = vi.fn().mockRejectedValue(clipboardError);
    Object.assign(navigator, { clipboard: { writeText } });

    await expect(copyText('[[abc]]')).rejects.toThrow('clipboard unavailable');
  });
});
