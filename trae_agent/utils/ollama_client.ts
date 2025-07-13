// SPDX-License-Identifier: MIT

/**
 * Ollama API client wrapper with tool integration
 */

import { Ollama } from 'ollama';
import OpenAI from 'openai';
import { BaseLLMClient } from './base_client.js';
import { ModelParameters } from './config.js';
import { LLMMessage, LLMResponse } from './llm_basics.js';
import { Tool, ToolCall, ToolResult } from '../tools/base.js';

interface OllamaToolCall {
  function: {
    name: string;
    arguments: { [key: string]: unknown };
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaResponse {
  message: {
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  model?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class OllamaClient extends BaseLLMClient {
  private client: Ollama;
  private messageHistory: OllamaMessage[] = [];

  constructor(modelParameters: ModelParameters) {
    super(modelParameters);
    this.client = new Ollama({
      host: this.baseUrl || 'http://localhost:11434',
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
    const ollamaMessages = this.parseMessages(messages);

    if (reuseHistory) {
      this.messageHistory = [...this.messageHistory, ...ollamaMessages];
    } else {
      this.messageHistory = ollamaMessages;
    }

    let toolSchemas: OllamaTool[] | undefined;
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

    let response: OllamaResponse | null = null;
    let errorMessage = '';

    for (let i = 0; i < modelParameters.maxRetries; i++) {
      try {
        response = await this.client.chat({
          model: modelParameters.model,
          messages: this.messageHistory,
          tools: toolSchemas,
          // Note: Ollama doesn't support all parameters
          // temperature: modelParameters.temperature,
          // top_p: modelParameters.topP,
          // max_tokens: modelParameters.maxTokens,
        });
        break;
      } catch (error) {
        const thisErrorMessage =
          error instanceof Error ? error.message : String(error);
        errorMessage += `Error ${i + 1}: ${thisErrorMessage}\n`;
        const sleepTime = Math.floor(Math.random() * 27) + 3; // 3-30 seconds
        console.log(
          `Ollama API call failed: ${thisErrorMessage} will sleep for ${sleepTime} seconds and will retry.`
        );
        await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
      }
    }

    if (!response) {
      throw new Error(
        `Failed to get response from Ollama after max retries: ${errorMessage}`
      );
    }

    let content = '';
    let toolCalls: ToolCall[] | undefined;

    if (response.message) {
      content = response.message.content || '';

      if (response.message.tool_calls) {
        toolCalls = response.message.tool_calls.map((toolCall: OllamaToolCall) => ({
          name: toolCall.function.name,
          callId: this.generateUuid(),
          arguments: toolCall.function.arguments as Record<string, string | number | boolean | object | null | undefined>,
        }));
      }
    }

    const llmResponse: LLMResponse = {
      content,
      toolCalls,
      finishReason: response.done_reason || 'stop',
      model: response.model || modelParameters.model,
      usage: undefined, // Ollama doesn't provide usage information
    };

    // Update message history
    if (llmResponse.toolCalls) {
      this.messageHistory.push({
        role: 'assistant',
        content: llmResponse.content,
        tool_calls: llmResponse.toolCalls.map(toolCall => ({
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
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
        'ollama',
        modelParameters.model,
        tools
      );
    }

    return llmResponse;
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    const toolSupportModels = [
      'deepseek-r1',
      'qwen3',
      'llama3.1',
      'llama3.2',
      'mistral',
      'qwen2.5',
      'qwen2.5-coder',
      'mistral-nemo',
      'llama3.3',
      'qwq',
      'mistral-small',
      'mixtral',
      'smollm2',
      'llama4',
      'command-r',
      'hermes3',
      'phi4-mini',
      'granite3.3',
      'devstral',
      'mistral-small3.1',
    ];

    return toolSupportModels.some(model =>
      modelParameters.model.includes(model)
    );
  }

  private parseMessages(messages: LLMMessage[]): OllamaMessage[] {
    const ollamaMessages: OllamaMessage[] = [];

    for (const msg of messages) {
      if (msg.toolCall) {
        // Tool calls are handled differently in Ollama
        // We'll add them as assistant messages with tool_calls
        ollamaMessages.push({
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: msg.toolCall.name,
                arguments: msg.toolCall.arguments,
              },
            },
          ],
        });
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

        ollamaMessages.push({
          role: 'tool',
          content: result,
        });
      } else if (msg.role === 'system') {
        if (!msg.content) {
          throw new Error('System message content is required');
        }
        ollamaMessages.push({
          role: 'system',
          content: msg.content,
        });
      } else if (msg.role === 'user') {
        if (!msg.content) {
          throw new Error('User message content is required');
        }
        ollamaMessages.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        if (!msg.content) {
          throw new Error('Assistant message content is required');
        }
        ollamaMessages.push({
          role: 'assistant',
          content: msg.content,
        });
      } else {
        throw new Error(`Invalid message role: ${msg.role}`);
      }
    }

    return ollamaMessages;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }
}
