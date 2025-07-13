// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Trajectory recording functionality for Trae Agent.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ToolCall, ToolResult } from '../tools/base.js';
import type { LLMMessage, LLMResponse } from './llm_basics.js';

/**
 * Interface for trajectory data structure (internal representation).
 */
export interface TrajectoryData {
  task: string;
  startTime: string;
  endTime: string;
  provider: string;
  model: string;
  maxSteps: number;
  llmInteractions: unknown[];
  agentSteps: unknown[];
  success: boolean;
  finalResult: string | null;
  executionTime: number;
}

/**
 * Interface for serialized trajectory data structure (snake_case for JSON output).
 */
interface SerializedTrajectoryData {
  task: string;
  start_time: string;
  end_time: string;
  provider: string;
  model: string;
  max_steps: number;
  llm_interactions: unknown[];
  agent_steps: unknown[];
  success: boolean;
  final_result: string | null;
  execution_time: number;
}

/**
 * Records trajectory data for agent execution and LLM interactions.
 */
export class TrajectoryRecorder {
  public trajectoryPath: string;
  public trajectoryData: TrajectoryData;
  private _startTime: Date | null = null;

  /**
   * Initialize trajectory recorder.
   * @param trajectoryPath Path to save trajectory file. If null, generates default path.
   */
  constructor(trajectoryPath?: string) {
    if (!trajectoryPath) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      trajectoryPath = `trajectory_${timestamp}.json`;
    }

