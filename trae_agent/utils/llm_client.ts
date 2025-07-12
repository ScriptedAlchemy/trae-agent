// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Main LLM client that supports multiple providers.
 */

import type { Tool } from '../tools/base.js';
import type { ModelParameters } from './config.js';
import type { LLMMessage, LLMResponse } from './llm_basics.js';
import type { TrajectoryRecorder } from './trajectory_recorder.js';
import { BaseLLMClient } from './base_client.js';

// Import client implementations
import { OpenAIClient } from './openai_client.js';
import { AnthropicClient } from './anthropic_client.js';
import { AzureClient } from './azure_client.js';
import { OllamaClient } from './ollama_client.js';
import { OpenRouterClient } from './openrouter_client.js';
import { GoogleClient } from './google_client.js';
import { DoubaoClient } from './doubao_client.js';

/**
 * Supported LLM providers.
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  OLLAMA = 'ollama',
  OPENROUTER = 'openrouter',
  DOUBAO = 'doubao',
  GOOGLE = 'google',
}

/**
 * Main LLM client that supports multiple providers.
 */
export class LLMClient {
  public provider: string;
  public client: BaseLLMClient;
  private _modelParameters: ModelParameters;
  private _maxSteps: number;

  constructor(
    provider: string,
    modelParameters: ModelParameters,
    maxSteps: number
  ) {
    this.provider = provider;
    this._modelParameters = modelParameters;
    this._maxSteps = maxSteps;

    // Create the appropriate client based on provider
    this.client = this.createClient(provider, modelParameters);
  }

  private createClient(provider: string, modelParameters: ModelParameters): BaseLLMClient {
    switch (provider) {
      case LLMProvider.OPENAI:
        return new OpenAIClient(modelParameters);
      case LLMProvider.ANTHROPIC:
        return new AnthropicClient(modelParameters);
      case LLMProvider.AZURE:
        return new AzureClient(modelParameters);
      case LLMProvider.OLLAMA:
        return new OllamaClient(modelParameters);
      case LLMProvider.OPENROUTER:
        return new OpenRouterClient(modelParameters);
      case LLMProvider.GOOGLE:
        return new GoogleClient(modelParameters);
      case LLMProvider.DOUBAO:
        return new DoubaoClient(modelParameters);
      default:
        console.warn(`Unknown provider '${provider}', falling back to mock client`);
        return new MockLLMClient(modelParameters);
    }
  }

  /**
   * Set the trajectory recorder for this client.
   */
  setTrajectoryRecorder(recorder?: TrajectoryRecorder): void {
    this.client.setTrajectoryRecorder(recorder);
  }

  /**
   * Set the chat history.
   */
  setChatHistory(messages: LLMMessage[]): void {
    this.client.setChatHistory(messages);
  }

  /**
   * Send chat messages to the LLM.
   */
  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory?: boolean
  ): Promise<LLMResponse> {
    return this.client.chat(messages, modelParameters, tools, reuseHistory);
  }

  /**
   * Check if the current model supports tool calling.
   */
  supportsToolCalling(modelParameters: ModelParameters): boolean {
    return this.client.supportsToolCalling(modelParameters);
  }

  /**
   * Get the model parameters.
   */
  get modelParameters(): ModelParameters {
    return this._modelParameters;
  }

  /**
   * Get the max steps.
   */
  get maxSteps(): number {
    return this._maxSteps;
  }
}

/**
 * Mock LLM client for testing and development.
 */
class MockLLMClient extends BaseLLMClient {
  private chatHistory: LLMMessage[] = [];

  setChatHistory(messages: LLMMessage[]): void {
    this.chatHistory = [...messages];
  }

  async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory?: boolean
  ): Promise<LLMResponse> {
    return {
      content: 'Mock response from LLM client',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
      },
      model: modelParameters.model,
      finishReason: 'stop',
    };
  }

  supportsToolCalling(modelParameters: ModelParameters): boolean {
    return true;
  }
}
