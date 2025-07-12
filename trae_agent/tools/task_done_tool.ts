// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { Tool, ToolExecResult, ToolParameter, ToolCallArguments } from './base.js';

/**
 * Tool to mark a task as done.
 */
export class TaskDoneTool extends Tool {
  constructor(modelProvider?: string) {
    super({ modelProvider });
  }

  getName(): string {
    return 'task_done';
  }

  getDescription(): string {
    return 'Report the completion of the task. Note that you cannot call this tool before any verification is done. You can write reproduce / test script to verify your solution.';
  }

  getParameters(): ToolParameter[] {
    return [];
  }

  async execute(args: ToolCallArguments): Promise<ToolExecResult> {
    return {
      output: 'Task done.',
      error: undefined,
      errorCode: 0,
    };
  }
}
