// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { BaseLLMClient } from './base';
import { Config } from '../config';
import { ChatMessage, ChatCompletionResponse, Tool, ToolCall } from '../types';

/**
 * Ollama client implementation.
 */
export class OllamaClient extends BaseLLMClient {
  private baseUrl: string;
  private modelName: string;
  private config: Config;

  constructor(config: Config) {
    super();
    this.config = config;
    
    const ollamaConfig = config.model_providers.ollama;
    this.baseUrl = ollamaConfig?.base_url || 'http://localhost:11434';
    this.modelName = ollamaConfig?.model || 'llama2';
  }

  supportsToolCalling(): boolean {
    return false; // Ollama typically doesn't support tool calling
  }

  async createChatCompletion(
    messages: ChatMessage[],
    tools?: Tool[]
  ): Promise<ChatCompletionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: data.message?.content || '',
        toolCalls: undefined
      };
    } catch (error) {
      // If the error already contains "Ollama API error:", don't add it again
      if (error instanceof Error && error.message.startsWith('Ollama API error:')) {
        throw error;
      }
      // Format error message to match test expectations
      if (error instanceof Error) {
        throw new Error(`Ollama API error: ${error.constructor.name}: ${error.message}`);
      }
      throw new Error(`Ollama API error: ${error}`);
    }
  }

  /**
   * Parse messages for Ollama format.
   * This is a private method used internally and exposed for testing.
   */
  private parseMessages(messages: ChatMessage[]): ChatMessage[] {
    // Simply return the messages as-is since they're already in the correct format
    return messages;
  }
}