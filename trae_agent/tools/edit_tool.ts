// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * File editing tool for reading, writing, and modifying files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolExecResult, ToolParameter, ToolCallArguments } from './base.js';

// Constants for output formatting
const SNIPPET_LINES: number = 4;
const TRUNCATED_MESSAGE: string = '<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>';
const MAX_RESPONSE_LEN: number = 16000;

/**
 * Tool for file editing operations.
 */
export class TextEditorTool extends Tool {
  private _maxFileSize: number;

  constructor(maxFileSize: number = 1024 * 1024) {
    // 1MB default
    super();
    this._maxFileSize = maxFileSize;
  }

  /**
   * Truncate content and append a notice if content exceeds the specified length.
   */
  private maybeTruncate(content: string, truncateAfter: number = MAX_RESPONSE_LEN): string {
    if (truncateAfter && content.length > truncateAfter) {
      return content.slice(0, truncateAfter) + TRUNCATED_MESSAGE;
    }
    return content;
  }

  get name(): string {
    return this.getName();
  }

  get description(): string {
    return this.getDescription();
  }

  validatePath(command: string, filePath: string): void {
    if (!path.isAbsolute(filePath)) {
      const suggestedPath = path.join('/', filePath);
      throw new Error(
        `The path ${filePath} is not an absolute path, it should start with '/'. Maybe you meant ${suggestedPath}?`
      );
    }
    
    // Check if path exists
    if (!fs.existsSync(filePath) && command !== 'create') {
      throw new Error(`The path ${filePath} does not exist. Please provide a valid path.`);
    }
    
    if (fs.existsSync(filePath) && command === 'create') {
      throw new Error(
        `File already exists at: ${filePath}. Cannot overwrite files using command 'create'.`
      );
    }
    
    // Check if the path points to a directory
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory() && command !== 'view') {
      throw new Error(
        `The path ${filePath} is a directory and only the 'view' command can be used on directories`
      );
    }
  }



  getName(): string {
    return 'str_replace_based_edit_tool';
  }

  getDescription(): string {
    return `Custom editing tool for viewing, creating and editing files
* State is persistent across command calls and discussions with the user
* If \`path\` is a file, \`view\` displays the result of applying \`cat -n\`. If \`path\` is a directory, \`view\` lists non-hidden files and directories up to 2 levels deep
* The \`create\` command cannot be used if the specified \`path\` already exists as a file !!! If you know that the \`path\` already exists, please remove it first and then perform the \`create\` operation!
* If a \`command\` generates a long output, it will be truncated and marked with \`<response clipped>\`

Notes for using the \`str_replace\` command:
* The \`old_str\` parameter should match EXACTLY one or more consecutive lines from the original file. Be mindful of whitespaces!
* If the \`old_str\` parameter is not unique in the file, the replacement will not be performed. Make sure to include enough context in \`old_str\` to make it unique
* The \`new_str\` parameter should contain the edited lines that should replace the \`old_str\``;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'command',
        type: 'string',
        description: 'The commands to run. Allowed options are: view, create, str_replace, insert.',
        required: true,
        enum: ['view', 'create', 'str_replace', 'insert'],
      },
      {
        name: 'path',
        type: 'string',
        description: 'Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`.',
        required: true,
      },
      {
        name: 'file_text',
        type: 'string',
        description: 'Required parameter of `create` command, with the content of the file to be created.',
        required: false,
      },
      {
        name: 'old_str',
        type: 'string',
        description: 'Required parameter of `str_replace` command containing the string in `path` to replace.',
        required: false,
      },
      {
        name: 'new_str',
        type: 'string',
        description: 'Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert.',
        required: false,
      },
      {
        name: 'insert_line',
        type: 'number',
        description: 'Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`.',
        required: false,
      },
      {
        name: 'view_range',
        type: 'array',
        description: 'Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.',
        required: false,
      },
    ];
  }

  async execute(args: ToolCallArguments): Promise<ToolExecResult> {
    // Support both parameter formats for backward compatibility
    const command = String(args.command || args.action);
    const filePath = String(args.path || args.file_path);
    
    if (!command) {
      return {
        output: undefined,
        error: `No command provided for the ${this.getName()} tool`,
        errorCode: -1,
      };
    }
    
    if (!filePath) {
      return {
        output: undefined,
        error: `No path provided for the ${this.getName()} tool`,
        errorCode: -1,
      };
    }

    try {
      this.validatePath(command, filePath);
      
      switch (command) {
        case 'view':
          const viewRange = Array.isArray(args.view_range) ? args.view_range as number[] : undefined;
          return await this.view(filePath, viewRange);
        case 'create':
          const fileText = String(args.file_text || '');
          return await this.create(filePath, fileText);
        case 'str_replace':
        case 'replace':
          const oldStr = args.old_str || args.search_text;
          const newStr = args.new_str || args.replace_text;
          if (oldStr === undefined) {
            return {
              output: undefined,
              error: 'Missing required parameter: search_text or old_str',
              errorCode: -1,
            };
          }
          if (newStr === undefined) {
            return {
              output: undefined,
              error: 'Missing required parameter: replace_text or new_str',
              errorCode: -1,
            };
          }
          return await this.strReplace(filePath, String(oldStr), String(newStr));
        case 'insert':
          const insertLine = typeof args.insert_line === 'number' ? args.insert_line : 0;
          const insertStr = String(args.new_str || '');
          return await this.insert(filePath, insertLine, insertStr);
        default:
          return {
            output: undefined,
            error: `Unrecognized command ${command}. The allowed commands for the ${this.getName()} tool are: view, create, str_replace, insert`,
            errorCode: -1,
          };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: errorMessage,
        errorCode: -1,
      };
    }
  }

  async view(filePath: string, viewRange?: number[]): Promise<ToolExecResult> {
    if (fs.statSync(filePath).isDirectory()) {
      if (viewRange) {
        return {
          output: undefined,
          error: 'The `view_range` parameter is not allowed when `path` points to a directory.',
          errorCode: -1,
        };
      }
      
      try {
        const { execSync } = require('child_process');
        const stdout = execSync(`find ${filePath} -maxdepth 2 -not -path '*/\.*'`, { encoding: 'utf-8' });
        const output = `Here's the files and directories up to 2 levels deep in ${filePath}, excluding hidden items:\n${stdout}\n`;
        return {
          output: output,
          error: undefined,
          errorCode: 0,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          output: undefined,
          error: errorMessage,
          errorCode: -1,
        };
      }
    }

    // Expand tabs to spaces (8 spaces per tab) to match Python behavior
    let fileContent = this.readFile(filePath).replace(/\t/g, '        ');
    let initLine = 1;
    
    if (viewRange) {
      if (viewRange.length !== 2 || !viewRange.every(i => typeof i === 'number')) {
        return {
          output: undefined,
          error: 'Invalid `view_range`. It should be a list of two integers.',
          errorCode: -1,
        };
      }
      
      const fileLines = fileContent.split('\n');
      const nLinesFile = fileLines.length;
      const [startLine, finalLine] = viewRange;
      
      if (startLine < 1 || startLine > nLinesFile) {
        return {
          output: undefined,
          error: `Invalid \`view_range\`: ${viewRange}. Its first element \`${startLine}\` should be within the range of lines of the file: [1, ${nLinesFile}]`,
          errorCode: -1,
        };
      }
      
      if (finalLine > nLinesFile) {
        return {
          output: undefined,
          error: `Invalid \`view_range\`: ${viewRange}. Its second element \`${finalLine}\` should be smaller than the number of lines in the file: \`${nLinesFile}\``,
          errorCode: -1,
        };
      }
      
      if (finalLine !== -1 && finalLine < startLine) {
        return {
          output: undefined,
          error: `Invalid \`view_range\`: ${viewRange}. Its second element \`${finalLine}\` should be larger or equal than its first \`${startLine}\``,
          errorCode: -1,
        };
      }
      
      initLine = startLine;
      if (finalLine === -1) {
        fileContent = fileLines.slice(startLine - 1).join('\n');
      } else {
        fileContent = fileLines.slice(startLine - 1, finalLine).join('\n');
      }
    }

    return {
      output: this._makeOutput(fileContent, filePath, initLine),
      error: undefined,
      errorCode: 0,
    };
  }

  private readFile(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read file: ${errorMessage}`);
    }
  }

  private _makeOutput(content: string, fileDescriptor: string, initLine: number = 1, expandTabs: boolean = true): string {
    // Apply truncation first
    let processedContent = this.maybeTruncate(content);
    
    // Expand tabs if requested (matches Python's expandtabs())
    if (expandTabs) {
      processedContent = processedContent.replace(/\t/g, '        ');
    }
    
    const lines = processedContent.split('\n');
    const numberedLines = lines.map((line, index) => {
      const lineNumber = initLine + index;
      return `${lineNumber.toString().padStart(6)}\t${line}`;
    });
    return `Here's the result of running \`cat -n\` on ${fileDescriptor}:\n${numberedLines.join('\n')}\n`;
  }

  async create(filePath: string, fileText: string): Promise<ToolExecResult> {
    if (fs.existsSync(filePath)) {
      return {
        output: undefined,
        error: `File ${filePath} already exists. Use str_replace to edit it.`,
        errorCode: -1,
      };
    }

    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, fileText, 'utf-8');

      return {
        output: `File created successfully at ${filePath}`,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to create file: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }

  async strReplace(filePath: string, oldStr: string, newStr: string): Promise<ToolExecResult> {
    if (!fs.existsSync(filePath)) {
      return {
        output: undefined,
        error: `File ${filePath} not found. Use the create command to create it first.`,
        errorCode: -1,
      };
    }

    try {
      // Expand tabs to spaces (8 spaces per tab) to match Python behavior
      const originalFileContent = this.readFile(filePath).replace(/\t/g, '        ');
      const expandedOldStr = oldStr.replace(/\t/g, '        ');
      const expandedNewStr = newStr.replace(/\t/g, '        ');
      
      if (!originalFileContent.includes(expandedOldStr)) {
        return {
          output: undefined,
          error: `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${filePath}.`,
          errorCode: -1,
        };
      }

      const occurrences = (originalFileContent.match(new RegExp(expandedOldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (occurrences > 1) {
        // Find line numbers where old_str appears for better error reporting
        const fileContentLines = originalFileContent.split('\n');
        const lines = fileContentLines
          .map((line, idx) => expandedOldStr.split('\n').every(oldLine => line.includes(oldLine)) ? idx + 1 : null)
          .filter(line => line !== null);
        
        return {
          output: undefined,
          error: `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` in lines ${JSON.stringify(lines)}. Please ensure it is unique`,
          errorCode: -1,
        };
      }

      const newFileContent = originalFileContent.replace(expandedOldStr, expandedNewStr);
      fs.writeFileSync(filePath, newFileContent, 'utf-8');

      // Create a snippet of the edited section
      const replacementLine = originalFileContent.split(expandedOldStr)[0].split('\n').length - 1;
      const startLine = Math.max(0, replacementLine - SNIPPET_LINES);
      const endLine = replacementLine + SNIPPET_LINES + expandedNewStr.split('\n').length - 1;
      const snippet = newFileContent.split('\n').slice(startLine, endLine + 1).join('\n');

      // Prepare the success message
      let successMsg = `The file ${filePath} has been edited. `;
      successMsg += this._makeOutput(snippet, `a snippet of ${filePath}`, startLine + 1);
      successMsg += 'Review the changes and make sure they are as expected. Edit the file again if necessary.';

      return {
        output: successMsg,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to perform string replacement: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }

  async insert(filePath: string, insertLine: number, newStr: string): Promise<ToolExecResult> {
    if (!fs.existsSync(filePath)) {
      return {
        output: undefined,
        error: `File ${filePath} not found. Use the create command to create it first.`,
        errorCode: -1,
      };
    }

    try {
      // Expand tabs to spaces (8 spaces per tab) to match Python behavior
      const originalFileContent = this.readFile(filePath).replace(/\t/g, '        ');
      const expandedNewStr = newStr.replace(/\t/g, '        ');
      const fileLines = originalFileContent.split('\n');
      const nLinesFile = fileLines.length;

      if (insertLine < 0 || insertLine > nLinesFile) {
        return {
          output: undefined,
          error: `Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${nLinesFile}]`,
          errorCode: -1,
        };
      }

      // Handle multi-line insertion properly by splitting newStr into separate lines
      const newStrLines = expandedNewStr.split('\n');
      const newFileTextLines = [
        ...fileLines.slice(0, insertLine),
        ...newStrLines,
        ...fileLines.slice(insertLine)
      ];
      
      // Create snippet showing context around the insertion
      const snippetLines = [
        ...fileLines.slice(Math.max(0, insertLine - SNIPPET_LINES), insertLine),
        ...newStrLines,
        ...fileLines.slice(insertLine, insertLine + SNIPPET_LINES)
      ];

      const newFileContent = newFileTextLines.join('\n');
      const snippet = snippetLines.join('\n');

      fs.writeFileSync(filePath, newFileContent, 'utf-8');

      // Prepare the success message
      let successMsg = `The file ${filePath} has been edited. `;
      successMsg += this._makeOutput(
        snippet,
        'a snippet of the edited file',
        Math.max(1, insertLine - SNIPPET_LINES + 1)
      );
      successMsg += 'Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). Edit the file again if necessary.';

      return {
        output: successMsg,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to insert text: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }

  private async _appendFile(
    filePath: string,
    content: string
  ): Promise<ToolExecResult> {
    try {
      fs.appendFileSync(filePath, content, 'utf-8');

      return {
        output: `Content appended successfully to: ${filePath}`,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to append to file: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }

  private async _replaceInFile(
    filePath: string,
    searchText: string,
    replaceText: string
  ): Promise<ToolExecResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          output: undefined,
          error: `File does not exist: ${filePath}`,
          errorCode: -1,
        };
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const originalContent = content;

      // Use literal string replacement instead of regex to handle special characters
      content = content.split(searchText).join(replaceText);

      if (content === originalContent) {
        return {
          output: `No matches found for search text: ${searchText}`,
          error: undefined,
          errorCode: 0,
        };
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        output: `Text replaced successfully in: ${filePath}`,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to replace text in file: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }

  private async _deleteFile(filePath: string): Promise<ToolExecResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          output: undefined,
          error: `File does not exist: ${filePath}`,
          errorCode: -1,
        };
      }

      fs.unlinkSync(filePath);

      return {
        output: `File deleted successfully: ${filePath}`,
        error: undefined,
        errorCode: 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: undefined,
        error: `Failed to delete file: ${errorMessage}`,
        errorCode: -1,
      };
    }
  }
}
