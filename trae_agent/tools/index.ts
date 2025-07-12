// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Tools module for Trae Agent.
 */

export {
  Tool,
  ToolExecutor,
  ToolError,
  createToolExecResult,
  createToolResult,
  createToolCall,
  createToolParameter,
} from './base.js';

export type {
  ToolResult,
  ToolCall,
  ToolExecResult,
  ToolParameter,
  ToolCallArguments,
} from './base.js';

// Tool implementations
export { BashTool } from './bash_tool.js';
export { TextEditorTool } from './edit_tool.js';
export { JSONEditTool } from './json_edit_tool.js';
export { SequentialThinkingTool } from './sequential_thinking_tool.js';
export { TaskDoneTool } from './task_done_tool.js';

// Import Tool base class for registry typing
import { Tool } from './base.js';
import { BashTool } from './bash_tool.js';
import { TextEditorTool } from './edit_tool.js';
import { JSONEditTool } from './json_edit_tool.js';
import { SequentialThinkingTool } from './sequential_thinking_tool.js';
import { TaskDoneTool } from './task_done_tool.js';

// Tools registry
export const toolsRegistry: Record<
  string,
  (options?: { modelProvider?: string }) => Tool
> = {
  bash: () => new BashTool(),
  str_replace_based_edit_tool: () => new TextEditorTool(),
  json_edit_tool: () => new JSONEditTool(),
  sequentialthinking: () => new SequentialThinkingTool(),
  task_done: () => new TaskDoneTool(),
};
