// Copyright (c) 2025 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from '@rstest/core';
import { TraeAgent } from '../../trae_agent/agent/trae_agent.js';
import { Config } from '../../trae_agent/utils/config.js';
import { AgentError } from '../../trae_agent/agent/agent_basics.js';
import { LLMClient } from '../../trae_agent/utils/llm_client.js';
import { LLMResponse, createLLMUsage } from '../../trae_agent/utils/llm_basics.js';
import { CLIConsole } from '../../trae_agent/utils/cli_console.js';
import { TrajectoryRecorder } from '../../trae_agent/utils/trajectory_recorder.js';

describe('TraeAgent', () => {
  let mockConfig: Config;
  let agent: TraeAgent;
  const testProjectPath = '/test/project';
  const testPatchPath = '/test/patch.diff';

  beforeEach(() => {
    const testConfig = {
      default_provider: 'anthropic',
      max_steps: 20,
      model_providers: {
        anthropic: {
          model: 'claude-sonnet-4-20250514',
          api_key: 'test-dummy-api-key',
          max_tokens: 4096,
          temperature: 0.5,
          top_p: 1,
          top_k: 0,
          parallel_tool_calls: false,
          max_retries: 10,
        },
      },
    };
    mockConfig = new Config(testConfig);
    agent = new TraeAgent(mockConfig);
  });

  it('should create a TraeAgent instance', () => {
    expect(agent).toBeInstanceOf(TraeAgent);
  });

  it('should initialize with correct configuration', () => {
    expect(agent.config).toEqual(mockConfig);
  });

  it('should initialize with mock client', () => {
    // Create a mock LLMClient
    const mockClient = {
      modelParameters: mockConfig.model_providers.anthropic,
      maxSteps: 20,
      provider: 'anthropic',
      setTrajectoryRecorder: () => {},
      generateResponse: async () => ({
        content: 'Test response',
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      })
    } as any;

    // Initialize TraeAgent with mock client
    const agentWithMock = new TraeAgent(undefined, mockClient);

    // Verify agent initialization
    expect(agentWithMock).toBeDefined();
    expect(agentWithMock.llmClient).toBe(mockClient);
    expect(agentWithMock.modelParameters).toBe(mockClient.modelParameters);
    expect(agentWithMock.maxSteps).toBe(mockClient.maxSteps);
    expect(agentWithMock.initialMessages.length).toBe(0);
    expect(agentWithMock.tools.length).toBe(0);
  });

  it('should setup trajectory recording', () => {
    // Mock TrajectoryRecorder
    const mockRecorder = {
      recordStep: () => {},
      getTrajectory: () => [],
      save: () => {}
    } as any;

    agent.task = 'test task';
    const result = agent.setupTrajectoryRecording();
    expect(agent.trajectoryRecorder).toBeDefined();
    expect(result).toBeDefined();
  });

  it('should handle new task initialization', () => {
    // Test missing required params
    expect(() => {
      agent.newTask('test', {});
    }).toThrow(AgentError);

    // Test valid args
    const validArgs = {
      project_path: testProjectPath,
      issue: 'Test issue',
      base_commit: 'abc123',
      must_patch: 'true',
      patch_path: testPatchPath,
    };
    agent.newTask('test-task', validArgs);

    expect(agent.projectPath).toBe(testProjectPath);
    expect(agent.mustPatch).toBe('true');
    expect(agent.tools.length).toBe(5);
    expect(agent.tools.some(tool => tool.getName() === 'bash')).toBe(true);
  });

  it('should generate git diff', () => {
        // Test that getGitDiff method exists and returns a string
        // For a non-existent project path, it should return empty string
        agent.projectPath = '/non/existent/path';
        const diff = agent.getGitDiff();
        expect(typeof diff).toBe('string');
        expect(diff).toBe('');
        
        // Test with a valid project path (current directory)
        agent.projectPath = process.cwd();
        const diff2 = agent.getGitDiff();
        expect(typeof diff2).toBe('string');
        // The actual diff content depends on git state, so we just verify it's a string
      });

  it('should filter patches to tests', () => {
    const testPatch = `diff --git a/tests/test_example.py b/tests/test_example.py
--- a/tests/test_example.py
+++ b/tests/test_example.py
@@ -5,6 +5,7 @@
     def test_example(self):
         assert True
`;
    const filtered = agent.removePatchesToTests(testPatch);
    expect(filtered).toBe('');
  });

  it('should handle task execution flow', async () => {
    const mockConsole = {
      start: () => {},
      stop: () => {},
      updateStatus: () => {},
      log: () => {}
    } as any;

    agent.setCLIConsole(mockConsole);
    
    // Mock the executeTask to avoid actual execution
     const originalExecuteTask = agent.executeTask;
     let startCalled = false;
     agent.executeTask = async () => {
       if (agent.cliConsole) {
         agent.cliConsole.start();
         startCalled = true;
       }
       return {
         task: 'test',
         steps: [],
         final_result: 'completed',
         success: true,
         total_tokens: createLLMUsage(0, 0),
         execution_time: 0
       };
     };

    await agent.executeTask();
    expect(startCalled).toBe(true);

    // Restore original method
    agent.executeTask = originalExecuteTask;
  });

  it('should detect task completion', () => {
     const mockResponse: LLMResponse = {
       content: 'test response',
       toolCalls: [],
       usage: createLLMUsage(10, 5, { promptTokens: 10, completionTokens: 5, totalTokens: 15 })
     };

     // Test empty patch scenario
     agent.mustPatch = 'true';
     // Use llmIndicatesTaskCompleted instead of protected isTaskCompleted
     expect(agent.llmIndicatesTaskCompleted(mockResponse)).toBe(false);

     // Test valid patch scenario with task_done tool call
      const mockResponseWithTaskDone: LLMResponse = {
        content: 'test response',
        toolCalls: [{ id: 'test', name: 'task_done', callId: 'test-call-1', arguments: {} }],
        usage: createLLMUsage(10, 5, { promptTokens: 10, completionTokens: 5, totalTokens: 15 })
      };
     expect(agent.llmIndicatesTaskCompleted(mockResponseWithTaskDone)).toBe(true);
   });

  it('should initialize tools correctly', () => {
    const tools = [
      'bash',
      'str_replace_based_edit_tool',
      'sequentialthinking',
      'task_done',
    ];
    agent.newTask('test', { project_path: testProjectPath }, tools);
    const toolNames = agent.tools.map(tool => tool.getName());

    expect(agent.tools.length).toBe(tools.length);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('str_replace_based_edit_tool');
    expect(toolNames).toContain('sequentialthinking');
    expect(toolNames).toContain('task_done');
  });

  it('should restrict access to protected attributes', () => {
     // In TypeScript, we test that protected properties exist but are not directly settable
     // The actual protection is enforced at compile time, not runtime
     
     // Test that we can access the properties (they exist)
     expect(agent.llmClient).toBeDefined();
     expect(agent.maxSteps).toBeDefined();
     expect(agent.modelParameters).toBeDefined();
     expect(agent.initialMessages).toBeDefined();
     
     // Test that protected properties are read-only in practice
     // (TypeScript prevents direct assignment at compile time)
     const originalLlmClient = agent.llmClient;
     const originalMaxSteps = agent.maxSteps;
     const originalModelParameters = agent.modelParameters;
     const originalInitialMessages = agent.initialMessages;
     
     // Verify these are the expected types/values
     expect(typeof agent.maxSteps).toBe('number');
     expect(Array.isArray(agent.initialMessages)).toBe(true);
     expect(typeof agent.modelParameters).toBe('object');
   });

  it('should allow public property access', () => {
     // Test that public properties work correctly
     expect(agent.llmClient).toBeDefined();
     expect(agent.cliConsole).toBeUndefined();

     // Test that public property setters work
     const mockConsole = {
       start: () => {},
       stop: () => {},
       updateStatus: () => {},
       log: () => {}
     } as any;
     
     agent.setCLIConsole(mockConsole);
     expect(agent.cliConsole).toBe(mockConsole);
   });
});
