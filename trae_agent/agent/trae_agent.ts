// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * TraeAgent for software engineering tasks.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { writeFileSync } from 'fs';
import { toolsRegistry } from '../tools/index.js';
import { ToolExecutor, ToolResult } from '../tools/base.js';
import { Config } from '../utils/config.js';
import { LLMResponse } from '../utils/llm_basics.js';
import { LLMClient } from '../utils/llm_client.js';
import { TrajectoryRecorder } from '../utils/trajectory_recorder.js';
import { AgentError, AgentExecution } from './agent_basics.js';
import { Agent } from './base.js';

const TraeAgentToolNames = [
  'str_replace_based_edit_tool',
  'sequentialthinking',
  'json_edit_tool',
  'task_done',
  'bash',
];

/**
 * Trae Agent specialized for software engineering tasks.
 */
export class TraeAgent extends Agent {
  public projectPath: string = '';
  public baseCommit: string | null = null;
  public mustPatch: string = 'false';
  public patchPath: string | null = null;
  public config?: Config;

  /**
   * Initialize TraeAgent.
   *
   * @param config Configuration object containing model parameters and other settings.
   *               Required if llmClient is not provided.
   * @param llmClient Optional pre-configured LLMClient instance.
   */
  constructor(config?: Config, llmClient?: LLMClient) {
    super(config, llmClient);
    this.config = config;
  }

  /**
   * Create a TraeAgent instance from a configuration object.
   *
   * This factory method provides the traditional config-based initialization
   * while allowing for future customization of the instantiation process.
   *
   * @param config Configuration object containing model parameters and other settings.
   * @returns An instance of TraeAgent.
   */
  static from_config<T extends Agent>(this: new (config: Config) => T, config: Config): T {
    return new this(config) as T;
  }

  /**
   * Set up trajectory recording for this agent.
   *
   * @param trajectoryPath Path to save trajectory file. If None, generates default path.
   * @returns The path where trajectory will be saved.
   */
  setupTrajectoryRecording(trajectoryPath?: string): string {
    const recorder = new TrajectoryRecorder(trajectoryPath);
    this._setTrajectoryRecorder(recorder);
    return recorder.getTrajectoryPath();
  }

  /**
   * Create a new task.
   */
  override newTask(
    task: string,
    extraArgs?: Record<string, string>,
    toolNames?: string[]
  ): void {
    this._task = task;

    if (!toolNames) {
      toolNames = TraeAgentToolNames;
    }

    // Get the model provider from the LLM client
    const provider = this._llmClient.provider;
    this._tools = toolNames.map(toolName => {
      const toolFactory = toolsRegistry[toolName];
      if (!toolFactory) {
        throw new AgentError(`Tool '${toolName}' not found in registry`);
      }
      return toolFactory({ modelProvider: provider });
    });
    this._toolCaller = new ToolExecutor(this._tools);

    this._initialMessages = [];
    this._initialMessages.push({
      role: 'system',
      content: this.getSystemPrompt(),
    });

    let userMessage = '';
    if (!extraArgs) {
      throw new AgentError('Project path and issue information are required.');
    }
    if (!extraArgs.project_path) {
      throw new AgentError('Project path is required');
    }

    this.projectPath = extraArgs.project_path || '';
    userMessage += `[Project root path]:\n${this.projectPath}\n\n`;

    if (extraArgs.issue) {
      userMessage += `[Problem statement]: We're currently solving the following issue within our repository. Here's the issue text:\n${extraArgs.issue}\n`;
    }

    const optionalAttrsToSet = ['base_commit', 'must_patch', 'patch_path'];
    for (const attr of optionalAttrsToSet) {
      if (extraArgs[attr]) {
        switch (attr) {
          case 'base_commit':
            this.baseCommit = extraArgs[attr];
            break;
          case 'must_patch':
            this.mustPatch = extraArgs[attr];
            break;
          case 'patch_path':
            this.patchPath = extraArgs[attr];
            break;
        }
      }
    }

    this._initialMessages.push({
      role: 'user',
      content: userMessage,
    });

    // If trajectory recorder is set, start recording
    if (this._trajectoryRecorder) {
      this._trajectoryRecorder.startRecording(
        task,
        this._llmClient.provider,
        this._modelParameters.model,
        this._maxSteps
      );
    }
  }

  /**
   * Execute the task and finalize trajectory recording.
   */
  override async executeTask(): Promise<AgentExecution> {
    let consoleTask: Promise<void> | undefined;
    if (this._cliConsole) {
      consoleTask = this._cliConsole.start();
    }

    const execution = await super.executeTask();

    if (this._cliConsole && consoleTask) {
      try {
        await consoleTask;
      } catch (error) {
        // Console task may be cancelled, ignore errors
      }
    }

    // Finalize trajectory recording if recorder is available
    if (this._trajectoryRecorder) {
      this._trajectoryRecorder.finalizeRecording(
        execution.success,
        execution.final_result
      );
    }

    if (this.patchPath) {
      try {
        writeFileSync(this.patchPath, this.getGitDiff());
      } catch (error) {
        console.error(`Error writing patch file: ${error}`);
      }
    }

    return execution;
  }

