// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { ToolCall, ToolResult } from '../tools/base.js';
import { LLMResponse, LLMUsage } from '../utils/llm_basics.js';

/**
 * Defines possible states during an agent's execution lifecycle.
 */
export enum AgentState {
  IDLE = 'idle',
  THINKING = 'thinking',
  CALLING_TOOL = 'calling_tool',
  REFLECTING = 'reflecting',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Represents a single step in an agent's execution process.
 *
 * Tracks the state, thought process, tool interactions, LLM response,
 * and any associated metadata or errors.
 */
export class AgentStep {
  step_number: number;
  state: AgentState;
  thought?: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  llm_response?: LLMResponse;
  reflection?: string;
  error?: string;
  extra?: Record<string, unknown>;
  llm_usage?: LLMUsage;

  constructor(data: {
    step_number: number;
    state: AgentState;
    thought?: string;
    tool_calls?: ToolCall[];
    tool_results?: ToolResult[];
    llm_response?: LLMResponse;
    reflection?: string;
    error?: string;
    extra?: Record<string, unknown>;
    llm_usage?: LLMUsage;
  }) {
    this.step_number = data.step_number;
    this.state = data.state;
    this.thought = data.thought;
    this.tool_calls = data.tool_calls;
    this.tool_results = data.tool_results;
    this.llm_response = data.llm_response;
    this.reflection = data.reflection;
    this.error = data.error;
    this.extra = data.extra;
    this.llm_usage = data.llm_usage;
  }

  toString(): string {
    const thoughtPreview = this.thought ? `${JSON.stringify(this.thought).slice(0, 40)}...` : 'undefined';
    return `<AgentStep #${this.step_number} state=${this.state} thought=${thoughtPreview}>`;
  }
}



/**
 * Encapsulates the entire execution of an agent task.
 *
 * Contains the original task, all intermediate steps,
 * final result, execution metadata, and success state.
 */
export class AgentExecution {
  task: string;
  steps: AgentStep[];
  final_result?: string;
  success: boolean;
  total_tokens?: LLMUsage;
  execution_time: number;

  constructor(data: {
    task: string;
    steps?: AgentStep[];
    final_result?: string;
    success?: boolean;
    total_tokens?: LLMUsage;
    execution_time?: number;
  }) {
    this.task = data.task;
    this.steps = data.steps || [];
    this.final_result = data.final_result;
    this.success = data.success || false;
    this.total_tokens = data.total_tokens;
    this.execution_time = data.execution_time || 0.0;
  }

  toString(): string {
    return `<AgentExecution task=${JSON.stringify(this.task)} steps=${this.steps.length} success=${this.success}>`;
  }
}

/**
 * Base class for agent-related errors.
 *
 * Used to signal execution failures, misconfigurations,
 * or unexpected LLM/tool behavior.
 */
export class AgentError extends Error {
  public readonly message: string;

  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = 'AgentError';
  }

  toString(): string {
    return `AgentError: ${this.message}`;
  }
}
