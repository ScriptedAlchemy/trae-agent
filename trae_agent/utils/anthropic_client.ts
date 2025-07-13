// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolUseBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { BaseLLMClient } from './base_client.js';
import { LLMMessage, LLMResponse, LLMUsage } from './llm_basics.js';
import { ToolCall, Tool, ToolResult } from '../tools/base.js';
import { ModelParameters } from './config.js';
import type { TrajectoryRecorder } from './trajectory_recorder.js';

/**
 * Anthropic client implementation.
 */
export class AnthropicClient extends BaseLLMClient {
  private client: Anthropic;
  private messageHistory: MessageParam[] = [];
  private systemMessage: string | undefined;

  constructor(modelParameters: ModelParameters) {
    super(modelParameters);
    this.client = new Anthropic({
      apiKey: this.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: this.baseUrl,
    });
  }

  setChatHistory(messages: LLMMessage[]): void {
    this.messageHistory = this.parseMessages(messages);
  }

  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory: boolean = true,
    trajectoryRecorder?: TrajectoryRecorder
  ): Promise<LLMResponse> {
    // Convert messages to Anthropic format
    const anthropicMessages: MessageParam[] = this.parseMessages(messages);

    // Update message history like Python does
    if (reuseHistory) {
      this.messageHistory = [...this.messageHistory, ...anthropicMessages];
    } else {
      this.messageHistory = anthropicMessages;
    }
    
    const currentMessageHistory = this.messageHistory;

    // Add tools if provided
    let toolSchemas: Anthropic.Messages.Tool[] | undefined;
    if (tools) {
      toolSchemas = [];
      for (const tool of tools) {
        if (tool.name === "str_replace_based_edit_tool") {
          // Use built-in text editor tool
          toolSchemas.push({
            name: "str_replace_based_edit_tool",
            type: "text_editor_20250429",
          } as any);
        } else if (tool.name === "bash") {
          // Use built-in bash tool
          toolSchemas.push({
            name: "bash",
            type: "bash_20250124",
          } as any);
        } else {
          toolSchemas.push({
            name: tool.name,
            description: tool.description,
            input_schema: tool.getInputSchema() as any,
          });
        }
      }
    }

    let response: Anthropic.Messages.Message | null = null;
    let errorMessage = "";
    
    for (let i = 0; i < modelParameters.max_retries; i++) {
      try {
        response = await this.client.messages.create({
          model: modelParameters.model,
          messages: currentMessageHistory,
          max_tokens: modelParameters.max_tokens,
          system: this.systemMessage,
          tools: toolSchemas,
          temperature: modelParameters.temperature,
          top_p: modelParameters.top_p,
          top_k: modelParameters.top_k,
        });
        break;
      } catch (e) {
        const thisErrorMessage = String(e);
        errorMessage += `Error ${i + 1}: ${thisErrorMessage}\n`;
        const sleepTime = Math.floor(Math.random() * 28) + 3;
        console.log(
          `Anthropic API call failed: ${thisErrorMessage} will sleep for ${sleepTime} seconds and will retry.`
        );
        await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
      }
    }

    if (response === null) {
      throw new Error(
        `Failed to get response from Anthropic after max retries: ${errorMessage}`
      );
    }

    // Handle tool calls in response
    let content = "";
    const toolCalls: ToolCall[] = [];

    // Match Python's behavior of adding each content block separately
    for (const contentBlock of response.content) {
      if (contentBlock.type === "text") {
        content += contentBlock.text;
        this.messageHistory.push({
          role: "assistant",
          content: contentBlock.text,
        });
      } else if (contentBlock.type === "tool_use") {
        toolCalls.push({
          call_id: contentBlock.id,
          name: contentBlock.name,
          arguments: contentBlock.input as Record<string, any>,
          id: contentBlock.id,
        });
        this.messageHistory.push({
          role: "assistant",
          content: [contentBlock],
        });
      }
    }

    let usage: LLMUsage | undefined;
    if (response.usage) {
      usage = {
        inputTokens: response.usage.input_tokens || 0,
        outputTokens: response.usage.output_tokens || 0,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens || 0,
        cacheReadInputTokens: response.usage.cache_read_input_tokens || 0,
      };
    }

    const llmResponse: LLMResponse = {
      content,
      usage,
      model: response.model,
      finishReason: response.stop_reason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    // Record trajectory if recorder is available
    if (trajectoryRecorder) {
      trajectoryRecorder.recordLlmInteraction(
        messages,
        llmResponse,
        "anthropic",
        modelParameters.model,
        tools
      );
    }

    return llmResponse;
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    const toolCapableModels = [
      "claude-3-opus",
      "claude-3-sonnet",
      "claude-3-haiku",
      "claude-3-5-opus",
      "claude-3-5-sonnet",
      "claude-3-5-haiku",
      "claude-3-7-sonnet",
      "claude-4-opus",
      "claude-4-sonnet",
    ];
    return toolCapableModels.some(model => modelParameters.model.includes(model));
  }

  private parseMessages(messages: LLMMessage[]): MessageParam[] {
    const anthropicMessages: MessageParam[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        this.systemMessage = msg.content || undefined;
      } else if (msg.toolResult) {
        anthropicMessages.push({
          role: "user",
          content: [this.parseToolCallResult(msg.toolResult)],
        });
      } else if (msg.toolCall) {
        anthropicMessages.push({
          role: "assistant",
          content: [this.parseToolCall(msg.toolCall)],
        });
      } else {
        let role: "user" | "assistant";
        if (msg.role === "user") {
          role = "user";
        } else if (msg.role === "assistant") {
          role = "assistant";
        } else {
          throw new Error(`Invalid message role: ${msg.role}`);
        }

        if (!msg.content) {
          throw new Error("Message content is required");
        }

        anthropicMessages.push({
          role,
          content: msg.content,
        });
      }
    }
    return anthropicMessages;
  }

  private parseToolCall(toolCall: ToolCall): ToolUseBlock {
    return {
      type: "tool_use",
      id: toolCall.call_id,
      name: toolCall.name,
      input: toolCall.arguments,
    };
  }

  private parseToolCallResult(toolCallResult: ToolResult): ToolResultBlockParam {
    let result = "";
    if (toolCallResult.result) {
      result = result + toolCallResult.result + "\n";
    }
    if (toolCallResult.error) {
      result += "Tool call failed with error:\n";
      result += toolCallResult.error;
    }
    result = result.trim();

    // Ensure content is not empty when is_error is true
    if (!toolCallResult.success && !result) {
      result = "Tool execution failed with no error message";
    }

    return {
      tool_use_id: toolCallResult.call_id,
      type: "tool_result",
      content: result,
      is_error: !toolCallResult.success,
    };
  }
}