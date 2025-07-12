// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { ChatMessage, ChatCompletionResponse, Tool } from '../types';

/**
 * Abstract base class for LLM clients.
 */
export abstract class BaseLLMClient {
  /**
   * Check if the client supports tool calling.
   */
  abstract supportsToolCalling(): boolean;

  /**
   * Create a chat completion.
   */
  abstract createChatCompletion(
    messages: ChatMessage[],
    tools?: Tool[]
  ): Promise<ChatCompletionResponse>;
}