  /**
   * Get the system prompt for TraeAgent.
   */
  getSystemPrompt(): string {
    return `You are an expert AI software engineering agent.

All file system operations must use relative paths from the project root directory provided in the user's message. Do not assume you are in a \`/repo\` or \`/workspace\` directory. Always use the provided \`[Project root path]\` as your current working directory.

Your primary goal is to resolve a given GitHub issue by navigating the provided codebase, identifying the root cause of the bug, implementing a robust fix, and ensuring your changes are safe and well-tested.

Follow these steps methodically:

1.  Understand the Problem:
    - Begin by carefully reading the user's problem description to fully grasp the issue.
    - Identify the core components and expected behavior.

2.  Explore and Locate:
    - Use the available tools to explore the codebase.
    - Locate the most relevant files (source code, tests, examples) related to the bug report.

3.  Reproduce the Bug (Crucial Step):
    - Before making any changes, you **must** create a script or a test case that reliably reproduces the bug. This will be your baseline for verification.
    - Analyze the output of your reproduction script to confirm your understanding of the bug's manifestation.

4.  Debug and Diagnose:
    - Inspect the relevant code sections you identified.
    - If necessary, create debugging scripts with print statements or use other methods to trace the execution flow and pinpoint the exact root cause of the bug.

5.  Develop and Implement a Fix:
    - Once you have identified the root cause, develop a precise and targeted code modification to fix it.
    - Use the provided file editing tools to apply your patch. Aim for minimal, clean changes.

6.  Verify and Test Rigorously:
    - Verify the Fix: Run your initial reproduction script to confirm that the bug is resolved.
    - Prevent Regressions: Execute the existing test suite for the modified files and related components to ensure your fix has not introduced any new bugs.
    - Write New Tests: Create new, specific test cases (e.g., using \`pytest\`) that cover the original bug scenario. This is essential to prevent the bug from recurring in the future. Add these tests to the codebase.
    - Consider Edge Cases: Think about and test potential edge cases related to your changes.

7.  Summarize Your Work:
    - Conclude your trajectory with a clear and concise summary. Explain the nature of the bug, the logic of your fix, and the steps you took to verify its correctness and safety.

**Guiding Principle:** Act like a senior software engineer. Prioritize correctness, safety, and high-quality, test-driven development.

# GUIDE FOR HOW TO USE "sequential_thinking" TOOL:
- Your thinking should be thorough and so it's fine if it's very long. Set total_thoughts to at least 5, but setting it up to 25 is fine as well. You'll need more total thoughts when you are considering multiple possible solutions or root causes for an issue.
- Use this tool as much as you find necessary to improve the quality of your answers.
- You can run bash commands (like tests, a reproduction script, or 'grep'/'find' to find relevant context) in between thoughts.
- The sequential_thinking tool can help you break down complex problems, analyze issues step-by-step, and ensure a thorough approach to problem-solving.
- Don't hesitate to use it multiple times throughout your thought process to enhance the depth and accuracy of your solutions.

If you are sure the issue has been solved, you should call the \`task_done\` to finish the task.`;
  }

  /**
   * Reflect on tool execution result. Override for custom reflection logic.
   */
  override reflectOnResult(toolResults: ToolResult[]): string | undefined {
    return undefined;
  }

  /**
   * Get the git diff of the project.
   */
  getGitDiff(): string {
    const originalCwd = process.cwd();
    if (!existsSync(this.projectPath)) {
      return '';
    }

    try {
      process.chdir(this.projectPath);
      let stdout: string;

      if (!this.baseCommit) {
        stdout = execSync('git --no-pager diff', { encoding: 'utf-8' });
      } else {
        stdout = execSync(`git --no-pager diff ${this.baseCommit} HEAD`, {
          encoding: 'utf-8',
        });
      }
      return stdout;
    } catch (error) {
      return '';
    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Remove any changes to the tests directory from the provided patch.
   * This is to ensure that the model_patch does not disturb the repo's
   * tests when doing acceptance testing with the `test_patch`.
   *
   * Copyright (c) 2024 paul-gauthier
   * SPDX-License-Identifier: Apache-2.0
   * Original remove_patches_to_tests function was released under Apache-2.0 License, with the full license text
   * available at https://github.com/Aider-AI/aider-swe-bench/blob/6e98cd6c3b2cbcba12976d6ae1b07f847480cb74/LICENSE.txt
   * Original function is at https://github.com/Aider-AI/aider-swe-bench/blob/6e98cd6c3b2cbcba12976d6ae1b07f847480cb74/tests.py#L45
   */
  removePatchesToTests(modelPatch: string): string {
    // Split lines keeping line endings to match Python's splitlines(keepends=True)
    const splitResult = modelPatch.split(/(\r?\n)/);
    const lines: string[] = [];
    for (let i = 0; i < splitResult.length; i += 2) {
      const line = splitResult[i];
      const lineEnding = splitResult[i + 1] || '';
      lines.push(line + lineEnding);
    }
    
    const filteredLines: string[] = [];
    const testPatterns = ['/test/', '/tests/', '/testing/', 'test_', 'tox.ini'];
    let isTests = false;

    for (const line of lines) {
      if (line.startsWith('diff --git a/')) {
        const parts = line.split(' ');
        const targetPath = parts[parts.length - 1];
        isTests =
          targetPath.startsWith('b/') &&
          testPatterns.some(pattern => targetPath.includes(pattern));
      }

      if (!isTests) {
        filteredLines.push(line);
      }
    }

    // Join with empty string to match Python's "".join(filtered_lines)
    return filteredLines.join('');
  }

  /**
   * Check if the LLM indicates that the task is completed.
   */
  override llmIndicatesTaskCompleted(llmResponse: LLMResponse): boolean {
    if (!llmResponse.toolCalls) {
      return false;
    }
    return llmResponse.toolCalls.some(
      toolCall => toolCall.name === 'task_done'
    );
  }

  /**
   * Enhanced task completion detection.
   */
  protected override isTaskCompleted(llmResponse: LLMResponse): boolean {
    if (this.mustPatch === 'true') {
      const modelPatch = this.getGitDiff();
      const patch = this.removePatchesToTests(modelPatch);
      if (!patch.trim()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return a message indicating that the task is incomplete.
   */
  override taskIncompleteMessage(): string {
    return 'ERROR! Your Patch is empty. Please provide a patch that fixes the problem.';
  }
}
