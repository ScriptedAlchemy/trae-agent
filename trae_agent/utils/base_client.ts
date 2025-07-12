// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Base class for LLM clients.
 */

import type { Tool } from '../tools/base.js';
import type { ModelParameters } from './config.js';
import type { LLMMessage, LLMResponse } from './llm_basics.js';
import type { TrajectoryRecorder } from './trajectory_recorder.js';

/**
 * Base class for LLM clients.
 */
export abstract class BaseLLMClient {
  public apiKey: string;
  public baseUrl?: string;
  public apiVersion?: string;
  public trajectoryRecorder?: TrajectoryRecorder;

  constructor(modelParameters: ModelParameters) {
    this.apiKey = modelParameters.api_key;
    this.baseUrl = modelParameters.base_url;
    this.apiVersion = modelParameters.api_version;
    this.trajectoryRecorder = undefined;
  }

  /**
   * Set the trajectory recorder for this client.
   */
  setTrajectoryRecorder(recorder?: TrajectoryRecorder): void {
    this.trajectoryRecorder = recorder;
  }

  /**
   * Set the chat history.
   */
  abstract setChatHistory(messages: LLMMessage[]): void;

  /**
   * Send chat messages to the LLM.
   */
  abstract chat(
    messages: LLMMessage[],
    modelParameters: ModelParameters,
    tools?: Tool[],
    reuseHistory?: boolean
  ): Promise<LLMResponse>;

  /**
   * Check if the current model supports tool calling.
   */
  abstract supportsToolCalling(modelParameters: ModelParameters): boolean;
}
