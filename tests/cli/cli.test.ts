// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe('Trae CLI', () => {
  let tempDir: string;
  let tempConfigPath: string;
  const cliPath = join(__dirname, '../../bin/trae-cli.cjs');

  beforeEach(() => {
    tempDir = join(tmpdir(), `trae_test_${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    tempConfigPath = join(tempDir, 'trae_config.json');
    
    // Create a test configuration
    const testConfig = {
      default_provider: 'anthropic',
      model_providers: {
        anthropic: {
          api_key: 'test-api-key',
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096
        }
      },
      max_steps: 5
    };
    
    writeFileSync(tempConfigPath, JSON.stringify(testConfig, null, 2));
  });

  afterEach(() => {
    // Clean up temp files
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
    try {
      if (existsSync(tempDir)) {
        // Remove directory recursively
        const rimraf = require('rimraf');
        rimraf.sync(tempDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('CLI Commands', () => {
    it('should show help when no arguments provided', (done) => {
      const child = spawn('node', [cliPath, '--help'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(stdout).toContain('Trae Agent');
        expect(stdout).toContain('run');
        expect(stdout).toContain('interactive');
        expect(stdout).toContain('show-config');
        expect(stdout).toContain('tools');
        done();
      });
    }, 10000);

    it('should show version information', (done) => {
      const child = spawn('node', [cliPath, '--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(stdout).toContain('0.1.0');
        done();
      });
    }, 5000);

    it('should show available tools', (done) => {
      const child = spawn('node', [cliPath, 'tools'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(stdout).toContain('Available Tools');
        done();
      });
    }, 10000);

    it('should show configuration', (done) => {
      const child = spawn('node', [cliPath, 'show-config', '--config-file', tempConfigPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(stdout).toContain('anthropic');
        expect(stdout).toContain('claude-3-5-sonnet-20241022');
        done();
      });
    }, 10000);
  });

  describe('Run Command', () => {
    it('should handle simple task with dry run (no actual API call)', (done) => {
      // Create a simple task file
      const taskFile = join(tempDir, 'test_task.txt');
      writeFileSync(taskFile, 'Create a simple hello world function in JavaScript');

      const child = spawn('node', [
        cliPath,
        'run',
        taskFile,
        '--config-file', tempConfigPath,
        '--max-steps', '1',
        '--working-dir', tempDir
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });

      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        // The command might fail due to no real API key, but it should at least start
        expect(stdout || stderr).toContain('Trae Agent');
        done();
      });

      // Kill the process after 25 seconds to prevent hanging
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          done();
        }
      }, 25000);
    }, 30000);

    it('should validate required arguments', (done) => {
      const child = spawn('node', [cliPath, 'run'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        expect(code).not.toBe(0);
        expect(stderr).toContain('error');
        done();
      });
    }, 5000);
  });

  describe('Interactive Command', () => {
    it('should start interactive mode and exit gracefully', (done) => {
      const child = spawn('node', [
        cliPath,
        'interactive',
        '--config-file', tempConfigPath,
        '--max-steps', '1'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Send exit command after seeing the prompt
        if (stdout.includes('Trae Agent') || stdout.includes('>')  || stdout.includes('Enter')) {
          child.stdin.write('exit\n');
        }
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        // Should start interactive mode (might fail due to API key but should show startup)
        expect(stdout || stderr).toContain('Trae Agent');
        done();
      });

      // Kill the process after 15 seconds to prevent hanging
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          done();
        }
      }, 15000);
    }, 20000);
  });

  describe('Error Handling', () => {
    it('should handle invalid config file gracefully', (done) => {
      const invalidConfigPath = join(tempDir, 'invalid_config.json');
      writeFileSync(invalidConfigPath, '{ invalid json }');

      const child = spawn('node', [
        cliPath,
        'show-config',
        '--config-file', invalidConfigPath
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        expect(code).not.toBe(0);
        expect(stderr).toContain('error');
        done();
      });
    }, 10000);

    it('should handle non-existent config file', (done) => {
      const nonExistentPath = join(tempDir, 'does_not_exist.json');

      const child = spawn('node', [
        cliPath,
        'show-config',
        '--config