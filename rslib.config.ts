import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      syntax: 'es2022',
      dts: {
        bundle: false,
      },
      bundle: false,
    },
  ],
  source: {
    entry: {
      // Main package entry
      'index': './trae_agent/index.ts',
      // CLI entry point
      'cli': './trae_agent/cli.ts',
    },
  },
  output: {
    target: 'node',
  },
  tools: {
    rspack: {
      externals: {
        // Mark Node.js built-ins as external
        'node:fs': 'fs',
        'node:path': 'path',
        'node:os': 'os',
        'node:child_process': 'child_process',
        'node:util': 'util',
        'node:events': 'events',
        'node:stream': 'stream',
        'node:crypto': 'crypto',
        fs: 'fs',
        path: 'path',
        os: 'os',
        child_process: 'child_process',
        util: 'util',
        events: 'events',
        stream: 'stream',
        crypto: 'crypto',
        vm: 'vm',
        'node:vm': 'vm',
        readline: 'readline',
        'node:readline': 'readline',
        'node:process': 'process',
      },
    },
  },
});
