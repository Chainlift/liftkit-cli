import {describe, it, expect, vi, beforeEach} from 'vitest';
import {processDependencies} from './app.js';

const mockFetch = vi.fn();
const mockValidate = vi.fn();
const mockProcessRegistryItem = vi.fn();
const mockConsoleError = vi.fn();

const processor = {validate: mockValidate};
const registryProcessor = {processRegistryItem: mockProcessRegistryItem};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processDependencies', () => {
  it('processes all valid dependencies', async () => {
    mockFetch.mockResolvedValue({json: () => Promise.resolve({valid: true})});
    mockValidate.mockReturnValue({isValid: true});
    const deps = ['url1', 'url2'];
    await processDependencies(
      deps,
      mockFetch,
      processor,
      registryProcessor,
      mockConsoleError,
    );
    expect(mockProcessRegistryItem).toHaveBeenCalledTimes(2);
  });

  it('skips invalid dependencies and logs errors', async () => {
    mockFetch.mockResolvedValue({json: () => Promise.resolve({valid: false})});
    mockValidate.mockReturnValue({isValid: false, errors: ['err']});
    const deps = ['url1'];
    await processDependencies(
      deps,
      mockFetch,
      processor,
      registryProcessor,
      mockConsoleError,
    );
    expect(mockProcessRegistryItem).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('fail'));
    const deps = ['url1'];
    await processDependencies(
      deps,
      mockFetch,
      processor,
      registryProcessor,
      mockConsoleError,
    );
    expect(mockConsoleError).toHaveBeenCalled();
  });
});
