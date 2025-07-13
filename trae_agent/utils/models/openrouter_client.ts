// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { BaseLLMClient } from './base';
import { Config } from '../config';
import { ChatMessage, ChatCompletionResponse, Tool, ToolCall } from '../types';

/**
 * OpenRouter client implementation.
 */
export class OpenRouterClient extends BaseLLMClient {
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;
  private config: Config;

  constructor(config: Config) {
    super();
    this.config = config;
    
    const openrouterConfig = config.model_providers.openrouter;
    if (!openrouterConfig?.api_key) {
      throw new Error('OpenRouter API key is required');
    }
    
    this.apiKey = openrouterConfig.api_key;
    this.baseUrl = openrouterConfig.base_url || 'https://openrouter.ai/api/v1';
    this.modelName = openrouterConfig.model || 'openai/gpt-3.5-turbo';
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async createChatCompletion(
    messages: ChatMessage[],
    tools?: Tool[]
  ): Promise<ChatCompletionResponse> {
    try {
      const requestBody: Record<string, unknown> = {
        model: this.modelName,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: this.config.model_providers.openrouter?.max_tokens || 1000,
        temperature: this.config.model_providers.openrouter?.temperature || 0.7
      };

      if (tools && tools.length > 0) {
        requestBody.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }));
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      
      if (!choice) {
        throw new Error('No response from OpenRouter API');
      }

      const toolCalls: ToolCall[] = [];
      if (choice.message?.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          });
        }
      }
      
      return {
        content: choice.message?.content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };
    } catch (error) {
      throw new Error(`OpenRouter API error: ${error}`);
    }
  }
}