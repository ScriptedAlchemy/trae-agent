import { describe, it, expect, beforeEach, afterEach } from '@rstest/core';
import { TextEditorTool } from '../../trae_agent/tools/edit_tool';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('EditTool', () => {
  let editTool: TextEditorTool;
  let testFilePath: string;
  let testContent: string;

  beforeEach(() => {
    editTool = new TextEditorTool();
    testFilePath = join(tmpdir(), `test_edit_${Date.now()}.txt`);
    testContent = `Line 1: Hello World
Line 2: This is a test
Line 3: End of file`;
    writeFileSync(testFilePath, testContent);
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('Basic Edit Operations', () => {
    it('should replace text successfully', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Hello World',
        replace_text: 'Hello Universe'
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('has been edited');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('Hello Universe');
      expect(updatedContent).not.toContain('Hello World');
    });

    it('should handle multiple line replacements', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Line 2: This is a test\nLine 3: End of file',
        replace_text: 'Line 2: This is updated\nLine 3: New ending'
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('This is updated');
      expect(updatedContent).toContain('New ending');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file', async () => {
      const nonExistentPath = join(tmpdir(), 'non_existent_file.txt');
      const result = await editTool.execute({
        action: 'replace',
        file_path: nonExistentPath,
        search_text: 'test',
        replace_text: 'replacement'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('not exist');
    });

    it('should handle text not found in file', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Non-existent text',
        replace_text: 'replacement'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('did not appear verbatim');
    });

    it('should handle missing parameters', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Hello World'
        // Missing replace_text
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toBeTruthy();
    });

    it('should handle missing path', async () => {
      const result = await editTool.execute({
        action: 'replace',
        search_text: 'Hello World',
        replace_text: 'Hello Universe'
        // Missing file_path
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('path');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty replacement', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Line 2: This is a test\n',
        replace_text: ''
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).not.toContain('This is a test');
    });

    it('should handle special characters', async () => {
      const specialContent = 'Line with $pecial ch@racters & symbols!';
      writeFileSync(testFilePath, specialContent);
      
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: '$pecial ch@racters & symbols!',
        replace_text: 'normal characters'
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toBe('Line with normal characters');
    });
  });

  describe('Tool Interface Compliance', () => {
    it('should return proper ToolExecResult structure', async () => {
      const result = await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Hello World',
        replace_text: 'Hello Universe'
      });
      
      expect(result).toHaveProperty('errorCode');
      expect(result).toHaveProperty('output');
      if (result.errorCode !== undefined) {
        expect(typeof result.errorCode).toBe('number');
      }
      if (result.output !== undefined) {
        expect(typeof result.output).toBe('string');
      }
      if (result.error !== undefined) {
        expect(typeof result.error).toBe('string');
      }
    });

    it('should have correct tool name', () => {
      expect(editTool.name).toBe('str_replace_based_edit_tool');
    });

    it('should have description', () => {
      expect(editTool.description).toBeTruthy();
      expect(typeof editTool.description).toBe('string');
    });
  });

  describe('File Integrity', () => {
    it('should preserve file content when replacement fails', async () => {
      const originalContent = readFileSync(testFilePath, 'utf-8');
      
      await editTool.execute({
        action: 'replace',
        file_path: testFilePath,
        search_text: 'Non-existent text',
        replace_text: 'replacement'
      });
      
      const currentContent = readFileSync(testFilePath, 'utf-8');
      expect(currentContent).toBe(originalContent);
    });
  });

  describe('Create Command Testing', () => {
    let newFilePath: string;

    beforeEach(() => {
      newFilePath = join(tmpdir(), `test_create_${Date.now()}.txt`);
    });

    afterEach(() => {
      if (existsSync(newFilePath)) {
        unlinkSync(newFilePath);
      }
    });

    it('should create a new file successfully', async () => {
      const fileContent = 'This is a new file\nWith multiple lines\nEnd of content';
      
      const result = await editTool.execute({
        command: 'create',
        path: newFilePath,
        file_text: fileContent
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('created successfully');
      expect(existsSync(newFilePath)).toBe(true);
      
      const actualContent = readFileSync(newFilePath, 'utf-8');
      expect(actualContent).toBe(fileContent);
    });

    it('should create file with empty content', async () => {
      const result = await editTool.execute({
        command: 'create',
        path: newFilePath,
        file_text: ''
      });
      
      expect(result.errorCode).toBe(0);
      expect(existsSync(newFilePath)).toBe(true);
      
      const actualContent = readFileSync(newFilePath, 'utf-8');
      expect(actualContent).toBe('');
    });

    it('should fail to create file if it already exists', async () => {
      // Create the file first
      writeFileSync(newFilePath, 'existing content');
      
      const result = await editTool.execute({
        command: 'create',
        path: newFilePath,
        file_text: 'new content'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('already exists');
    });

    it('should create directories recursively if needed', async () => {
      const timestamp = Date.now();
      const nestedPath = join(tmpdir(), `nested_${timestamp}`, 'deep', 'file.txt');
      
      const result = await editTool.execute({
        command: 'create',
        path: nestedPath,
        file_text: 'nested file content'
      });
      
      expect(result.errorCode).toBe(0);
      expect(existsSync(nestedPath)).toBe(true);
      
      const actualContent = readFileSync(nestedPath, 'utf-8');
      expect(actualContent).toBe('nested file content');
      
      // Cleanup
      unlinkSync(nestedPath);
      rmdirSync(join(tmpdir(), `nested_${timestamp}`, 'deep'));
      rmdirSync(join(tmpdir(), `nested_${timestamp}`));
    });
  });

  describe('Insert Command Testing', () => {
    it('should insert text at the beginning of file', async () => {
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: 0,
        new_str: 'Inserted at beginning'
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('has been edited');
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent.startsWith('Inserted at beginning\n')).toBe(true);
    });

    it('should insert text at specific line position', async () => {
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: 1,
        new_str: 'Inserted after line 1'
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      const lines = updatedContent.split('\n');
      expect(lines[1]).toBe('Inserted after line 1');
    });

    it('should insert text at end of file', async () => {
      const originalLines = testContent.split('\n');
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: originalLines.length,
        new_str: 'Inserted at end'
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('Inserted at end');
    });

    it('should fail with invalid insert line', async () => {
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: -1,
        new_str: 'Invalid insert'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Invalid `insert_line`');
    });

    it('should fail with insert line beyond file length', async () => {
      const originalLines = testContent.split('\n');
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: originalLines.length + 10,
        new_str: 'Invalid insert'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Invalid `insert_line`');
    });

    it('should fail to insert in non-existent file', async () => {
      const nonExistentPath = join(tmpdir(), 'non_existent_insert.txt');
      const result = await editTool.execute({
        command: 'insert',
        path: nonExistentPath,
        insert_line: 0,
        new_str: 'test'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('View Command Testing', () => {
    it('should view entire file content', async () => {
      const result = await editTool.execute({
        command: 'view',
        path: testFilePath
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('Line 1: Hello World');
      expect(result.output).toContain('Line 2: This is a test');
      expect(result.output).toContain('Line 3: End of file');
      expect(result.output).toMatch(/\s+1\t/); // Check line numbering
    });

    it('should view file with specific line range', async () => {
      const result = await editTool.execute({
        command: 'view',
        path: testFilePath,
        view_range: [2, 3]
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('Line 2: This is a test');
      expect(result.output).toContain('Line 3: End of file');
      expect(result.output).not.toContain('Line 1: Hello World');
    });

    it('should view file from start line to end with -1', async () => {
      const result = await editTool.execute({
        command: 'view',
        path: testFilePath,
        view_range: [2, -1]
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('Line 2: This is a test');
      expect(result.output).toContain('Line 3: End of file');
      expect(result.output).not.toContain('Line 1: Hello World');
    });

    it('should fail with invalid view range', async () => {
      const result = await editTool.execute({
        command: 'view',
        path: testFilePath,
        view_range: [0, 2] // Invalid start line
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Invalid `view_range`');
    });

    it('should fail with view range beyond file length', async () => {
      const result = await editTool.execute({
        command: 'view',
        path: testFilePath,
        view_range: [1, 10] // Beyond file length
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Invalid `view_range`');
    });

    it('should view directory contents', async () => {
      const testDir = join(tmpdir(), `test_dir_${Date.now()}`);
      mkdirSync(testDir);
      
      // Create some test files
      writeFileSync(join(testDir, 'file1.txt'), 'content1');
      writeFileSync(join(testDir, 'file2.txt'), 'content2');
      
      const result = await editTool.execute({
        command: 'view',
        path: testDir
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('files and directories');
      expect(result.output).toContain(testDir);
      
      // Cleanup
      unlinkSync(join(testDir, 'file1.txt'));
      unlinkSync(join(testDir, 'file2.txt'));
      rmdirSync(testDir);
    });

    it('should fail view range on directory', async () => {
      const testDir = join(tmpdir(), `test_dir_range_${Date.now()}`);
      mkdirSync(testDir);
      
      const result = await editTool.execute({
        command: 'view',
        path: testDir,
        view_range: [1, 2]
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('view_range` parameter is not allowed');
      
      // Cleanup
      rmdirSync(testDir);
    });

    it('should fail to view non-existent file', async () => {
      const nonExistentPath = join(tmpdir(), 'non_existent_view.txt');
      const result = await editTool.execute({
        command: 'view',
        path: nonExistentPath
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('Multi-occurrence String Replacement Testing', () => {
    let multiOccurrenceFilePath: string;

    beforeEach(() => {
      multiOccurrenceFilePath = join(tmpdir(), `test_multi_${Date.now()}.txt`);
      const multiContent = `test line one
test line two
test line three
different line
test line four`;
      writeFileSync(multiOccurrenceFilePath, multiContent);
    });

    afterEach(() => {
      if (existsSync(multiOccurrenceFilePath)) {
        unlinkSync(multiOccurrenceFilePath);
      }
    });

    it('should fail to replace when multiple occurrences exist', async () => {
      const result = await editTool.execute({
        command: 'str_replace',
        path: multiOccurrenceFilePath,
        old_str: 'test',
        new_str: 'TEST'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Multiple occurrences');
      expect(result.error).toContain('[1,2,3,5]'); // Should find occurrences on these lines
    });

    it('should successfully replace when made unique with context', async () => {
      const result = await editTool.execute({
        command: 'str_replace',
        path: multiOccurrenceFilePath,
        old_str: 'test line two',
        new_str: 'TEST line two'
      });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('has been edited');
      
      const updatedContent = readFileSync(multiOccurrenceFilePath, 'utf-8');
      expect(updatedContent).toContain('TEST line two');
      expect(updatedContent.split('test').length - 1).toBe(3); // Should have 3 remaining 'test' occurrences
    });

    it('should replace unique multi-line patterns', async () => {
      const result = await editTool.execute({
        command: 'str_replace',
        path: multiOccurrenceFilePath,
        old_str: 'test line three\ndifferent line\ntest line four',
        new_str: 'REPLACED SECTION'
      });
      
      expect(result.errorCode).toBe(0);
      
      const updatedContent = readFileSync(multiOccurrenceFilePath, 'utf-8');
      expect(updatedContent).toContain('REPLACED SECTION');
      expect(updatedContent).not.toContain('different line');
    });

    it('should handle exact match counting correctly', async () => {
      // Add content with exact duplicates
      const exactDuplicateContent = `line one
duplicate text
line three
duplicate text
line five`;
      writeFileSync(multiOccurrenceFilePath, exactDuplicateContent);
      
      const result = await editTool.execute({
        command: 'str_replace',
        path: multiOccurrenceFilePath,
        old_str: 'duplicate text',
        new_str: 'UNIQUE TEXT'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Multiple occurrences');
      expect(result.error).toContain('2'); // Should find exactly 2 occurrences
    });
  });

  describe('Command Parameter Validation', () => {
    it('should fail with missing command', async () => {
      const result = await editTool.execute({
        path: testFilePath,
        old_str: 'test',
        new_str: 'replacement'
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Unrecognized command');
    });

    it('should fail with invalid command', async () => {
      const result = await editTool.execute({
        command: 'invalid_command',
        path: testFilePath
      });
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Unrecognized command');
    });

    it('should fail create command with missing file_text', async () => {
      const newPath = join(tmpdir(), `test_missing_text_${Date.now()}.txt`);
      const result = await editTool.execute({
        command: 'create',
        path: newPath
        // Missing file_text
      });
      
      expect(result.errorCode).toBe(0); // Should succeed with empty content
      expect(existsSync(newPath)).toBe(true);
      
      const content = readFileSync(newPath, 'utf-8');
      expect(content).toBe('');
      
      // Cleanup
      unlinkSync(newPath);
    });

    it('should fail insert command with missing new_str', async () => {
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        insert_line: 1
        // Missing new_str
      });
      
      expect(result.errorCode).toBe(0); // Should succeed with empty string
    });

    it('should fail insert command with missing insert_line', async () => {
      const result = await editTool.execute({
        command: 'insert',
        path: testFilePath,
        new_str: 'test'
        // Missing insert_line - should default to 0
      });
      
      expect(result.errorCode).toBe(0); // Should succeed with default line 0
    });
  });
});