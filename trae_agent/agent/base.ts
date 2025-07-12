// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Base Agent class for LLM-based agents.
 */

import { Tool, ToolCall, ToolExecutor, ToolResult } from '../tools/base.js';
import { CLIConsole } from '../utils/cli_console.js';
import { Config, ModelParameters } from '../utils/config.js';
import { LLMMessage, LLMResponse, addLLMUsage } from '../utils/llm_basics.js';
import { LLMClient } from '../utils/llm_client.js';
import { TrajectoryRecorder } from '../utils/trajectory_recorder.js';
import {
  AgentError,
  AgentExecution,
  AgentState,
  AgentStep,
} from './agent_basics.js';

/**
 * Base class for LLM-based agents.
 */
export abstract class Agent {
  protected _llmClient: LLMClient;
  protected _modelParameters: ModelParameters;
  protected _maxSteps: number;
  protected _initialMessages: LLMMessage[] = [];
  protected _task: string = '';
  protected _tools: Tool[] = [];
  protected _toolCaller: ToolExecutor;
  protected _cliConsole?: CLIConsole;
  protected _trajectoryRecorder?: TrajectoryRecorder;

  /**
   * Initialize the agent.
   *
   * @param config Configuration object containing model parameters and other settings.
   *               Required if llmClient is not provided.
   * @param llmClient Optional pre-configured LLMClient instance.
   *                  If provided, it will be used instead of creating a new one from config.
   */
  constructor(config?: Config, llmClient?: LLMClient) {
    if (!llmClient) {
      if (!config) {
        throw new Error('Either config or llmClient must be provided');
      }
      this._llmClient = new LLMClient(
        config.default_provider,
        config.model_providers[config.default_provider],
        config.max_steps
      );
      this._modelParameters = config.model_providers[config.default_provider];
      this._maxSteps = config.max_steps;
    } else {
      this._llmClient = llmClient;
      this._modelParameters = llmClient.modelParameters;
      this._maxSteps = llmClient.maxSteps;
    }

    this._toolCaller = new ToolExecutor([]);
  }

  /**
   * Create an agent instance from a configuration object.
   *
   * This factory method provides the traditional config-based initialization
   * while allowing subclasses to customize the instantiation process.
   *
   * @param config Configuration object containing model parameters and other settings.
   * @returns An instance of the agent.
   */
  static from_config<T extends Agent>(this: new (config: Config) => T, config: Config): T {
    return new this(config);
  }

  /**
   * Get the LLM client for this agent.
   */
  get llmClient(): LLMClient {
    return this._llmClient;
  }

  /**
   * Get the trajectory recorder for this agent.
   */
  get trajectoryRecorder(): TrajectoryRecorder | undefined {
    return this._trajectoryRecorder;
  }



  /**
   * Set the trajectory recorder for this agent (protected method matching Python).
   */
  protected _setTrajectoryRecorder(recorder?: TrajectoryRecorder): void {
    this._trajectoryRecorder = recorder;
    // Also set it on the LLM client
    this._llmClient.setTrajectoryRecorder(recorder);
  }

  /**
   * Get the CLI console for this agent.
   */
  get cliConsole(): CLIConsole | undefined {
    return this._cliConsole;
  }

  /**
   * Set the CLI console for this agent.
   */
  setCLIConsole(cliConsole?: CLIConsole): void {
    this._cliConsole = cliConsole;
  }

  /**
   * Get the tools available to this agent.
   */
  get tools(): Tool[] {
    return this._tools;
  }

  /**
   * Get the current task of the agent.
   */
  get task(): string {
    return this._task;
  }

  /**
   * Set the current task of the agent.
   */
  set task(value: string) {
    this._task = value;
  }

  /**
   * Get the initial messages for the agent.
   */
  get initialMessages(): LLMMessage[] {
    return this._initialMessages;
  }

  /**
   * Get the model parameters for the agent.
   */
  get modelParameters(): ModelParameters {
    return this._modelParameters;
  }

  /**
   * Get the maximum number of steps for the agent.
   */
  get maxSteps(): number {
    return this._maxSteps;
  }

  /**
   * Create a new task.
   */
  abstract newTask(
    task: string,
    extraArgs?: Record<string, string>,
    toolNames?: string[]
  ): void;

