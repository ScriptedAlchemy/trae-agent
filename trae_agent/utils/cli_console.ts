// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Console for displaying agent progress.
 */

import type { AgentExecution, AgentStep } from '../agent/agent_basics.js';
import type { Config } from './config.js';

/**
 * Console step data structure.
 */
export interface ConsoleStep {
  panel: unknown; // Panel from rich library equivalent
  lakeViewPanelGenerator?: unknown;
  lakeViewGeneratorDone: boolean;
}

/**
 * Agent state information mapping.
 */
export const AGENT_STATE_INFO = {
  thinking: { color: 'blue', emoji: '🤔' },
  calling_tool: { color: 'yellow', emoji: '🔧' },
  reflecting: { color: 'magenta', emoji: '💭' },
  completed: { color: 'green', emoji: '✅' },
  error: { color: 'red', emoji: '❌' },
  idle: { color: 'white', emoji: '⏸️' },
};

/**
 * Console for displaying agent progress.
 */
export class CLIConsole {
  private config: Config | null;
  private consoleSteps: Map<number, ConsoleStep> = new Map();
  private agentStepHistory: AgentStep[] = [];
  private agentExecution: AgentExecution | null = null;
  private liveDisplay: unknown = null;

  /**
   * Initialize the CLI console.
   * @param config Configuration object
   */
  constructor(config?: Config) {
    this.config = config || null;
  }

  /**
   * Update the status with new agent step or execution data.
   * @param agentStep Current agent step
   * @param agentExecution Current agent execution
   */
  updateStatus(agentStep?: AgentStep, agentExecution?: AgentExecution): void {
    if (agentStep) {
      if (this.agentStepHistory.length > 0) {
        if (
          agentStep.step_number >
          this.agentStepHistory[this.agentStepHistory.length - 1].step_number
        ) {
          this.agentStepHistory.push(agentStep);
        }
      } else {
        this.agentStepHistory.push(agentStep);
      }
    }

    if (agentExecution) {
      this.agentExecution = agentExecution;
    }
  }

  /**
   * Start the console display loop.
   */
  async start(): Promise<void> {
    // Simplified implementation - in a real scenario this would handle rich console display
    while (true) {
      if (this.agentExecution) {
        break;
      }
      this.printTaskProgress();
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    this.printTaskProgress();
    if (this.liveDisplay) {
      this.liveDisplay = null;
    }
  }

  /**
   * Print task details.
   * @param task Task description
   * @param workingDir Working directory
   * @param provider LLM provider
   * @param model Model name
   * @param maxSteps Maximum steps
   */
  printTaskDetails(
    task: string,
    workingDir: string,
    provider: string,
    model: string,
    maxSteps: number
  ): void {
    console.log(`\n=== Task Details ===`);
    console.log(`Task: ${task}`);
    console.log(`Working Directory: ${workingDir}`);
    console.log(`Provider: ${provider}`);
    console.log(`Model: ${model}`);
    console.log(`Max Steps: ${maxSteps}`);
    console.log(`=====================\n`);
  }

  /**
   * Print a message with optional styling.
   * @param message Message to print
   * @param color Color for the message
   * @param bold Whether to make the message bold
   */
  print(message: string, color: string = 'blue', bold: boolean = false): void {
    // Simplified console output - in a real scenario this would use rich formatting
    const prefix = bold ? '[BOLD]' : '';
    const colorPrefix = `[${color.toUpperCase()}]`;
    console.log(`${prefix}${colorPrefix} ${message}`);
  }

  /**
   * Print task progress.
   */
  private printTaskProgress(): void {
    if (this.agentStepHistory.length === 0) {
      return;
    }

    const lastStep = this.agentStepHistory[this.agentStepHistory.length - 1];
    const stateInfo = AGENT_STATE_INFO[lastStep.state] || {
      color: 'white',
      emoji: '❓',
    };

    console.log(
      `${stateInfo.emoji} Step ${lastStep.step_number}: ${lastStep.state}`
    );
  }

  /**
   * Create execution summary.
   * @param execution Agent execution data
   */
  createExecutionSummary(execution: AgentExecution): void {
    console.log(`\n=== Execution Summary ===`);
    console.log(
      `Task: ${execution.task.length > 50 ? execution.task.substring(0, 50) + '...' : execution.task}`
    );
    console.log(`Success: ${execution.success ? '✅ Yes' : '❌ No'}`);
    console.log(`Steps: ${execution.steps.length}`);

    if (execution.total_tokens) {
      console.log(`Total Tokens: ${execution.total_tokens.totalTokens || 0}`);
      console.log(`Prompt Tokens: ${execution.total_tokens.promptTokens || 0}`);
      console.log(
        `Completion Tokens: ${execution.total_tokens.completionTokens || 0}`
      );
    }

    console.log(`Execution Time: ${execution.execution_time?.toFixed(2) || 0}s`);
    console.log(`========================\n`);
  }
}
