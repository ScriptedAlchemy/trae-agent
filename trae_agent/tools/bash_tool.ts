// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Bash tool for executing shell commands.
 */

import { spawn, ChildProcess } from 'child_process';
import { Tool, ToolExecResult, ToolParameter, ToolError, ToolCallArguments } from './base.js';
import * as os from 'os';

/**
 * A session of a bash shell.
 */
class _BashSession {
  private _started: boolean = false;
  private _timedOut: boolean = false;
  private _process: ChildProcess | null = null;
  private readonly command: string = '/bin/bash';
  private readonly _outputDelay: number = 200; // milliseconds
  private readonly _timeout: number = 120000; // milliseconds
  private readonly _sentinel: string = '<<exit>>';
  private _outputBuffer: string = '';
  private _errorBuffer: string = '';

  constructor() {
    this._started = false;
    this._timedOut = false;
    this._process = null;
  }

  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    // Windows compatibility
    const command = os.platform() === 'win32' ? 'cmd.exe' : this.command;
    const options = os.platform() === 'win32' ? {} : { detached: true };

    this._process = spawn(command, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      ...options,
    });

    if (!this._process.stdout || !this._process.stderr || !this._process.stdin) {
      throw new ToolError('Failed to create process pipes');
    }

    // Set up output buffering
    this._process.stdout.on('data', (data: Buffer) => {
      this._outputBuffer += data.toString();
    });

    this._process.stderr.on('data', (data: Buffer) => {
      this._errorBuffer += data.toString();
    });

    this._started = true;
  }

  stop(): void {
    if (!this._started) {
      throw new ToolError('Session has not started.');
    }
    if (this._process && this._process.exitCode === null) {
      this._process.kill();
    }
  }

  async run(command: string): Promise<ToolExecResult> {
    if (!this._started || !this._process) {
      throw new ToolError('Session has not started.');
    }
    if (this._process.exitCode !== null) {
      return {
        output: undefined,
        error: `bash has exited with returncode ${this._process.exitCode}. tool must be restarted.`,
        errorCode: -1,
      };
    }
    if (this._timedOut) {
      throw new ToolError(
        `timed out: bash has not returned in ${this._timeout / 1000} seconds and must be restarted`
      );
    }

    if (!this._process.stdin) {
      throw new ToolError('Process stdin is not available');
    }

    // Clear buffers before sending command
    this._outputBuffer = '';
    this._errorBuffer = '';

    // Send command to the process
    // We need to capture the exit code of the command
    const commandWithSentinel = `${command}; echo "EXIT_CODE:$?" && echo '${this._sentinel}'\n`;
    this._process.stdin.write(commandWithSentinel);

    // Read output from the process, until the sentinel is found or process exits
    try {
      const startTime = Date.now();
      while (Date.now() - startTime < this._timeout) {
        await new Promise(resolve => setTimeout(resolve, this._outputDelay));
        
        // Check if process has exited
        if (this._process.exitCode !== null) {
          // Process has exited, return error result
          let output = this._outputBuffer;
          let error = this._errorBuffer;
          
          if (output.endsWith('\n')) {
            output = output.slice(0, -1);
          }
          if (error.endsWith('\n')) {
            error = error.slice(0, -1);
          }
          
          return {
            output: output || undefined,
            error: error || undefined,
            errorCode: this._process.exitCode,
          };
        }
        
        if (this._outputBuffer.includes(this._sentinel)) {
          // Strip the sentinel and break
          const sentinelIndex = this._outputBuffer.indexOf(this._sentinel);
          let output = this._outputBuffer.substring(0, sentinelIndex);
          break;
        }
      }
      
      if (Date.now() - startTime >= this._timeout) {
        this._timedOut = true;
        throw new ToolError(
          `timed out: bash has not returned in ${this._timeout / 1000} seconds and must be restarted`
        );
      }
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      this._timedOut = true;
      throw new ToolError(
        `timed out: bash has not returned in ${this._timeout / 1000} seconds and must be restarted`
      );
    }

    // Get final output and error
    const sentinelIndex = this._outputBuffer.indexOf(this._sentinel);
    let output = this._outputBuffer.substring(0, sentinelIndex);
    let error = this._errorBuffer;

    // Extract the exit code from the output
    const exitCodeMatch = output.match(/EXIT_CODE:(\d+)\n?$/);
    let commandExitCode = 0;
    if (exitCodeMatch) {
      commandExitCode = parseInt(exitCodeMatch[1], 10);
      // Remove the EXIT_CODE line from the output
      output = output.replace(/EXIT_CODE:\d+\n?$/, '');
    }

    if (output.endsWith('\n')) {
      output = output.slice(0, -1);
    }
    if (error.endsWith('\n')) {
      error = error.slice(0, -1);
    }

    return {
      output: output || undefined,
      error: error || undefined,
      errorCode: commandExitCode,
    };
  }
}

/**
 * A tool that allows the agent to run bash commands.
 * The tool parameters are defined by Anthropic and are not editable.
 */
export class BashTool extends Tool {
  private _session: _BashSession | null = null;

  constructor(modelProvider: string | undefined = undefined) {
    super({ modelProvider });
  }

  getName(): string {
    return 'bash';
  }

  getDescription(): string {
    return `Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You have access to a mirror of common linux and python packages via apt and pip.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.`;
  }

  getParameters(): ToolParameter[] {
    // For OpenAI models, all parameters must be required=True
    // For other providers, optional parameters can have required=False
    const restartRequired = this._modelProvider === 'openai';

    return [
      {
        name: 'command',
        type: 'string',
        description: 'The bash command to run.',
        required: true,
      },
      {
        name: 'restart',
        type: 'boolean',
        description: 'Set to true to restart the bash session.',
        required: restartRequired,
      },
    ];
  }

  async execute(args: ToolCallArguments): Promise<ToolExecResult> {
    if (args.restart) {
      if (this._session) {
        this._session.stop();
      }
      this._session = new _BashSession();
      await this._session.start();

      return {
        output: 'tool has been restarted.',
        error: undefined,
        errorCode: 0,
      };
    }

    if (this._session === null) {
      try {
        this._session = new _BashSession();
        await this._session.start();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          output: undefined,
          error: `Error starting bash session: ${errorMessage}`,
          errorCode: -1,
        };
      }
    }

    const command = args.command as string;
    if (!command) {
      return {
        output: undefined,
        error: `Command parameter is required`,
        errorCode: -1,
      };
    }

    try {
      return await this._session.run(command);
    } catch (error: unknown) {
      if (error instanceof ToolError) {
        return {
          output: undefined,
          error: error.message,
          errorCode: -1,
        };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Error executing command: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }
}
