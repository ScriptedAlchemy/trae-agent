// SPDX-License-Identifier: MIT

/**
 * Azure client wrapper with tool integrations.
 */

import OpenAI from 'openai';
import { BaseLLMClient } from './base_client.js';
import { ModelParameters } from './config.js';
import { LLMMessage, LLMResponse, LLMUsage } from './llm_basics.js';
import { Tool, ToolCall, ToolResult } from '../tools/base.js';

type ChatCompletionMessageParam =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatCompletionAssistantMessageParam =
  OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
type ChatCompletionUserMessageParam =
  OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
type ChatCompletionSystemMessageParam =
  OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;
type ChatCompletionToolMessageParam =
  OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
type ChatCompletionFunctionMessageParam =
  OpenAI.Chat.Completions.ChatCompletionFunctionMessageParam;

export class AzureClient extends BaseLLMClient {
  private client: OpenAI;
  private messageHistory: ChatCompletionMessageParam[] = [];

  constructor(modelParameters: ModelParameters) {
    super(modelParameters);

    if (!this.baseUrl) {
      throw new Error('baseUrl is required for AzureClient');
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultQuery: { 'api-version': this.apiVersion },
      defaultHeaders: {
        'api-key': this.apiKey,
      },
    });
  }

  setChatHistory(messages: LLMMessage[]): void {
    this.messageHistory = this.parseMessages(messages);
  }

  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory: boolean = true
  ): Promise<LLMResponse> {
    const azureMessages = this.parseMessages(messages);

    if (reuseHistory) {
      this.messageHistory = [...this.messageHistory, ...azureMessages];
    } else {
      this.messageHistory = azureMessages;
    }

    let toolSchemas: ChatCompletionTool[] | undefined;
    if (tools) {
      toolSchemas = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.getName(),
          description: tool.getDescription(),
          parameters: tool.getInputSchema(),
        },
      }));
    }

    let response: OpenAI.Chat.Completions.ChatCompletion | null = null;
    let errorMessage = '';

    for (let i = 0; i < modelParameters.maxRetries; i++) {
      try {
        response = await this.client.chat.completions.create({
          model: modelParameters.model,
          messages: this.messageHistory,
          tools: toolSchemas,
          temperature: modelParameters.temperature,
          top_p: modelParameters.topP,
          max_tokens: modelParameters.maxTokens,
          n: 1,
        });
        break;
      } catch (error) {
        const thisErrorMessage =
          error instanceof Error ? error.message : String(error);
        errorMessage += `Error ${i + 1}: ${thisErrorMessage}\n`;
        const sleepTime = Math.floor(Math.random() * 27) + 3; // 3-30 seconds
        console.log(
          `Azure API call failed: ${thisErrorMessage} will sleep for ${sleepTime} seconds and will retry.`
        );
        await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
      }
    }

    if (!response) {
      throw new Error(
        `Failed to get response from Azure after max retries: ${errorMessage}`
      );
    }

    const choice = response.choices[0];

    let toolCalls: ToolCall[] | undefined;
    if (choice.message.tool_calls) {
      toolCalls = choice.message.tool_calls.map(toolCall => ({
        name: toolCall.function.name,
        callId: toolCall.id,
        arguments: toolCall.function.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {},
      }));
    }

    const llmResponse: LLMResponse = {
      content: choice.message.content || '',
      toolCalls,
      finishReason: choice.finish_reason || 'unknown',
      model: response.model,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens || 0,
            outputTokens: response.usage.completion_tokens || 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          }
        : undefined,
    };

    // Update message history
    if (llmResponse.toolCalls) {
      this.messageHistory.push({
        role: 'assistant',
        content: llmResponse.content,
        tool_calls: llmResponse.toolCalls.map(toolCall => ({
          id: toolCall.callId,
          type: 'function' as const,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
          },
        })),
      });
    } else if (llmResponse.content) {
      this.messageHistory.push({
        role: 'assistant',
        content: llmResponse.content,
      });
    }

    if (this.trajectoryRecorder) {
      this.trajectoryRecorder.recordLlmInteraction(
        messages,
        llmResponse,
        'azure',
        modelParameters.model,
        tools
      );
    }

    return llmResponse;
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    return true;
  }

  private parseMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    const azureMessages: ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      if (msg.toolCall) {
        azureMessages.push({
          role: 'function',
          content: JSON.stringify({
            name: msg.toolCall.name,
            arguments: msg.toolCall.arguments,
          }),
          name: msg.toolCall.name,
        } as ChatCompletionFunctionMessageParam);
      } else if (msg.toolResult) {
        let result = '';
        if (msg.toolResult.result) {
          result = result + msg.toolResult.result + '\n';
        }
        if (msg.toolResult.error) {
          result += 'Tool call failed with error:\n';
          result += msg.toolResult.error;
        }
        result = result.trim();

        azureMessages.push({
          role: 'tool',
          content: result,
          tool_call_id: msg.toolResult.callId,
        } as ChatCompletionToolMessageParam);
      } else if (msg.role === 'system') {
        if (!msg.content) {
          throw new Error('System message content is required');
        }
        azureMessages.push({
          role: 'system',
          content: msg.content,
        } as ChatCompletionSystemMessageParam);
      } else if (msg.role === 'user') {
        if (!msg.content) {
          throw new Error('User message content is required');
        }
        azureMessages.push({
          role: 'user',
          content: msg.content,
        } as ChatCompletionUserMessageParam);
      } else if (msg.role === 'assistant') {
        if (!msg.content) {
          throw new Error('Assistant message content is required');
        }
        azureMessages.push({
          role: 'assistant',
          content: msg.content,
        } as ChatCompletionAssistantMessageParam);
      } else {
        throw new Error(`Invalid message role: ${msg.role}`);
      }
    }

    return azureMessages;
  }
}