    this.trajectoryPath = path.resolve(trajectoryPath);
    this.trajectoryData = {
      task: '',
      startTime: '',
      endTime: '',
      provider: '',
      model: '',
      maxSteps: 0,
      llmInteractions: [],
      agentSteps: [],
      success: false,
      finalResult: null,
      executionTime: 0.0,
    };
  }

  /**
   * Start recording a new trajectory.
   * @param task The task being executed
   * @param provider LLM provider being used
   * @param model Model name being used
   * @param maxSteps Maximum number of steps allowed
   */
  startRecording(
    task: string,
    provider: string,
    model: string,
    maxSteps: number
  ): void {
    this._startTime = new Date();
    Object.assign(this.trajectoryData, {
      task,
      startTime: this._startTime.toISOString(),
      provider,
      model,
      maxSteps,
      llmInteractions: [],
      agentSteps: [],
    });
    this.saveTrajectory();
  }

  /**
   * Record an LLM interaction.
   * @param messages Input messages to the LLM
   * @param response Response from the LLM
   * @param provider LLM provider used
   * @param model Model used
   * @param tools Tools available during the interaction
   */
  recordLlmInteraction(
    messages: LLMMessage[],
    response: LLMResponse,
    provider: string,
    model: string,
    tools?: unknown[]
  ): void {
    const interaction: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      provider,
      model,
      input_messages: messages.map(msg => this._serializeMessage(msg)),
      response: {
        content: response.content,
        model: response.model,
        finish_reason: response.finishReason,
        usage: response.usage
          ? {
              input_tokens: response.usage.inputTokens || 0,
              output_tokens: response.usage.outputTokens || 0,
              cache_creation_input_tokens:
                response.usage.cacheCreationInputTokens || null,
              cache_read_input_tokens: response.usage.cacheReadInputTokens || null,
              reasoning_tokens: response.usage.reasoningTokens || null,
            }
          : null,
        tool_calls: response.toolCalls
          ? response.toolCalls.map(tc => this._serializeToolCall(tc))
          : null,
      },
      tools_available: tools ? tools.map(tool => (tool as { name?: string })?.name || 'unknown') : null,
    };

    this.trajectoryData.llmInteractions.push(interaction);
    this.saveTrajectory();
  }

  /**
   * Record an agent execution step.
   * @param stepNumber Step number in the execution
   * @param state Current state of the agent
   * @param llmMessages Messages sent to LLM in this step
   * @param llmResponse Response from LLM in this step
   * @param toolCalls Tool calls made in this step
   * @param toolResults Results from tool execution
   * @param reflection Agent reflection on the step
   * @param error Error message if step failed
   */
  recordAgentStep(
    stepNumber: number,
    state: string,
    llmMessages?: LLMMessage[],
    llmResponse?: LLMResponse,
    toolCalls?: ToolCall[],
    toolResults?: ToolResult[],
    reflection?: string,
    error?: string
  ): void {
    const stepData: Record<string, unknown> = {
      step_number: stepNumber,
      timestamp: new Date().toISOString(),
      state,
      llm_messages: llmMessages
        ? llmMessages.map(msg => this._serializeMessage(msg))
        : null,
      llm_response: llmResponse
        ? {
            content: llmResponse.content,
            model: llmResponse.model,
            finish_reason: llmResponse.finishReason,
            usage: llmResponse.usage
              ? {
                  input_tokens: llmResponse.usage.inputTokens || null,
                  output_tokens: llmResponse.usage.outputTokens || null,
                }
              : null,
            tool_calls: llmResponse.toolCalls
              ? llmResponse.toolCalls.map(tc => this._serializeToolCall(tc))
              : null,
          }
        : null,
      tool_calls: toolCalls
        ? toolCalls.map(tc => this._serializeToolCall(tc))
        : null,
      tool_results: toolResults
        ? toolResults.map(tr => this._serializeToolResult(tr))
        : null,
      reflection,
      error,
    };

    this.trajectoryData.agentSteps.push(stepData);
    this.saveTrajectory();
  }

  /**
   * Finalize the trajectory recording.
   * @param success Whether the task completed successfully
   * @param finalResult Final result or output of the task
   */
  finalizeRecording(success: boolean, finalResult?: string): void {
    const endTime = new Date();
    Object.assign(this.trajectoryData, {
      endTime: endTime.toISOString(),
      success,
      finalResult: finalResult || null,
      executionTime: this._startTime
        ? (endTime.getTime() - this._startTime.getTime()) / 1000
        : 0.0,
    });

    // Save to file
    this.saveTrajectory();
  }

  /**
   * Convert trajectory data to snake_case format for JSON serialization.
   */
  private _serializeTrajectoryData(): SerializedTrajectoryData {
    return {
      task: this.trajectoryData.task,
      start_time: this.trajectoryData.startTime,
      end_time: this.trajectoryData.endTime,
      provider: this.trajectoryData.provider,
      model: this.trajectoryData.model,
      max_steps: this.trajectoryData.maxSteps,
      llm_interactions: this.trajectoryData.llmInteractions,
      agent_steps: this.trajectoryData.agentSteps,
      success: this.trajectoryData.success,
      final_result: this.trajectoryData.finalResult,
      execution_time: this.trajectoryData.executionTime,
    };
  }

  /**
   * Save the current trajectory data to file.
   */
  saveTrajectory(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.trajectoryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.trajectoryPath,
        JSON.stringify(this._serializeTrajectoryData(), null, 2),
        {
          encoding: 'utf-8',
        }
      );
    } catch (e) {
      console.warn(
        `Warning: Failed to save trajectory to ${this.trajectoryPath}: ${e}`
      );
    }
  }

  /**
   * Serialize an LLM message to a dictionary.
   */
  private _serializeMessage(message: LLMMessage): Record<string, unknown> {
    const data: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    };

    if (message.toolCall) {
      data.tool_call = this._serializeToolCall(message.toolCall);
    }

    if (message.toolResult) {
      data.tool_result = this._serializeToolResult(message.toolResult);
    }

    return data;
  }

  /**
   * Serialize a tool call to a dictionary.
   */
  private _serializeToolCall(toolCall: ToolCall): Record<string, unknown> {
    return {
      call_id: toolCall.call_id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      id: (toolCall as { id?: string }).id || null,
    };
  }

  /**
   * Serialize a tool result to a dictionary.
   */
  private _serializeToolResult(toolResult: ToolResult): Record<string, unknown> {
    return {
      call_id: toolResult.call_id,
      success: toolResult.success,
      result: toolResult.result,
      error: toolResult.error,
      id: (toolResult as { id?: string }).id || null,
    };
  }

  /**
   * Get the path where trajectory is being saved.
   */
  getTrajectoryPath(): string {
    return this.trajectoryPath;
  }
}

/**
 * Helper function to create a TrajectoryRecorder.
 */
export function createTrajectoryRecorder(
  trajectoryPath?: string
): TrajectoryRecorder {
  return new TrajectoryRecorder(trajectoryPath);
}
