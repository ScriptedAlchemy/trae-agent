// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Trae Agent - LLM-based agent for general purpose software engineering tasks.
 */

export const __version__ = '0.1.0';

export { Agent } from './agent/base.js';
export { TraeAgent } from './agent/trae_agent.js';
export { Tool, ToolExecutor } from './tools/base.js';
export { LLMClient } from './utils/llm_client.js';

// Re-export types for convenience
export type { AgentExecution } from './agent/agent_basics.js';
export type { LLMMessage, LLMResponse } from './utils/llm_basics.js';
export type { Config } from './utils/config.js';
