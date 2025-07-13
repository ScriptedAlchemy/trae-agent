// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Basic LLM data structures and types.
 */

import type { ToolCall, ToolResult } from '../tools/base.js';

/**
 * Standard message format.
 */
export interface LLMMessage {
  role: string;
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

/**
 * LLM usage format.
 */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningTokens?: number;
  // Legacy fields for compatibility
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Standard LLM response format.
 */
export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  model?: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
}

/**
 * Helper function to create an LLMMessage.
 */
export function createLLMMessage(
  role: string,
  content?: string,
  toolCall?: ToolCall,
  toolResult?: ToolResult
): LLMMessage {
  return {
    role,
    content,
    toolCall,
    toolResult,
  };
}

/**
 * Helper function to create LLMUsage.
 */
export function createLLMUsage(
  inputTokens: number,
  outputTokens: number,
  options?: {
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    reasoningTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }
): LLMUsage {
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: options?.cacheCreationInputTokens || 0,
    cacheReadInputTokens: options?.cacheReadInputTokens || 0,
    reasoningTokens: options?.reasoningTokens || 0,
    promptTokens: options?.promptTokens,
    completionTokens: options?.completionTokens,
    totalTokens: options?.totalTokens,
  };
}

/**
 * Helper function to create an LLMResponse.
 */
export function createLLMResponse(
  content: string,
  options?: {
    usage?: LLMUsage;
    model?: string;
    finishReason?: string;
    toolCalls?: ToolCall[];
  }
): LLMResponse {
  return {
    content,
    usage: options?.usage,
    model: options?.model,
    finishReason: options?.finishReason,
    toolCalls: options?.toolCalls,
  };
}

/**
 * Add two LLMUsage objects together.
 */
export function addLLMUsage(usage1: LLMUsage, usage2: LLMUsage): LLMUsage {
  return {
    inputTokens: usage1.inputTokens + usage2.inputTokens,
    outputTokens: usage1.outputTokens + usage2.outputTokens,
    cacheCreationInputTokens:
      (usage1.cacheCreationInputTokens || 0) +
      (usage2.cacheCreationInputTokens || 0),
    cacheReadInputTokens:
      (usage1.cacheReadInputTokens || 0) + (usage2.cacheReadInputTokens || 0),
    reasoningTokens:
      (usage1.reasoningTokens || 0) + (usage2.reasoningTokens || 0),
    promptTokens: (usage1.promptTokens || 0) + (usage2.promptTokens || 0),
    completionTokens:
      (usage1.completionTokens || 0) + (usage2.completionTokens || 0),
    totalTokens: (usage1.totalTokens || 0) + (usage2.totalTokens || 0),
  };
}

/**
 * Convert LLMUsage to string representation.
 */
export function llmUsageToString(usage: LLMUsage): string {
  return `LLMUsage(inputTokens=${usage.inputTokens}, outputTokens=${usage.outputTokens}, cacheCreationInputTokens=${usage.cacheCreationInputTokens || 0}, cacheReadInputTokens=${usage.cacheReadInputTokens || 0}, reasoningTokens=${usage.reasoningTokens || 0})`;
}
