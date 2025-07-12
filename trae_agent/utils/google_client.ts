// SPDX-License-Identifier: MIT

/**
 * Google Gemini API client wrapper with tool integration.
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  FunctionCall,
  FunctionResponse,
} from '@google/generative-ai';
import { BaseLLMClient } from './base_client.js';
import { ModelParameters } from './config.js';
import { LLMMessage, LLMResponse, LLMUsage } from './llm_basics.js';
import { Tool, ToolCall, ToolResult } from '../tools/base.js';

interface GeminiContent {
  role: string;
  parts: Part[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: Content;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export class GoogleClient extends BaseLLMClient {
  private client: GoogleGenerativeAI;
  private messageHistory: Content[] = [];
  private systemInstruction: string | null = null;

  constructor(modelParameters: ModelParameters) {
    super(modelParameters);
    this.client = new GoogleGenerativeAI(this.apiKey);
  }

  setChatHistory(messages: LLMMessage[]): void {
    const [parsedMessages, systemInstruction] = this.parseMessages(messages);
    this.messageHistory = parsedMessages;
    this.systemInstruction = systemInstruction;
  }

  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory: boolean = true
  ): Promise<LLMResponse> {
    const [newlyParsedMessages, systemInstructionFromMessage] =
      this.parseMessages(messages);

    const currentSystemInstruction =
      systemInstructionFromMessage || this.systemInstruction;

    let currentChatContents: Content[];
    if (reuseHistory) {
      currentChatContents = [...this.messageHistory, ...newlyParsedMessages];
    } else {
      currentChatContents = newlyParsedMessages;
    }

    const model = this.client.getGenerativeModel({
      model: modelParameters.model,
      systemInstruction: currentSystemInstruction || undefined,
      generationConfig: {
        temperature: modelParameters.temperature,
        topP: modelParameters.topP,
        topK: modelParameters.topK,
        maxOutputTokens: modelParameters.maxTokens,
        candidateCount: modelParameters.candidateCount || 1,
        stopSequences: modelParameters.stopSequences,
      },
      tools: tools ? this.convertToolsToGeminiFormat(tools) : undefined,
    });

    let response: any = null;
    let errorMessage = '';

    for (let i = 0; i < modelParameters.maxRetries; i++) {
      try {
        response = await model.generateContent({
          contents: currentChatContents,
        });
        break;
      } catch (error) {
        const thisErrorMessage =
          error instanceof Error ? error.message : String(error);
        errorMessage += `Error ${i + 1}: ${thisErrorMessage}\n`;
        const sleepTime = Math.floor(Math.random() * 27) + 3; // 3-30 seconds
        console.log(
          `Google API call failed: ${thisErrorMessage} will sleep for ${sleepTime} seconds and will retry.`
        );
        await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
      }
    }

    if (!response) {
      throw new Error(
        `Failed to get response from Gemini after max retries: ${errorMessage}`
      );
    }

    let content = '';
    const toolCalls: ToolCall[] = [];
    let assistantResponseContent: Content | null = null;

    if (response.response?.candidates) {
      const candidate = response.response.candidates[0];
      if (candidate.content?.parts) {
        assistantResponseContent = candidate.content;
        for (const part of candidate.content.parts) {
          if (part.text) {
            content += part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              callId: this.generateUUID(),
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            });
          }
        }
      }
    }

    let newHistory: Content[];
    if (reuseHistory) {
      newHistory = [...this.messageHistory, ...newlyParsedMessages];
    } else {
      newHistory = newlyParsedMessages;
    }

    if (assistantResponseContent) {
      newHistory.push(assistantResponseContent);
    }

    this.messageHistory = newHistory;

    if (currentSystemInstruction) {
      this.systemInstruction = currentSystemInstruction;
    }

    let usage: LLMUsage | undefined;
    if (response.response?.usageMetadata) {
      const metadata = response.response.usageMetadata;
      usage = {
        inputTokens: metadata.promptTokenCount || 0,
        outputTokens: metadata.candidatesTokenCount || 0,
        cacheReadInputTokens: metadata.cachedContentTokenCount || 0,
        cacheCreationInputTokens: 0,
      };
    }

    const llmResponse: LLMResponse = {
      content,
      usage,
      model: modelParameters.model,
      finishReason:
        response.response?.candidates?.[0]?.finishReason || 'UNKNOWN',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    if (this.trajectoryRecorder) {
      this.trajectoryRecorder.recordLlmInteraction(
        messages,
        llmResponse,
        'google',
        modelParameters.model,
        tools
      );
    }

    return llmResponse;
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    const toolCapableModels = [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
    ];
    return toolCapableModels.some(model =>
      modelParameters.model.includes(model)
    );
  }

  private parseMessages(messages: LLMMessage[]): [Content[], string | null] {
    const geminiMessages: Content[] = [];
    let systemInstruction: string | null = null;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content || null;
        continue;
      } else if (msg.toolResult) {
        geminiMessages.push({
          role: 'function',
          parts: [this.parseToolCallResult(msg.toolResult)],
        });
      } else if (msg.toolCall) {
        geminiMessages.push({
          role: 'model',
          parts: [this.parseToolCall(msg.toolCall)],
        });
      } else {
        const role = msg.role === 'user' ? 'user' : 'model';
        geminiMessages.push({
          role,
          parts: [{ text: msg.content || '' }],
        });
      }
    }

    return [geminiMessages, systemInstruction];
  }

  private parseToolCall(toolCall: ToolCall): Part {
    return {
      functionCall: {
        name: toolCall.name,
        args: toolCall.arguments,
      },
    };
  }

  private parseToolCallResult(toolResult: ToolResult): Part {
    const resultContent: Record<string, any> = {};

    if (toolResult.result !== null && toolResult.result !== undefined) {
      if (
        typeof toolResult.result === 'string' ||
        typeof toolResult.result === 'number' ||
        typeof toolResult.result === 'boolean' ||
        Array.isArray(toolResult.result) ||
        (typeof toolResult.result === 'object' && toolResult.result !== null)
      ) {
        try {
          JSON.stringify(toolResult.result);
          resultContent.result = toolResult.result;
        } catch (error) {
          const serializationError = `JSON serialization failed for tool result: ${error}`;
          if (toolResult.error) {
            resultContent.error = `${toolResult.error}\n\n${serializationError}`;
          } else {
            resultContent.error = serializationError;
          }
          resultContent.result = String(toolResult.result);
        }
      } else {
        resultContent.result = String(toolResult.result);
      }
    }

    if (toolResult.error && !('error' in resultContent)) {
      resultContent.error = toolResult.error;
    }

    if (Object.keys(resultContent).length === 0) {
      resultContent.status =
        'Tool executed successfully but returned no output.';
    }

    if (!toolResult.name) {
      throw new Error(
        "ToolResult must have a 'name' attribute matching the function that was called."
      );
    }

    return {
      functionResponse: {
        name: toolResult.name,
        response: resultContent,
      },
    };
  }

  private convertToolsToGeminiFormat(tools: Tool[]): any[] {
    try {
      const functionDeclarations = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.getInputSchema(),
      }));

      return [
        {
          functionDeclarations,
        },
      ];
    } catch (error) {
      throw new Error(
        `Failed to convert tools into Gemini FunctionDeclarations: ${error}`
      );
    }
  }

  private generateUUID(): string {
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
