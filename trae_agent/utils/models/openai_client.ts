// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

import type { Tool, ToolCall, ToolResult } from '../../tools/base.js';
import type { ModelParameters } from '../config.js';
import type { TrajectoryRecorder } from '../trajectory_recorder.js';
import type { LLMMessage, LLMResponse, LLMUsage } from '../llm_basics.js';

export async function chat(
  messages: LLMMessage[],
  modelParameters: ModelParameters,
  client: OpenAI,
  tools?: Tool[],
  reuseHistory: boolean = true,
  messageHistory?: ChatCompletionMessageParam[],
  trajectoryRecorder?: TrajectoryRecorder
): Promise<[LLMResponse, ChatCompletionMessageParam[]]> {
  const openaiMessages: ChatCompletionMessageParam[] = parseMessages(messages);

  let toolSchemas: ChatCompletionTool[] | undefined;
  if (tools && tools.length > 0) {
    toolSchemas = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.getInputSchema(),
        strict: true,
      },
    }));
  }

  const apiCallInput: ChatCompletionMessageParam[] = [];
  if (reuseHistory && messageHistory) {
    apiCallInput.push(...messageHistory);
  }
  apiCallInput.push(...openaiMessages);

  let response: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let errorMessage = '';

  for (let i = 0; i < modelParameters.max_retries; i++) {
    try {
      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams =
        {
          messages: apiCallInput,
          model: modelParameters.model,
          ...(toolSchemas && { tools: toolSchemas }),
          top_p: modelParameters.top_p,
          max_tokens: modelParameters.max_tokens,
        };

      if (
        !modelParameters.model.includes('o3') &&
        !modelParameters.model.includes('o4-mini')
      ) {
        requestParams.temperature = modelParameters.temperature;
      }

      response = await client.chat.completions.create(requestParams);
      break;
    } catch (e) {
      const thisErrorMessage = String(e);
      errorMessage += `Error ${i + 1}: ${thisErrorMessage}\n`;
      const sleepTime = Math.floor(Math.random() * 28) + 3;
      console.log(
        `OpenAI API call failed: ${thisErrorMessage} will sleep for ${sleepTime} seconds and will retry.`
      );
      await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
    }
  }

  if (response === null) {
    throw new Error(
      `Failed to get response from OpenAI after max retries: ${errorMessage}`
    );
  }

  const newMessageHistory: ChatCompletionMessageParam[] = [...apiCallInput];

  const assistantMessage: ChatCompletionMessageParam = {
    role: 'assistant',
    content: response.choices[0]?.message?.content || '',
    ...(response.choices[0]?.message?.tool_calls && {
      tool_calls: response.choices[0].message.tool_calls,
    }),
  };
  newMessageHistory.push(assistantMessage);

  const content = response.choices[0]?.message?.content || '';
  const toolCalls: ToolCall[] = [];

  if (response.choices[0]?.message?.tool_calls) {
    for (const toolCall of response.choices[0].message.tool_calls) {
      if (toolCall.type === 'function') {
        toolCalls.push({
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments || '{}'),
          id: toolCall.id,
        });
      }
    }
  }

  let usage: LLMUsage | undefined;
  if (response.usage) {
    const usageWithDetails = response.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
    
    usage = {
      inputTokens: response.usage.prompt_tokens || 0,
      outputTokens: response.usage.completion_tokens || 0,
      cacheReadInputTokens:
        usageWithDetails.prompt_tokens_details?.cached_tokens || 0,
      reasoningTokens:
        usageWithDetails.completion_tokens_details?.reasoning_tokens || 0,
    };
  }

  const llmResponse: LLMResponse = {
    content,
    usage,
    model: response.model,
    finishReason: response.choices[0]?.finish_reason || 'unknown',
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };

  if (trajectoryRecorder) {
    trajectoryRecorder.recordLlmInteraction(
      messages,
      llmResponse,
      'openai',
      modelParameters.model,
      tools
    );
  }

  return [llmResponse, newMessageHistory];
}

export function supportsToolCalling(modelParameters: ModelParameters): boolean {
  if (modelParameters.model.includes('o1-mini')) {
    return false;
  }

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
  return toolCapableModels.some(model => modelParameters.model.includes(model));
}

export function parseMessages(
  messages: LLMMessage[]
): ChatCompletionMessageParam[] {
  const openaiMessages: ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.toolResult) {
      openaiMessages.push(parseToolCallResult(msg.toolResult));
    } else if (msg.toolCall) {
      openaiMessages.push(parseToolCall(msg.toolCall));
    } else {
      if (!msg.content) {
        throw new Error('Message content is required');
      }
      if (msg.role === 'system') {
        openaiMessages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        openaiMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        openaiMessages.push({ role: 'assistant', content: msg.content });
      } else {
        throw new Error(`Invalid message role: ${msg.role}`);
      }
    }
  }
  return openaiMessages;
}

export function parseToolCall(toolCall: ToolCall): ChatCompletionMessageParam {
  const toolCallParam: ChatCompletionMessageToolCall = {
    id: toolCall.call_id,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.arguments),
    },
  };

  return {
    role: 'assistant',
    content: null,
    tool_calls: [toolCallParam],
  };
}

export function parseToolCallResult(
  toolCallResult: ToolResult
): ChatCompletionMessageParam {
  let resultContent = '';
  if (toolCallResult.result !== null && toolCallResult.result !== undefined) {
    resultContent += String(toolCallResult.result);
  }
  if (toolCallResult.error) {
    resultContent += `\nError: ${toolCallResult.error}`;
  }
  resultContent = resultContent.trim();

  return {
    role: 'tool',
    content: resultContent,
    tool_call_id: toolCallResult.call_id,
  };
}
