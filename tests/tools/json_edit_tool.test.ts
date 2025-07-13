// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

/**
 * Tests for JSONEditTool.
 */

import * as fs from 'fs';
import { describe, it, expect, beforeEach, rs } from '@rstest/core';
import { JSONEditTool } from '../../trae_agent/tools/json_edit_tool.js';
import { ToolCallArguments } from '../../trae_agent/tools/base.js';

// Mock fs module
rs.mock('fs');

describe('JSONEditTool', () => {
  let tool: JSONEditTool;
  const testFilePath = '/test_dir/test_file.json';
  const sampleData = {
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
    config: { enabled: true },
  };

  beforeEach(() => {
    tool = new JSONEditTool();
    rs.clearAllMocks();
  });

  const mockFileRead = (jsonData = sampleData) => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(jsonData));
  };

  describe('set operation', () => {
    it('should set a simple configuration value', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'set',
        file_path: testFilePath,
        json_path: '$.config.enabled',
        value: false,
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully updated');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should update a user name in a list', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'set',
        file_path: testFilePath,
        json_path: '$.users[0].name',
        value: 'Alicia',
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully updated');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return error for non-existent path', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'set',
        file_path: testFilePath,
        json_path: '$.nonexistent.path',
        value: 'test',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('No matches found');
    });
  });

  describe('add operation', () => {
    it('should add a new user to the list', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'add',
        file_path: testFilePath,
        json_path: '$.users.2',
        value: { id: 3, name: 'Charlie' },
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully added');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should add a new config key', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'add',
        file_path: testFilePath,
        json_path: '$.config.version',
        value: '1.1.0',
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully added');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return error for invalid parent path', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'add',
        file_path: testFilePath,
        json_path: '$.nonexistent.key',
        value: 'test',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('Parent path not found');
    });
  });

  describe('remove operation', () => {
    it('should remove a user by index', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'remove',
        file_path: testFilePath,
        json_path: '$.users.0',
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully removed');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should remove a config key', async () => {
      mockFileRead();
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await tool.execute({
        operation: 'remove',
        file_path: testFilePath,
        json_path: '$.config.enabled',
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('Successfully removed');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return error for non-existent path', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'remove',
        file_path: testFilePath,
        json_path: '$.nonexistent.path',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('No matches found');
    });
  });

  describe('view operation', () => {
    it('should view entire JSON content', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'view',
        file_path: testFilePath,
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('"users"');
      expect(result.output).toContain('"config"');
    });

    it('should view specific JSON path', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'view',
        file_path: testFilePath,
        json_path: '$.users[0]',
      } as ToolCallArguments);

      expect(result.error_code).toBeUndefined();
      expect(result.output).toContain('"id": 1');
      expect(result.output).toContain('"name": "Alice"');
    });

    it('should return message for non-existent path', async () => {
      mockFileRead();

      const result = await tool.execute({
        operation: 'view',
        file_path: testFilePath,
        json_path: '$.nonexistent',
      } as ToolCallArguments);

      expect(result.output).toContain('No matches found');
    });
  });

  describe('error handling', () => {
    it('should return error when file does not exist', async () => {
      (fs.existsSync as any).mockReturnValue(false);

      const result = await tool.execute({
        operation: 'view',
        file_path: '/nonexistent/file.json',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('File does not exist');
    });

    it('should return error for invalid JSON', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('invalid json');

      const result = await tool.execute({
        operation: 'view',
        file_path: testFilePath,
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should return error for missing operation', async () => {
      const result = await tool.execute({
        file_path: testFilePath,
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('Operation parameter is required');
    });

    it('should return error for missing file_path', async () => {
      const result = await tool.execute({
        operation: 'view',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('file_path parameter is required');
    });

    it('should return error for non-absolute path', async () => {
      const result = await tool.execute({
        operation: 'view',
        file_path: 'relative/path.json',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('File path must be absolute');
    });

    it('should return error for missing value in set operation', async () => {
      const result = await tool.execute({
        operation: 'set',
        file_path: testFilePath,
        json_path: '$.test',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain("A 'value' parameter is required");
    });

    it('should return error for missing json_path in set operation', async () => {
      const result = await tool.execute({
        operation: 'set',
        file_path: testFilePath,
        value: 'test',
      } as ToolCallArguments);

      expect(result.error_code).toBe(-1);
      expect(result.error).toContain('json_path parameter is required');
    });
  });

  describe('tool metadata', () => {
    it('should return correct tool name', () => {
      expect(tool.getName()).toBe('json_edit_tool');
    });

    it('should return correct description', () => {
      const description = tool.getDescription();
      expect(description).toContain('JSONPath expressions');
      expect(description).toContain('view, set, add, remove');
    });

    it('should return correct parameters', () => {
      const parameters = tool.getParameters();
      expect(parameters).toHaveLength(5);

      const operationParam = parameters.find(p => p.name === 'operation');
      expect(operationParam).toBeDefined();
      expect(operationParam?.enum).toEqual(['view', 'set', 'add', 'remove']);

      const filePathParam = parameters.find(p => p.name === 'file_path');
      expect(filePathParam).toBeDefined();
      expect(filePathParam?.required).toBe(true);

      const jsonPathParam = parameters.find(p => p.name === 'json_path');
      expect(jsonPathParam).toBeDefined();
      expect(jsonPathParam?.required).toBe(false);

      const valueParam = parameters.find(p => p.name === 'value');
      expect(valueParam).toBeDefined();
      expect(valueParam?.required).toBe(false);

      const prettyPrintParam = parameters.find(p => p.name === 'pretty_print');
      expect(prettyPrintParam).toBeDefined();
      expect(prettyPrintParam?.required).toBe(false);
    });
  });
});
