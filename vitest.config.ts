import { defineConfig } from 'vitest/config';

export default defineConfig({
  coverage: {
    reporter: ['text'], // Only show coverage in the CLI
  },
}); 