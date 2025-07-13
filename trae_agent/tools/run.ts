// Copyright (c) 2023 Anthropic
// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: MIT
//
// This file has been modified by ByteDance Ltd. and/or its affiliates. on 13 June 2025
//
// Original file was released under MIT License, with the full license text
// available at https://github.com/anthropics/anthropic-quickstarts/blob/main/LICENSE
//
// This modified file is released under the same license.

/**
 * Utility to run shell commands asynchronously with a timeout.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

const TRUNCATED_MESSAGE: string =
  '<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>';
const MAX_RESPONSE_LEN: number = 16000;

/**
 * Truncate content and append a notice if content exceeds the specified length.
 */
export function maybeTruncate(
  content: string,
  truncateAfter: number | null = MAX_RESPONSE_LEN
): string {
  return !truncateAfter || content.length <= truncateAfter
    ? content
    : content.slice(0, truncateAfter) + TRUNCATED_MESSAGE;
}

/**
 * Run a shell command asynchronously with a timeout.
 * @param cmd - The shell command to execute
 * @param timeout - Timeout in seconds (default: 120.0)
 * @param truncateAfter - Maximum response length before truncation (default: MAX_RESPONSE_LEN)
 * @returns Promise resolving to [returnCode, stdout, stderr]
 */
export async function run(
  cmd: string,
  timeout: number | null = 120.0, // seconds
  truncateAfter: number | null = MAX_RESPONSE_LEN
): Promise<[number, string, string]> {
  return new Promise((resolve, reject) => {
    // Split command into shell and args for cross-platform compatibility
    const shell = process.platform === 'win32' ? 'cmd' : 'sh';
    const shellFlag = process.platform === 'win32' ? '/c' : '-c';

    const childProcess = spawn(shell, [shellFlag, cmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;
    let isTimedOut = false;

    // Set up timeout
    if (timeout !== null && timeout > 0) {
      timeoutId = setTimeout(() => {
        isTimedOut = true;
        childProcess.kill('SIGTERM');
        // Force kill after 5 seconds if SIGTERM doesn't work
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
        reject(
          new Error(`Command '${cmd}' timed out after ${timeout} seconds`)
        );
      }, timeout * 1000);
    }

    // Collect stdout
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    // Collect stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Handle process completion
    childProcess.on('close', (code: number | null) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isTimedOut) {
        return; // Already handled by timeout
      }

      const returnCode = code || 0;
      const truncatedStdout = maybeTruncate(stdout, truncateAfter);
      const truncatedStderr = maybeTruncate(stderr, truncateAfter);

      resolve([returnCode, truncatedStdout, truncatedStderr]);
    });

    // Handle process errors
    childProcess.on('error', (error: Error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isTimedOut) {
        return; // Already handled by timeout
      }

      reject(error);
    });
  });
}

export { TRUNCATED_MESSAGE, MAX_RESPONSE_LEN };
