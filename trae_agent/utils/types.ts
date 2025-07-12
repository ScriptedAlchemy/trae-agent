// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Common types for Trae Agent.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ToolExecResult {
  output?: string;
  error?: string;
  errorCode?: number;
}