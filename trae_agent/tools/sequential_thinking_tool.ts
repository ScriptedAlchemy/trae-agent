// Copyright (c) 2023 Anthropic
// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates.
// SPDX-License-Identifier: MIT
//
// This file has been modified by ByteDance Ltd. and/or its affiliates. on 13 June 2025
//
// Original file was released under MIT License, with the full license text
// available at https://github.com/anthropics/anthropic-quickstarts/blob/main/LICENSE
//
// This modified file is released under the same license.

import { Tool, ToolExecResult, ToolParameter, ToolCallArguments } from './base.js';

interface ThoughtData {
  thought: string;
  thought_number: number;
  total_thoughts: number;
  next_thought_needed: boolean;
  is_revision?: boolean;
  revises_thought?: number;
  branch_from_thought?: number;
  branch_id?: string;
  needs_more_thoughts?: boolean;
}

/**
 * A tool for sequential thinking that helps break down complex problems.
 *
 * This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
 * Each thought can build on, question, or revise previous insights as understanding deepens.
 */
export class SequentialThinkingTool extends Tool {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};

  constructor(modelProvider?: string) {
    super({ modelProvider });
  }

  getName(): string {
    return 'sequentialthinking';
  }

  getDescription(): string {
    return `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached`;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'thought',
        type: 'string',
        description: 'Your current thinking step',
        required: true,
      },
      {
        name: 'next_thought_needed',
        type: 'boolean',
        description: 'Whether another thought step is needed',
        required: true,
      },
      {
        name: 'thought_number',
        type: 'number',
        description: 'Current thought number. Minimum value is 1.',
        required: true,
      },
      {
        name: 'total_thoughts',
        type: 'number',
        description: 'Estimated total thoughts needed. Minimum value is 1.',
        required: true,
      },
      {
        name: 'is_revision',
        type: 'boolean',
        description: 'Whether this revises previous thinking',
        required: false,
      },
      {
        name: 'revises_thought',
        type: 'number',
        description: 'Which thought is being reconsidered. Minimum value is 1.',
        required: false,
      },
      {
        name: 'branch_from_thought',
        type: 'number',
        description: 'Branching point thought number. Minimum value is 1.',
        required: false,
      },
      {
        name: 'branch_id',
        type: 'string',
        description: 'Branch identifier',
        required: false,
      },
      {
        name: 'needs_more_thoughts',
        type: 'boolean',
        description: 'If more thoughts are needed',
        required: false,
      },
    ];
  }

  private validateThoughtData(args: Record<string, unknown>): ThoughtData {
    if (!args.thought || typeof args.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }

    if (typeof args.thought_number !== 'number') {
      throw new Error('Invalid thought_number: must be a number');
    }

    if (typeof args.total_thoughts !== 'number') {
      throw new Error('Invalid total_thoughts: must be a number');
    }

    if (typeof args.next_thought_needed !== 'boolean') {
      throw new Error('Invalid next_thought_needed: must be a boolean');
    }

    // Validate minimum values
    if (args.thought_number < 1) {
      throw new Error('thought_number must be at least 1');
    }

    if (args.total_thoughts < 1) {
      throw new Error('total_thoughts must be at least 1');
    }

    // Validate optional revision fields
    let revises_thought: number | undefined;
    if (
      args.revises_thought !== undefined &&
      args.revises_thought !== null &&
      args.revises_thought !== 0
    ) {
      if (typeof args.revises_thought !== 'number' || args.revises_thought < 1) {
        throw new Error('revises_thought must be a positive number');
      }
      revises_thought = args.revises_thought;
    }

    let branch_from_thought: number | undefined;
    if (
      args.branch_from_thought !== undefined &&
      args.branch_from_thought !== null &&
      args.branch_from_thought !== 0
    ) {
      if (
        typeof args.branch_from_thought !== 'number' ||
        args.branch_from_thought < 1
      ) {
        throw new Error('branch_from_thought must be a positive number');
      }
      branch_from_thought = args.branch_from_thought;
    }

    return {
      thought: args.thought,
      thought_number: args.thought_number,
      total_thoughts: args.total_thoughts,
      next_thought_needed: args.next_thought_needed,
      is_revision: typeof args.is_revision === 'boolean' ? args.is_revision : undefined,
      revises_thought,
      branch_from_thought,
      branch_id: typeof args.branch_id === 'string' ? args.branch_id : undefined,
      needs_more_thoughts: typeof args.needs_more_thoughts === 'boolean' ? args.needs_more_thoughts : undefined,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    let prefix = '';
    let context = '';

    if (thoughtData.is_revision) {
      prefix = '🔄 Revision';
      context = ` (revising thought ${thoughtData.revises_thought})`;
    } else if (thoughtData.branch_from_thought) {
      prefix = '🌿 Branch';
      context = ` (from thought ${thoughtData.branch_from_thought}, ID: ${thoughtData.branch_id})`;
    } else {
      prefix = '💭 Thought';
      context = '';
    }

    const header = `${prefix} ${thoughtData.thought_number}/${thoughtData.total_thoughts}${context}`;
    const borderLength = Math.max(header.length, thoughtData.thought.length) + 4;
    const border = '─'.repeat(borderLength);

    return `
┌${border}┐
│ ${header.padEnd(borderLength - 2)} │
├${border}┤
│ ${thoughtData.thought.padEnd(borderLength - 2)} │
└${border}┘`;
  }

  async execute(args: ToolCallArguments): Promise<ToolExecResult> {
    try {
      // Validate and extract thought data
      const validatedInput = this.validateThoughtData(args);

      // Adjust total thoughts if current thought number exceeds it
      if (validatedInput.thought_number > validatedInput.total_thoughts) {
        validatedInput.total_thoughts = validatedInput.thought_number;
      }

      // Add to thought history
      this.thoughtHistory.push(validatedInput);

      // Handle branching
      if (validatedInput.branch_from_thought && validatedInput.branch_id) {
        if (!this.branches[validatedInput.branch_id]) {
          this.branches[validatedInput.branch_id] = [];
        }
        this.branches[validatedInput.branch_id].push(validatedInput);
      }

      // Prepare response
      const responseData = {
        thought_number: validatedInput.thought_number,
        total_thoughts: validatedInput.total_thoughts,
        next_thought_needed: validatedInput.next_thought_needed,
        branches: Object.keys(this.branches),
        thought_history_length: this.thoughtHistory.length,
      };

      return {
        output: `Sequential thinking step completed.\n\nStatus:\n${JSON.stringify(responseData, null, 2)}`,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorData = { error: errorMessage, status: 'failed' };
      return {
        output: undefined,
        error: `Sequential thinking failed: ${errorMessage}\n\nDetails:\n${JSON.stringify(errorData, null, 2)}`,
        errorCode: -1,
      };
    }
  }
}