  /**
   * Execute a task using the agent.
   */
  async executeTask(): Promise<AgentExecution> {
    const startTime = Date.now() / 1000;
    const execution = new AgentExecution({
      task: this._task,
      steps: [],
      success: false,
      execution_time: 0,
    });
    let step: AgentStep | undefined;

    try {
      let messages = [...this._initialMessages];
      let stepNumber = 1;

      while (stepNumber <= this._maxSteps) {
        step = new AgentStep({
          step_number: stepNumber,
          state: AgentState.THINKING,
        });

        try {
          step.state = AgentState.THINKING;
          // Display thinking state
          this.updateCLIConsole(step);

          // Get LLM response
          const llmResponse = await this._llmClient.chat(
            messages,
            this._modelParameters,
            this._tools
          );
          step.llm_response = llmResponse;

          // Display step with LLM response
          this.updateCLIConsole(step);

          // Update token usage
          this.updateLLMUsage(llmResponse, execution);

          if (this.llmIndicatesTaskCompleted(llmResponse)) {
            if (this.isTaskCompleted(llmResponse)) {
              this.llmCompleteResponseTaskHandler(
                llmResponse,
                step,
                execution,
                messages
              );
              break;
            } else {
              step.state = AgentState.THINKING;
              messages = [
                {
                  role: 'user',
                  content: this.taskIncompleteMessage(),
                },
              ];
            }
          } else {
            // Check if the response contains a tool call
            const toolCalls = llmResponse.toolCalls;
            messages = await this.toolCallHandler(toolCalls, step);
          }

          // Record agent step
          this.recordHandler(step, messages);
          this.updateCLIConsole(step);

          execution.steps.push(step);
          stepNumber++;
        } catch (error) {
          step.state = AgentState.ERROR;
          step.error = error instanceof Error ? error.message : String(error);

          // Display error
          this.updateCLIConsole(step);
          // Record agent step
          this.recordHandler(step, messages);
          this.updateCLIConsole(step);

          execution.steps.push(step);
          break;
        }
      }

      if (stepNumber > this._maxSteps && !execution.success) {
        execution.final_result =
          'Task execution exceeded maximum steps without completion.';
      }
    } catch (error) {
      execution.final_result = `Agent execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    execution.execution_time = Date.now() / 1000 - startTime;

    // Display final summary
    if (step) {
      this.updateCLIConsole(step);
    }

    return execution;
  }

  /**
   * Reflect on tool execution result. Override for custom reflection logic.
   */
  reflectOnResult(toolResults: ToolResult[]): string | undefined {
    if (toolResults.length === 0) {
      return undefined;
    }

    const failedResults = toolResults.filter(result => !result.success);
    if (failedResults.length === 0) {
      return undefined;
    }

    return failedResults
      .map(
        result =>
          `The tool execution failed with error: ${result.error}. Consider trying a different approach or fixing the parameters.`
      )
      .join('\n');
  }

  /**
   * Check if the LLM indicates that the task is completed. Override for custom logic.
   */
  llmIndicatesTaskCompleted(llmResponse: LLMResponse): boolean {
    const completionIndicators = [
      'task completed',
      'task finished',
      'done',
      'completed successfully',
      'finished successfully',
    ];

    const responseLower = llmResponse.content.toLowerCase();
    return completionIndicators.some(indicator =>
      responseLower.includes(indicator)
    );
  }

  /**
   * Check if the task is completed based on the response. Override for custom logic.
   */
  protected isTaskCompleted(llmResponse: LLMResponse): boolean {
    // Default implementation - can be overridden
    return true;
  }

  /**
   * Return a message indicating that the task is incomplete. Override for custom logic.
   */
  taskIncompleteMessage(): string {
    return 'The task is incomplete. Please try again.';
  }

  /**
   * Update CLI console with current step information.
   */
  protected updateCLIConsole(step: AgentStep): void {
    if (this._cliConsole) {
      this._cliConsole.updateStatus(step);
    }
  }

  /**
   * Update LLM usage statistics.
   */
  protected updateLLMUsage(
    llmResponse: LLMResponse,
    execution: AgentExecution
  ): void {
    if (!llmResponse.usage) {
      return;
    }

    if (!execution.total_tokens) {
      execution.total_tokens = { ...llmResponse.usage };
    } else {
      execution.total_tokens = addLLMUsage(execution.total_tokens, llmResponse.usage);
    }
  }

  /**
   * Handle LLM completion response.
   */
  protected llmCompleteResponseTaskHandler(
    llmResponse: LLMResponse,
    step: AgentStep,
    execution: AgentExecution,
    messages: LLMMessage[]
  ): void {
    step.state = AgentState.COMPLETED;
    execution.final_result = llmResponse.content;
    execution.success = true;

    this.recordHandler(step, messages);
    this.updateCLIConsole(step);
    execution.steps.push(step);
  }

  /**
   * Record agent step in trajectory.
   */
  protected recordHandler(step: AgentStep, messages: LLMMessage[]): void {
    if (this._trajectoryRecorder) {
      this._trajectoryRecorder.recordAgentStep(
        step.step_number,
        step.state,
        messages,
        step.llm_response,
        step.tool_calls,
        step.tool_results,
        step.reflection,
        step.error
      );
    }
  }

  /**
   * Handle tool calls and return updated messages.
   */
  protected async toolCallHandler(
    toolCalls: ToolCall[] | undefined,
    step: AgentStep
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    if (!toolCalls || toolCalls.length === 0) {
      messages.push({
        role: 'user',
        content: 'It seems that you have not completed the task.',
      });
      return messages;
    }

    step.state = AgentState.CALLING_TOOL;
    step.tool_calls = toolCalls;
    this.updateCLIConsole(step);

    let toolResults: ToolResult[];
    if (this._modelParameters.parallelToolCalls) {
      toolResults = await this._toolCaller.parallelToolCall(toolCalls);
    } else {
      toolResults = await this._toolCaller.sequentialToolCall(toolCalls);
    }

    step.tool_results = toolResults;
    this.updateCLIConsole(step);

    for (const toolResult of toolResults) {
      // Add tool result to conversation
      const message: LLMMessage = {
        role: 'user',
        toolResult,
      };
      messages.push(message);
    }

    const reflection = this.reflectOnResult(toolResults);
    if (reflection) {
      step.state = AgentState.REFLECTING;
      step.reflection = reflection;

      // Display reflection
      this.updateCLIConsole(step);

      messages.push({
        role: 'assistant',
        content: reflection,
      });
    }

    return messages;
  }
}
