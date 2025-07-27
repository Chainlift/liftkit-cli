import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {initCommand} from './app.js';
import * as base from './lib/base.js';

// Type for mock fetch return value
// Mock the base module
vi.mock('./lib/base.js', () => ({
  question: vi.fn(),
  rl: {
    close: vi.fn(),
  },
  fileExists: vi.fn(),
  readJsonFile: vi.fn(),
  getFilePath: vi.fn(),
  save: vi.fn(),
  fetch: vi.fn(),
  hasPackageJson: vi.fn(() => true),
  tsconfigPathsMatch: vi.fn(),
  mergeJson: vi.fn(),
}));

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip confirmations when --yes option is provided', async () => {
    // Mock file existence checks
    vi.mocked(base.fileExists).mockReturnValue(false);
    vi.mocked(base.getFilePath).mockImplementation(path => `/mock/${path}`);
    vi.mocked(base.fetch).mockResolvedValue({
      getValidator: vi.fn().mockResolvedValue(vi.fn()),
      json: vi.fn().mockResolvedValue({}),
      file: vi.fn().mockResolvedValue('File downloaded successfully'),
    } satisfies ReturnType<typeof base.fetch>);

    // Call initCommand with --yes option
    await initCommand({yes: true});

    // Verify that no questions were asked
    expect(base.question).not.toHaveBeenCalled();
  });

  it('should ask for confirmation when --yes option is not provided', async () => {
    // Mock file existence checks
    vi.mocked(base.fileExists).mockReturnValue(false);
    vi.mocked(base.getFilePath).mockImplementation(path => `/mock/${path}`);
    vi.mocked(base.fetch).mockResolvedValue({
      getValidator: vi.fn().mockResolvedValue(vi.fn()),
      json: vi.fn().mockResolvedValue({}),
      file: vi.fn().mockResolvedValue('File downloaded successfully'),
    } satisfies ReturnType<typeof base.fetch>);

    // Mock user response
    vi.mocked(base.question).mockResolvedValue('y');

    // Call initCommand without --yes option
    await initCommand();

    // Verify that questions were asked
    expect(base.question).toHaveBeenCalled();
  });

  it('should default to yes when user just presses enter', async () => {
    // Mock file existence checks
    vi.mocked(base.fileExists).mockReturnValue(false);
    vi.mocked(base.getFilePath).mockImplementation(path => `/mock/${path}`);
    vi.mocked(base.fetch).mockResolvedValue({
      getValidator: vi.fn().mockResolvedValue(vi.fn()),
      json: vi.fn().mockResolvedValue({}),
      file: vi.fn().mockResolvedValue('File downloaded successfully'),
    } satisfies ReturnType<typeof base.fetch>);

    // Mock user response (empty string = just pressing enter)
    vi.mocked(base.question).mockResolvedValue('');

    // Call initCommand without --yes option
    await initCommand();

    // Verify that questions were asked
    expect(base.question).toHaveBeenCalled();
  });

  it('should respect user input when they explicitly say no', async () => {
    // Mock file existence checks
    vi.mocked(base.fileExists).mockReturnValue(false);
    vi.mocked(base.getFilePath).mockImplementation(path => `/mock/${path}`);
    vi.mocked(base.fetch).mockResolvedValue({
      getValidator: vi.fn().mockResolvedValue(vi.fn()),
      json: vi.fn().mockResolvedValue({}),
      file: vi.fn().mockResolvedValue('File downloaded successfully'),
    } satisfies ReturnType<typeof base.fetch>);

    // Mock user response
    vi.mocked(base.question).mockResolvedValue('n');

    // Call initCommand without --yes option
    await initCommand();

    // Verify that questions were asked
    expect(base.question).toHaveBeenCalled();
  });
});
