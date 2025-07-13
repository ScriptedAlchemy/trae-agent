import { describe, it, expect, beforeEach, afterEach, mock } from '@rstest/core';
import { AnthropicClient } from '../../trae_agent/utils/anthropic_client';
import { ModelParameters, LLMMessage, ToolCall, ToolResult } from '../../trae_agent/utils/llm_basics';
import { Tool } from '../../trae_agent/tools/base';
import Anthropic from '@anthropic-ai/sdk';

// Mock the Anthropic SDK
mock.module('@anthropic-ai/sdk', () => {
  const mockCreate = mock.fn();
  const MockAnthropic = mock.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));
  
  // Add the required types
  MockAnthropic.MessageParam = class {};
  MockAnthropic.ToolUseBlockParam = class {};
  MockAnthropic.ToolResultBlockParam = class {};
  
  return { default: MockAnthropic };
});

describe('AnthropicClient', () => {
  let client: AnthropicClient;
  let modelParameters: ModelParameters;
  let mockAnthropicInstance: any;
  let mockCreate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    modelParameters = {
      model: 'claude-3-sonnet-20240229',
      temperature: 0.7,
      max_tokens: 1000,
      api_key: 'test-api-key',
    };

    // Get the mocked instance
    const AnthropicMock = vi.mocked(Anthropic);
    mockAnthropicInstance = new AnthropicMock({ apiKey: 'test-api-key' });
    mockCreate = mockAnthropicInstance.messages.create;
    
    client = new AnthropicClient(modelParameters);
  });

  describe('Tool Call Message Flow', () => {
    it('should properly format tool use and tool result messages', async () => {
      // Mock a response with a tool call
      const toolCallResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'test_tool',
            input: { arg1: 'value1' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockCreate.mockResolvedValueOnce(toolCallResponse);

      // Create a mock tool
      const mockTool: Tool = {
        getName: () => 'test_tool',
        getDescription: () => 'A test tool',
        getParameters: () => [
          {
            name: 'arg1',
            type: 'string',
            description: 'Test argument',
            required: true,
          },
        ],
        run: vi.fn().mockResolvedValue({
          success: true,
          result: 'Tool executed successfully',
        }),
      };

      // Initial message
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Please use the test tool',
        },
      ];

      // First call - should return tool call
      const response1 = await client.processCompletion(messages, modelParameters, [mockTool]);

      expect(response1.toolCalls).toBeDefined();
      expect(response1.toolCalls).toHaveLength(1);
      expect(response1.toolCalls![0]).toMatchObject({
        call_id: 'toolu_123',
        name: 'test_tool',
        arguments: { arg1: 'value1' },
      });

      // Simulate tool execution and add tool result
      const toolResult: ToolResult = {
        call_id: 'toolu_123',
        result: 'Tool executed successfully',
        success: true,
      };

      // Messages for second call should include tool result
      const messagesWithToolResult: LLMMessage[] = [
        ...messages,
        {
          role: 'user',
          toolResult,
        },
      ];

      // Mock final response after tool execution
      const finalResponse = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The tool executed successfully with the result: Tool executed successfully',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 150,
          output_tokens: 20,
        },
      };

      mockCreate.mockResolvedValueOnce(finalResponse);

      // Second call - should process tool result and return final response
      const response2 = await client.processCompletion(messagesWithToolResult, modelParameters, [mockTool]);

      expect(response2.content).toBe('The tool executed successfully with the result: Tool executed successfully');
      expect(response2.toolCalls).toBeUndefined();

      // Verify the messages were formatted correctly
      const calls = mockCreate.mock.calls;
      expect(calls).toHaveLength(2);

      // Second call should include tool result in correct format
      const secondCallMessages = calls[1][0].messages;
      expect(secondCallMessages).toHaveLength(2);
      expect(secondCallMessages[1]).toMatchObject({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({
            tool_use_id: 'toolu_123',
            type: 'tool_result',
            content: 'Tool executed successfully\n',
          }),
        ]),
      });
    });

    it('should handle sequential thinking tool calls correctly', async () => {
      // Mock sequential thinking tool responses
      const thought1Response = {
        id: 'msg_thought1',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_thought1',
            name: 'sequentialthinking',
            input: {
              thought: 'First, I need to understand the task',
              next_thought_needed: true,
              thought_number: 1,
              total_thoughts: 3,
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const thought2Response = {
        id: 'msg_thought2',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_thought2',
            name: 'sequentialthinking',
            input: {
              thought: 'Now I can provide a greeting',
              next_thought_needed: false,
              thought_number: 2,
              total_thoughts: 2,
            },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        usage: { input_tokens: 150, output_tokens: 50 },
      };

      const finalResponse = {
        id: 'msg_final',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello! I can successfully access the Anthropic API.',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 20 },
      };

      mockCreate
        .mockResolvedValueOnce(thought1Response)
        .mockResolvedValueOnce(thought2Response)
        .mockResolvedValueOnce(finalResponse);

      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Hello! Please respond with a simple greeting and confirm you can access the Anthropic API.',
        },
      ];

      // Create mock sequential thinking tool
      const mockSequentialThinkingTool: Tool = {
        getName: () => 'sequentialthinking',
        getDescription: () => 'Sequential thinking tool',
        getParameters: () => [],
        run: vi.fn()
          .mockResolvedValueOnce({
            success: true,
            result: 'Thought recorded: First, I need to understand the task',
          })
          .mockResolvedValueOnce({
            success: true,
            result: 'Thought recorded: Now I can provide a greeting',
          }),
      };

      // Process first thought
      const response1 = await client.processCompletion(messages, modelParameters, [mockSequentialThinkingTool]);
      expect(response1.toolCalls).toHaveLength(1);

      // Add tool result for first thought
      const messagesWithThought1: LLMMessage[] = [
        ...messages,
        {
          role: 'user',
          toolResult: {
            call_id: 'toolu_thought1',
            result: 'Thought recorded: First, I need to understand the task',
            success: true,
          },
        },
      ];

      // Process second thought
      const response2 = await client.processCompletion(messagesWithThought1, modelParameters, [mockSequentialThinkingTool]);
      expect(response2.toolCalls).toHaveLength(1);

      // Add tool result for second thought
      const messagesWithThought2: LLMMessage[] = [
        ...messagesWithThought1,
        {
          role: 'user',
          toolResult: {
            call_id: 'toolu_thought2',
            result: 'Thought recorded: Now I can provide a greeting',
            success: true,
          },
        },
      ];

      // Get final response
      const response3 = await client.processCompletion(messagesWithThought2, modelParameters, [mockSequentialThinkingTool]);
      expect(response3.content).toBe('Hello! I can successfully access the Anthropic API.');
      expect(response3.toolCalls).toBeUndefined();

      // Verify all calls were made correctly
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle tool call errors properly', async () => {
      const toolCallResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_error',
            name: 'test_tool',
            input: { arg1: 'bad_value' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValueOnce(toolCallResponse);

      const mockTool: Tool = {
        getName: () => 'test_tool',
        getDescription: () => 'A test tool',
        getParameters: () => [],
        run: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
      };

      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Use the tool',
        },
      ];

      const response = await client.processCompletion(messages, modelParameters, [mockTool]);
      expect(response.toolCalls).toHaveLength(1);

      // Add error result
      const messagesWithError: LLMMessage[] = [
        ...messages,
        {
          role: 'user',
          toolResult: {
            call_id: 'toolu_error',
            error: 'Tool execution failed',
            success: false,
          },
        },
      ];

      const errorHandlingResponse = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I encountered an error with the tool.',
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'end_turn',
        usage: { input_tokens: 150, output_tokens: 20 },
      };

      mockCreate.mockResolvedValueOnce(errorHandlingResponse);

      const response2 = await client.processCompletion(messagesWithError, modelParameters, [mockTool]);
      expect(response2.content).toBe('I encountered an error with the tool.');

      // Verify error was formatted correctly
      const errorCall = mockCreate.mock.calls[1][0].messages[1];
      expect(errorCall.content[0]).toMatchObject({
        tool_use_id: 'toolu_error',
        type: 'tool_result',
        content: expect.stringContaining('Tool call failed with error'),
        is_error: true,
      });
    });

    it('should not add tool_use messages to history separately from text content', async () => {
      // This test ensures we don't create orphaned tool_use blocks
      const mixedContentResponse = {
        id: 'msg_mixed',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Let me use a tool for you.',
          },
          {
            type: 'tool_use',
            id: 'toolu_mixed',
            name: 'test_tool',
            input: { arg1: 'value1' },
          },
        ],
        model: 'claude-3-sonnet-20240229',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 60 },
      };

      mockCreate.mockResolvedValueOnce(mixedContentResponse);

      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Please help me',
        },
      ];

      const mockTool: Tool = {
        getName: () => 'test_tool',
        getDescription: () => 'A test tool',
        getParameters: () => [],
        run: vi.fn(),
      };

      const response = await client.processCompletion(messages, modelParameters, [mockTool]);

      // Should have both text content and tool calls
      expect(response.content).toBe('Let me use a tool for you.');
      expect(response.toolCalls).toHaveLength(1);

      // The message history should be managed properly
      // This is where the fix needs to be implemented
    });
  });

  describe('Proxy Configuration', () => {
    it('should work with proxy configuration from example app', async () => {
      // Test with proxy configuration similar to example-proxy-app
      const proxyModelParameters: ModelParameters = {
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
        max_tokens: 1000,
        api_key: 'test-api-key',
        base_url: 'http://localhost:8080', // Proxy URL
      };

      const proxyClient = new AnthropicClient(proxyModelParameters);

      const response = {
        id: 'msg_proxy',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello from proxy!',
          },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValueOnce(response);

      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Hello',
        },
      ];

      const result = await proxyClient.processCompletion(messages, proxyModelParameters);
      expect(result.content).toBe('Hello from proxy!');
    });
  });
});