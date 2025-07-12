import { describe, it, expect, beforeEach } from '@rstest/core';
import { BashTool } from '../../trae_agent/tools/bash_tool';
import { platform } from 'os';

describe('BashTool', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    bashTool = new BashTool();
  });

  describe('Basic Command Execution', () => {
    it('should execute simple echo command', async () => {
      const result = await bashTool.execute({ command: 'echo "Hello World"' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('Hello World');
    });

    it('should execute ls command', async () => {
      const result = await bashTool.execute({ command: 'ls' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toBeTruthy();
    });

    it('should handle pwd command', async () => {
      const result = await bashTool.execute({ command: 'pwd' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toBeTruthy();
      expect(result.output).toContain('/');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid command', async () => {
      const result = await bashTool.execute({ command: 'nonexistentcommand12345' });
      
      expect(result.errorCode).not.toBe(0);
      expect(result.error).toBeTruthy();
    });

    it('should handle missing command parameter', async () => {
      const result = await bashTool.execute({});
      
      expect(result.errorCode).toBe(-1);
      expect(result.error).toContain('Command parameter is required');
    });

    it('should handle empty command', async () => {
      const result = await bashTool.execute({ command: '' });
      
      expect(result.errorCode).not.toBe(0);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Command Output', () => {
    it('should capture stdout', async () => {
      const result = await bashTool.execute({ command: 'echo "test output"' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('test output');
    });

    it('should handle commands with exit codes', async () => {
      const result = await bashTool.execute({ command: 'exit 1' });
      
      expect(result.errorCode).not.toBe(0);
      // Exit code 1 doesn't produce stderr, so error should be undefined/falsy like Python
      expect(result.error).toBeFalsy();
    });
  });

  describe('Tool Interface Compliance', () => {
    it('should return proper ToolExecResult structure', async () => {
      const result = await bashTool.execute({ command: 'echo "test"' });
      
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
      expect(bashTool.name).toBe('bash');
    });

    it('should have description', () => {
      expect(bashTool.description).toBeTruthy();
      expect(typeof bashTool.description).toBe('string');
    });
  });

  describe('Platform Specific', () => {
    it('should work on current platform', async () => {
      const currentPlatform = platform();
      const result = await bashTool.execute({ command: 'echo "Platform test"' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('Platform test');
    });
  });

  describe('Security and Safety', () => {
    it('should handle potentially dangerous commands safely', async () => {
      // Test that the tool doesn't crash on potentially problematic input
      const result = await bashTool.execute({ command: 'echo "$(echo safe)"' });
      
      expect(result.errorCode).toBe(0);
      expect(result.output).toContain('safe');
    });
  });

  describe('Session Management', () => {
    it('should restart bash session when restart parameter is true', async () => {
      // First, set a variable in the current session
      const setResult = await bashTool.execute({ command: 'export TEST_VAR="original_value"' });
      expect(setResult.errorCode).toBe(0);
      
      // Verify the variable exists
      const checkResult = await bashTool.execute({ command: 'echo $TEST_VAR' });
      expect(checkResult.errorCode).toBe(0);
      expect(checkResult.output).toContain('original_value');
      
      // Restart the session
      const restartResult = await bashTool.execute({ restart: true });
      expect(restartResult.errorCode).toBe(0);
      expect(restartResult.output).toBe('tool has been restarted.');
      expect(restartResult.error).toBeUndefined();
      
      // Verify the variable is gone (session state reset)
      const checkAfterRestartResult = await bashTool.execute({ command: 'echo $TEST_VAR' });
      expect(checkAfterRestartResult.errorCode).toBe(0);
      expect(checkAfterRestartResult.output || '').toBe(''); // Empty because TEST_VAR no longer exists
      
      // Verify new session works correctly
      const newSessionResult = await bashTool.execute({ command: 'echo "new session works"' });
      expect(newSessionResult.errorCode).toBe(0);
      expect(newSessionResult.output).toContain('new session works');
    });

    it('should properly manage session object lifecycle on restart', async () => {
      // Execute a command to ensure session is created
      const initialResult = await bashTool.execute({ command: 'echo "initial"' });
      expect(initialResult.errorCode).toBe(0);
      
      // Restart should stop old session and create new one
      const restartResult = await bashTool.execute({ restart: true });
      expect(restartResult.errorCode).toBe(0);
      expect(restartResult.output).toBe('tool has been restarted.');
      
      // New session should be fully functional
      const postRestartResult = await bashTool.execute({ command: 'pwd' });
      expect(postRestartResult.errorCode).toBe(0);
      expect(postRestartResult.output).toBeTruthy();
    });

    it('should handle restart without existing session', async () => {
      // Create a fresh bash tool instance
      const freshBashTool = new BashTool();
      
      // Restart should work even without existing session
      const restartResult = await freshBashTool.execute({ restart: true });
      expect(restartResult.errorCode).toBe(0);
      expect(restartResult.output).toBe('tool has been restarted.');
      
      // Should be able to execute commands after restart
      const commandResult = await freshBashTool.execute({ command: 'echo "restart works"' });
      expect(commandResult.errorCode).toBe(0);
      expect(commandResult.output).toContain('restart works');
    });

    it('should maintain session state across multiple commands', async () => {
      // Set a variable
      const setResult = await bashTool.execute({ command: 'export PERSISTENT_VAR="persistent_value"' });
      expect(setResult.errorCode).toBe(0);
      
      // Change directory
      const cdResult = await bashTool.execute({ command: 'cd /tmp' });
      expect(cdResult.errorCode).toBe(0);
      
      // Verify both variable and directory persist
      const checkVarResult = await bashTool.execute({ command: 'echo $PERSISTENT_VAR' });
      expect(checkVarResult.errorCode).toBe(0);
      expect(checkVarResult.output).toContain('persistent_value');
      
      const checkDirResult = await bashTool.execute({ command: 'pwd' });
      expect(checkDirResult.errorCode).toBe(0);
      expect(checkDirResult.output).toContain('/tmp');
      
      // Restart and verify state is reset
      const restartResult = await bashTool.execute({ restart: true });
      expect(restartResult.errorCode).toBe(0);
      
      // Variable should be gone
      const checkVarAfterResult = await bashTool.execute({ command: 'echo $PERSISTENT_VAR' });
      expect(checkVarAfterResult.errorCode).toBe(0);
      expect(checkVarAfterResult.output || '').toBe('');
      
      // Directory should be reset to default
      const checkDirAfterResult = await bashTool.execute({ command: 'pwd' });
      expect(checkDirAfterResult.errorCode).toBe(0);
      expect(checkDirAfterResult.output).not.toContain('/tmp'); // Should be back to default directory
    });

    it('should handle restart parameter correctly', async () => {
      // Test with restart: false (should not restart)
      const result1 = await bashTool.execute({ command: 'export TEST_RESTART="test"' });
      expect(result1.errorCode).toBe(0);
      
      const result2 = await bashTool.execute({ command: 'echo $TEST_RESTART', restart: false });
      expect(result2.errorCode).toBe(0);
      expect(result2.output).toContain('test'); // Variable should still exist
      
      // Test with restart: true (should restart)
      const restartResult = await bashTool.execute({ restart: true });
      expect(restartResult.errorCode).toBe(0);
      expect(restartResult.output).toBe('tool has been restarted.');
      
      const result3 = await bashTool.execute({ command: 'echo $TEST_RESTART' });
      expect(result3.errorCode).toBe(0);
      expect(result3.output || '').toBe(''); // Variable should be gone
    });
  });
});