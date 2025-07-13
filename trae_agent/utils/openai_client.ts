// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import OpenAI from 'openai';
import { BaseLLMClient } from './base_client.js';
import { LLMMessage, LLMResponse, LLMUsage } from './llm_basics.js';
import { ToolCall, Tool } from '../tools/base.js';
import { ModelParameters } from './config.js';

/**
 * OpenAI client implementation.
 */
export class OpenAIClient extends BaseLLMClient {
  private client: OpenAI;

  constructor(modelParameters: ModelParameters) {
    super(modelParameters);
    this.client = new OpenAI({
      apiKey: this.apiKey || process.env.OPENAI_API_KEY,
      baseURL: this.baseUrl,
    });
  }

  setChatHistory(messages: LLMMessage[]): void {
    // OpenAI doesn't require persistent chat history
    // Implementation can be added if needed
  }

  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory?: boolean
  ): Promise<LLMResponse> {
    // Delegate to the complete method for now
    return this.complete(
      messages,
      modelParameters.model,
      tools,
      modelParameters.temperature,
      modelParameters.maxTokens
    );
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    const toolCapableModels = [
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.5',
      'o1',
      'o3',
      'o3-mini',
      'o4-mini',
    ];
    return toolCapableModels.some(model =>
      modelParameters.model.includes(model)
    );
  }

  async complete(
    messages: LLMMessage[],
    model: string = 'gpt-4',
    tools?: Tool[],
    temperature: number = 0.7,
    maxTokens?: number
  ): Promise<LLMResponse> {
    try {
      const formattedMessages = this.formatMessages(messages);
      const formattedTools = tools ? this.formatTools(tools) : undefined;

      const response = await this.client.chat.completions.create({
        model,
        messages: formattedMessages,
        tools: formattedTools,
        temperature,
        max_tokens: maxTokens,
      });

      return this.parseResponse(response);
    } catch (error) {
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private formatMessages(
    messages: LLMMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.toolResult) {
        return {
          role: 'tool',
          content: msg.toolResult.result || msg.toolResult.error || '',
          tool_call_id: msg.toolResult.callId,
        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
      }

      if (msg.toolCall) {
        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content || null,
          tool_calls: [
            {
              id: msg.toolCall.callId,
              type: 'function',
              function: {
                name: msg.toolCall.name,
                arguments: JSON.stringify(msg.toolCall.arguments),
              },
            },
          ],
        } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
      }

      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || null,
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    });
  }

  private formatTools(
    tools: Tool[]
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.getInputSchema(),
      },
    }));
  }

  private parseResponse(
    response: OpenAI.Chat.Completions.ChatCompletion
  ): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;

    let toolCalls: ToolCall[] | undefined;
    if (message.tool_calls) {
      toolCalls = message.tool_calls.map(tc => ({
        name: tc.function.name,
        callId: tc.id,
        arguments: JSON.parse(tc.function.arguments || '{}'),
        id: tc.id,
      }));
    }

    let usage: LLMUsage | undefined;
    if (response.usage) {
      usage = {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };
    }

    return {
      content: message.content || '',
      usage,
      model: response.model,
      finishReason: choice.finish_reason || undefined,
      toolCalls,
    };
  }
}
