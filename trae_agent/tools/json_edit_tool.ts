// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * JSON editing tool for structured JSON file modifications.
 */

import * as fs from 'fs';
import * as path from 'path';
import { JSONPath } from 'jsonpath-plus';
import {
  Tool,
  ToolCallArguments,
  ToolError,
  ToolExecResult,
  ToolParameter,
} from './base.js';

/**
 * Tool for editing JSON files using JSONPath expressions.
 */
export class JSONEditTool extends Tool {
  constructor(modelProvider?: string) {
    super({ modelProvider });
  }

  getName(): string {
    return 'json_edit_tool';
  }

  getDescription(): string {
    return `Tool for editing JSON files with JSONPath expressions
* Supports targeted modifications to JSON structures using JSONPath syntax
* Operations: view, set, add, remove
* JSONPath examples: '$.users[0].name', '$.config.database.host', '$.items[*].price'
* Safe JSON parsing and validation with detailed error messages
* Preserves JSON formatting where possible

Operation details:
- \`view\`: Display JSON content or specific paths
- \`set\`: Update existing values at specified paths
- \`add\`: Add new key-value pairs (for objects) or append to arrays
- \`remove\`: Delete elements at specified paths

JSONPath syntax supported:
- \`$\` - root element
- \`.key\` - object property access
- \`[index]\` - array index access
- \`[*]\` - all elements in array/object
- \`..key\` - recursive descent (find key at any level)
- \`[start:end]\` - array slicing`;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'operation',
        type: 'string',
        description: 'The operation to perform on the JSON file.',
        required: true,
        enum: ['view', 'set', 'add', 'remove'],
      },
      {
        name: 'file_path',
        type: 'string',
        description: 'Absolute path to the JSON file to edit.',
        required: true,
      },
      {
        name: 'json_path',
        type: 'string',
        description:
          "JSONPath expression to specify the target location (e.g., '$.users[0].name', '$.config.database'). Required for set, add, and remove operations. Optional for view to show specific paths.",
        required: false,
      },
      {
        name: 'value',
        type: 'object',
        description:
          'The value to set or add. Must be JSON-serializable. Required for set and add operations.',
        required: false,
      },
      {
        name: 'pretty_print',
        type: 'boolean',
        description:
          'Whether to format the JSON output with proper indentation. Defaults to true.',
        required: false,
      },
    ];
  }

  async execute(args: ToolCallArguments): Promise<ToolExecResult> {
    try {
      const operation = String(args.operation || '').toLowerCase();
      if (!operation) {
        return { output: undefined, error: 'Operation parameter is required', error_code: -1 };
      }

      const filePathStr = String(args.file_path || '');
      if (!filePathStr) {
        return { output: undefined, error: 'file_path parameter is required', error_code: -1 };
      }

      // Cross-platform absolute path validation
      // Handle Windows paths (C:\...), Unix paths (/...), and UNC paths (\\server\...)
      const isWindowsAbsolute = /^[a-zA-Z]:[\\\/]/.test(filePathStr);
      const isUnixAbsolute = filePathStr.startsWith('/');
      const isUNCPath = filePathStr.startsWith('\\\\');
      
      if (!path.isAbsolute(filePathStr) && !isWindowsAbsolute && !isUnixAbsolute && !isUNCPath) {
        return {
          output: undefined,
          error: `File path must be absolute: ${filePathStr}`,
          error_code: -1,
        };
      }

      const jsonPathArg = args.json_path;
      if (jsonPathArg !== undefined && typeof jsonPathArg !== 'string') {
        return {
          output: undefined,
          error: 'json_path parameter must be a string.',
          error_code: -1,
        };
      }

      const value = args.value;

      const prettyPrintArg =
        args.pretty_print !== undefined ? args.pretty_print : true;
      if (typeof prettyPrintArg !== 'boolean') {
        return {
          output: undefined,
          error: 'pretty_print parameter must be a boolean.',
          error_code: -1,
        };
      }

      if (operation === 'view') {
        return await this._viewJson(filePathStr, jsonPathArg, prettyPrintArg);
      }

      if (typeof jsonPathArg !== 'string') {
        return {
          output: undefined,
          error: `json_path parameter is required and must be a string for the '${operation}' operation.`,
          error_code: -1,
        };
      }

      if (operation === 'set' || operation === 'add') {
        if (value === undefined) {
          return {
            output: undefined,
            error: `A 'value' parameter is required for the '${operation}' operation.`,
            error_code: -1,
          };
        }
        if (operation === 'set') {
          return await this._setJsonValue(
            filePathStr,
            jsonPathArg,
            value,
            prettyPrintArg
          );
        } else {
          return await this._addJsonValue(
            filePathStr,
            jsonPathArg,
            value,
            prettyPrintArg
          );
        }
      }

      if (operation === 'remove') {
        return await this._removeJsonValue(
          filePathStr,
          jsonPathArg,
          prettyPrintArg
        );
      }

      return {
        output: undefined,
        error: `Unknown operation: ${operation}. Supported operations: view, set, add, remove`,
        error_code: -1,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { output: undefined, error: `JSON edit tool error: ${errorMessage}`, error_code: -1 };
    }
  }

  private async _loadJsonFile(filePath: string): Promise<unknown> {
    if (!fs.existsSync(filePath)) {
      throw new ToolError(`File does not exist: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (!content) {
        throw new ToolError(`File is empty: ${filePath}`);
      }
      return JSON.parse(content);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === 'SyntaxError') {
        throw new ToolError(
          `Invalid JSON in file ${filePath}: ${errorMessage}`
        );
      }
      throw new ToolError(`Error reading file ${filePath}: ${errorMessage}`);
    }
  }

  private async _saveJsonFile(
    filePath: string,
    data: unknown,
    prettyPrint: boolean = true
  ): Promise<void> {
    try {
      const jsonString = prettyPrint
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
      fs.writeFileSync(filePath, jsonString, 'utf-8');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ToolError(
        `Error writing to file ${filePath}: ${errorMessage}`
      );
    }
  }

  private _parseJsonPath(jsonPathStr: string): void {
    try {
      // Validate JSONPath by attempting to parse it
      JSONPath({ path: jsonPathStr, json: {} as any });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ToolError(
        `Invalid JSONPath expression '${jsonPathStr}': ${errorMessage}`
      );
    }
  }


  private async _viewJson(
    filePath: string,
    jsonPathStr: string | undefined,
    prettyPrint: boolean
  ): Promise<ToolExecResult> {
    const data = await this._loadJsonFile(filePath);

    if (jsonPathStr) {
      this._parseJsonPath(jsonPathStr);
      const matches = JSONPath({ path: jsonPathStr, json: data as any });

      if (!matches || matches.length === 0) {
        return { output: `No matches found for JSONPath: ${jsonPathStr}` };
      }

      let resultData = matches;
      if (matches.length === 1) {
        resultData = matches[0];
      }

      const output = prettyPrint
        ? JSON.stringify(resultData, null, 2)
        : JSON.stringify(resultData);

      return { output: `JSONPath '${jsonPathStr}' matches:\n${output}` };
    } else {
      const output = prettyPrint
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);

      return { output: `JSON content of ${filePath}:\n${output}` };
    }
  }

  private async _setJsonValue(
    filePath: string,
    jsonPathStr: string,
    value: unknown,
    prettyPrint: boolean
  ): Promise<ToolExecResult> {
    const data = await this._loadJsonFile(filePath);
    this._parseJsonPath(jsonPathStr);

    // First check if the path exists
    const matches = JSONPath({ path: jsonPathStr, json: data as any });
    if (!matches || matches.length === 0) {
      return {
        output: undefined,
        error: `No matches found for JSONPath: ${jsonPathStr}`,
        error_code: -1,
      };
    }

    // Get the paths as strings and convert them to arrays
    const pathStrings = JSONPath({ 
      path: jsonPathStr, 
      json: data as any, 
      resultType: 'path' 
    });

    let updateCount = 0;
    for (const pathString of pathStrings) {
      // Convert string path to array using JSONPath utility
      const pathArray = JSONPath.toPathArray(pathString);
      
      if (pathArray && pathArray.length > 0) {
        let current: any = data;
        // Navigate to the parent of the target (skip the '$' root)
        for (let i = 1; i < pathArray.length - 1; i++) {
          current = current[pathArray[i]];
        }
        // Set the final property/index
        const finalKey = pathArray[pathArray.length - 1];
        if (current !== null && current !== undefined) {
          current[finalKey] = value;
          updateCount++;
        }
      }
    }

    await this._saveJsonFile(filePath, data, prettyPrint);
    return {
      output: `Successfully updated ${updateCount} location(s) at JSONPath '${jsonPathStr}' with value: ${JSON.stringify(value)}`,
    };
  }

  private async _addJsonValue(
    filePath: string,
    jsonPathStr: string,
    value: unknown,
    prettyPrint: boolean
  ): Promise<ToolExecResult> {
    const data = await this._loadJsonFile(filePath);
    this._parseJsonPath(jsonPathStr);

    // For add operation, we need to handle the case where the target path doesn't exist yet
    // First, let's try to find the parent path and target key from the jsonPath
    
    // Get the path as a string and convert to array to extract parent and target
    const tempPathString = JSONPath({ path: '$', json: data as any, resultType: 'path' })[0];
    let testPathArray: string[];
    try {
      // Try to convert the add path to understand its structure
      testPathArray = JSONPath.toPathArray(jsonPathStr);
    } catch {
      return {
        output: undefined,
        error: 'Add operation requires a valid JSONPath ending in a key or array index (e.g., "$.parent.newKey" or "$.array[0]")',
        error_code: -1,
      };
    }

    if (!testPathArray || testPathArray.length < 2) {
      return {
        output: undefined,
        error: 'Add operation requires a path with at least a parent and target (e.g., "$.parent.newKey")',
        error_code: -1,
      };
    }

    // Extract parent path and target key
    const parentPathArray = testPathArray.slice(0, -1);
    const targetKey = testPathArray[testPathArray.length - 1];
    const parentPath = JSONPath.toPathString(parentPathArray);

    // Find parent matches - equivalent to Python's parent_path.find(data)
    const parentMatches = JSONPath({ path: parentPath, json: data as any });
    if (!parentMatches || parentMatches.length === 0) {
      return {
        output: undefined,
        error: `Parent path not found: ${parentPath}`,
        error_code: -1,
      };
    }

    // Add to each parent match - matches Python's behavior
    for (const parentObj of parentMatches) {
      const isArrayIndex = /^\d+$/.test(targetKey);
      
      if (isArrayIndex) {
        // Handle array insertion - equivalent to Python's Index handling
        if (!Array.isArray(parentObj)) {
          return {
            output: undefined,
            error: `Cannot add element to non-array at path: ${parentPath}`,
            error_code: -1,
          };
        }
        // Insert at specific index (like Python's insert)
        const index = parseInt(targetKey, 10);
        parentObj.splice(index, 0, value);
      } else {
        // Handle object key addition - equivalent to Python's Fields handling
        if (typeof parentObj !== 'object' || parentObj === null || Array.isArray(parentObj)) {
          return {
            output: undefined,
            error: `Cannot add key to non-object at path: ${parentPath}`,
            error_code: -1,
          };
        }
        // Add new key-value pair
        parentObj[targetKey] = value;
      }
    }

    await this._saveJsonFile(filePath, data, prettyPrint);
    return { output: `Successfully added value at JSONPath '${jsonPathStr}'` };
  }

  private async _removeJsonValue(
    filePath: string,
    jsonPathStr: string,
    prettyPrint: boolean
  ): Promise<ToolExecResult> {
    const data = await this._loadJsonFile(filePath);
    this._parseJsonPath(jsonPathStr);

    // Find all matches first - equivalent to Python's jsonpath_expr.find(data)
    const matches = JSONPath({ path: jsonPathStr, json: data as any });
    if (!matches || matches.length === 0) {
      return {
        output: undefined,
        error: `No matches found for JSONPath: ${jsonPathStr}`,
        error_code: -1,
      };
    }

    const matchCount = matches.length;

    // Get the paths to remove as strings and convert to arrays
    const pathStringsToRemove = JSONPath({ 
      path: jsonPathStr, 
      json: data as any, 
      resultType: 'path' 
    });

    // Remove in reverse order to avoid index shifting issues
    // This matches Python's reversed(matches) approach
    pathStringsToRemove.reverse();

    for (const pathString of pathStringsToRemove) {
      try {
        // Convert string path to array using JSONPath utility
        const pathArray = JSONPath.toPathArray(pathString);
        if (!pathArray || pathArray.length === 0) continue;

        // Navigate to parent - equivalent to Python's parent_path.find(data)
        let parent: any = data;
        // Skip the '$' root and navigate to parent (pathArray.length - 1)
        for (let i = 1; i < pathArray.length - 1; i++) {
          parent = parent[pathArray[i]];
          if (parent === null || parent === undefined) break;
        }

        if (parent === null || parent === undefined) continue;

        // Remove the final key/index - equivalent to Python's target handling
        const finalKey = pathArray[pathArray.length - 1];
        
        if (Array.isArray(parent)) {
          // Handle array index removal - equivalent to Python's Index handling
          const index = typeof finalKey === 'string' ? parseInt(finalKey, 10) : finalKey;
          if (typeof index === 'number' && index >= -parent.length && index < parent.length) {
            parent.splice(index, 1);
          }
        } else if (typeof parent === 'object' && parent !== null) {
          // Handle object key removal - equivalent to Python's Fields handling
          if (finalKey in parent) {
            delete parent[finalKey];
          }
        }
      } catch (error) {
        // Ignore individual removal errors, continue with other matches
        // This matches Python's try/except (KeyError, IndexError) behavior
      }
    }

    await this._saveJsonFile(filePath, data, prettyPrint);
    return {
      output: `Successfully removed ${matchCount} element(s) at JSONPath '${jsonPathStr}'`,
    };
  }
}
