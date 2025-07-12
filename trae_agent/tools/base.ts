// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Base classes for tools and tool calling.
 */

/**
 * Base class for tool errors.
 */
export class ToolError extends Error {
  public message: string;

  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
    this.message = message;
  }
}

/**
 * Intermediate result of a tool execution.
 */
export interface ToolExecResult {
  output?: string;
  error?: string;
  error_code?: number;
}

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  call_id: string;
  name: string; // Gemini specific field
  success: boolean;
  result?: string;
  error?: string;
  id?: string; // OpenAI-specific field
}

/**
 * Tool call arguments type.
 */
export type ToolCallArguments = Record<
  string,
  string | number | boolean | object | null | undefined
>;

/**
 * Represents a parsed tool call.
 */
export interface ToolCall {
  name: string;
  call_id: string;
  arguments: ToolCallArguments;
  id?: string;
}

/**
 * Tool parameter definition.
 */
export interface ToolParameter {
  name: string;
  type: string | string[];
  description: string;
  enum?: string[];
  items?: Record<string, unknown>;
  required?: boolean;
}

/**
 * Base class for all tools.
 */
export abstract class Tool {
  protected _modelProvider?: string;
  private _name?: string;
  private _description?: string;
  private _parameters?: ToolParameter[];

  constructor(options?: { modelProvider?: string }) {
    this._modelProvider = options?.modelProvider;
  }

  get modelProvider(): string | undefined {
    return this.getModelProvider();
  }

  get name(): string {
    if (!this._name) {
      this._name = this.getName();
    }
    return this._name;
  }

  get description(): string {
    if (!this._description) {
      this._description = this.getDescription();
    }
    return this._description;
  }

  get parameters(): ToolParameter[] {
    if (!this._parameters) {
      this._parameters = this.getParameters();
    }
    return this._parameters;
  }

  getModelProvider(): string | undefined {
    return this._modelProvider;
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract getParameters(): ToolParameter[];
  abstract execute(args: ToolCallArguments): Promise<ToolExecResult>;

  jsonDefinition(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      parameters: this.getInputSchema(),
    };
  }

  getInputSchema(): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: 'object',
    };

    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const param of this.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[param.name].enum = param.enum;
      }

      if (param.items) {
        properties[param.name].items = param.items;
      }

      if (param.required !== false) {
        required.push(param.name);
      }
    }

    schema.properties = properties;
    if (required.length > 0) {
      schema.required = required;
    }

    // For OpenAI, we need to specify that additional properties are not allowed.
    // For Gemini, this field is not allowed.
    if (this.modelProvider === 'openai') {
      schema.additionalProperties = false;
    }

    return schema;
  }
}

/**
 * Tool executor that manages tool execution.
 */
export class ToolExecutor {
  private _tools: Tool[];
  private _toolMap?: Record<string, Tool>;

  constructor(tools: Tool[]) {
    this._tools = tools;
  }

  get tools(): Record<string, Tool> {
    if (!this._toolMap) {
      this._toolMap = {};
      for (const tool of this._tools) {
        this._toolMap[tool.name] = tool;
      }
    }
    return this._toolMap;
  }

  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    if (!(toolCall.name in this.tools)) {
      return {
        name: toolCall.name,
        success: false,
        error: `Tool '${toolCall.name}' not found. Available tools: ${Object.keys(this.tools).join(', ')}`,
        call_id: toolCall.call_id,
        id: toolCall.id,
      };
    }

    const tool = this.tools[toolCall.name];

    try {
      const toolExecResult = await tool.execute(toolCall.arguments);
      return {
        name: toolCall.name,
        success: (toolExecResult.error_code || 0) === 0,
        result: toolExecResult.output,
        error: toolExecResult.error,
        call_id: toolCall.call_id,
        id: toolCall.id,
      };
    } catch (error) {
      return {
        name: toolCall.name,
        success: false,
        error: `Error executing tool '${toolCall.name}': ${error instanceof Error ? error.message : String(error)}`,
        call_id: toolCall.call_id,
        id: toolCall.id,
      };
    }
  }

  async parallelToolCall(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map(call => this.executeToolCall(call)));
  }

  async sequentialToolCall(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      results.push(await this.executeToolCall(call));
    }
    return results;
  }
}

/**
 * Helper function to create a ToolExecResult.
 */
export function createToolExecResult(
  output?: string,
  error?: string,
  error_code: number = 0
): ToolExecResult {
  return {
    output,
    error,
    error_code,
  };
}

/**
 * Helper function to create a ToolResult.
 */
export function createToolResult(
  call_id: string,
  name: string,
  success: boolean,
  result?: string,
  error?: string,
  id?: string
): ToolResult {
  return {
    call_id,
    name,
    success,
    result,
    error,
    id,
  };
}

/**
 * Helper function to create a ToolCall.
 */
export function createToolCall(
  name: string,
  call_id: string,
  args: ToolCallArguments = {},
  id?: string
): ToolCall {
  return {
    name,
    call_id,
    arguments: args,
    id,
  };
}

/**
 * Helper function to create a ToolParameter.
 */
export function createToolParameter(
  name: string,
  type: string | string[],
  description: string,
  options?: {
    enum?: string[];
    items?: Record<string, unknown>;
    required?: boolean;
  }
): ToolParameter {
  return {
    name,
    type,
    description,
    enum: options?.enum,
    items: options?.items,
    required: options?.required !== false,
  };
}
