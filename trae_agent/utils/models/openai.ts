// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { Tool } from '../../tools/base.js';
import { BaseLLMClient } from '../base_client.js';
import type { ModelParameters } from '../config.js';
import type { LLMMessage, LLMResponse } from '../llm_basics.js';

/**
 * This file provides a base class for OpenAI compatible clients
 */

export class OpenAIClientBase extends BaseLLMClient {
  protected provider: string;
  protected client: OpenAI;
  protected messageHistory: ChatCompletionMessageParam[];

  constructor(modelParameters: ModelParameters, provider?: string) {
    /**
     * The init function should separate different clients to specific
     * chat, support tool calling and all kinds of parsing
     */

    // default setting as openai
    if (!provider) {
      provider = 'openai';
    }

    super(modelParameters);

    // save provider
    this.provider = provider;

    if (this.apiKey === '') {
      // all openai compatible models will be using OPENAI_API_KEY
      this.apiKey = process.env.OPENAI_API_KEY || '';
      if (provider === 'ollama') {
        this.apiKey = 'ollama';
      }
    }

    if (this.apiKey === '') {
      throw new Error(
        'API key not provided. Set OPENAI_API_KEY in environment variables or config file.'
      );
    }

    this.client = new OpenAI({ apiKey: this.apiKey });

    const baseUrl = modelParameters.baseUrl;
    if (baseUrl) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: baseUrl,
      });
    }

    this.messageHistory = [];
  }

  override setChatHistory(messages: LLMMessage[]): void {
    /**
     * set chat history provides a method to set the messages list
     * to the one we provided.
     */
    this.messageHistory = this.parseMessages(messages);
  }

  override async chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory: boolean = true
  ): Promise<LLMResponse> {
    switch (this.provider) {
      default: {
        const { chat: openaiChat } = await import('./openai_client.js');

        const [llmResponse, messageHistory] = await openaiChat(
          messages,
          modelParameters,
          this.client,
          tools,
          reuseHistory,
          this.messageHistory,
          this.trajectoryRecorder
        );
        this.messageHistory = messageHistory;
        return llmResponse;
      }
    }
  }

  override supportsToolCalling(modelParameters: ModelParameters): boolean {
    switch (this.provider) {
      default: {
        const {
          supportsToolCalling: openaiSupportsToolCalling,
        } = require('./openai_client.js');
        return openaiSupportsToolCalling(modelParameters);
      }
    }
  }

  parseMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    switch (this.provider) {
      default: {
        const {
          parseMessages: openaiParseMessages,
        } = require('./openai_client.js');
        return openaiParseMessages(messages);
      }
    }
  }
}
