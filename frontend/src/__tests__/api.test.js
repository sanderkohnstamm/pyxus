import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the droneStore import that api.js uses at module level
vi.mock('../store/droneStore', () => ({
  default: {
    getState: () => ({ activeDroneId: null }),
  },
}));

// Must import after mock setup
const { fetchWithTimeout } = await import('../utils/api');

describe('fetchWithTimeout', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls fetch with the abort signal', async () => {
    const mockResponse = { ok: true, status: 200 };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('/api/test', { method: 'GET' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/test');
    expect(options.method).toBe('GET');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result).toBe(mockResponse);
  });

  it('passes through a successful fetch response', async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({ data: 42 }) };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('/api/data');

    expect(result).toBe(mockResponse);
    const data = await result.json();
    expect(data).toEqual({ data: 42 });
  });

  it('aborts fetch after timeout', async () => {
    vi.useFakeTimers();

    // fetch that never resolves
    globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const promise = fetchWithTimeout('/api/slow', {}, 500);

    // Advance past the timeout
    vi.advanceTimersByTime(600);

    await expect(promise).rejects.toThrow('aborted');

    vi.useRealTimers();
  });

  it('clears timeout on successful fetch', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await fetchWithTimeout('/api/fast');

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
