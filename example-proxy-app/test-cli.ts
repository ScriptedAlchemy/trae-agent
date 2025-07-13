#!/usr/bin/env npx tsx

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Test script for Trae Agent CLI with proxy configuration
 * This script runs the Trae Agent CLI with a simple prompt to verify
 * that it works correctly with the configured HTTP proxy.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TRAE_CLI_PATH = path.join(__dirname, '..', 'bin', 'trae-cli.cjs');
const CONFIG_PATH = path.join(__dirname, 'trae_config.json');
const TEST_PROMPT = 'Hello! Please respond with a simple greeting and confirm you can access the Anthropic API.';

function checkPrerequisites(): boolean {
  // Check if trae-cli.cjs exists
  if (!fs.existsSync(TRAE_CLI_PATH)) {
    console.error('❌ Trae CLI not found at:', TRAE_CLI_PATH);
    console.error('Please run "npm run build" in the root directory first.');
    return false;
  }

  // Check if config exists
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ Config file not found at:', CONFIG_PATH);
    console.error('Please ensure trae_config.json exists in the example-proxy-app directory.');
    return false;
  }

  console.log('✅ Prerequisites check passed');
  return true;
}

function runTraeAgent(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Trae Agent CLI test...');
    console.log('📝 Prompt:', TEST_PROMPT);
    console.log('⚙️  Config:', CONFIG_PATH);
    console.log('🔄 Running...');
    console.log('---');

    const child = spawn('node', [TRAE_CLI_PATH, 'run', TEST_PROMPT], {
      cwd: __dirname,
      stdio: 'inherit',
      env: {
        ...process.env,
        TRAE_CONFIG_PATH: CONFIG_PATH
      }
    });

    child.on('close', (code) => {
      console.log('---');
      if (code === 0) {
        console.log('✅ Trae Agent CLI test completed successfully!');
        console.log('🎉 The proxy configuration appears to be working correctly.');
        resolve();
      } else {
        console.error(`❌ Trae Agent CLI test failed with exit code: ${code}`);
        console.error('🔍 Check the output above for error details.');
        console.error('💡 Make sure your proxy server is running and the API key is configured correctly.');
        reject(new Error(`CLI exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error('❌ Failed to start Trae Agent CLI:', error.message);
      reject(error);
    });
  });
}

async function main() {
  console.log('🧪 Trae Agent CLI Test with Proxy Configuration');
  console.log('================================================');
  
  try {
    if (!checkPrerequisites()) {
      process.exit(1);
    }

    await runTraeAgent();
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}