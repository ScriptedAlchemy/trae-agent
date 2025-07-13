import { beforeEach, describe, it, expect } from 'vitest';
import { AnthropicClient } from '../../trae_agent/utils/anthropic_client';
import { ModelParameters, LLMMessage } from '../../trae_agent/utils/llm_basics';
import { SequentialThinkingTool } from '../../trae_agent/tools/sequential_thinking_tool';

describe('AnthropicClient Integration Tests', () => {
  let client: AnthropicClient;
  let modelParameters: ModelParameters;

  beforeEach(() => {
    // Use the exact configuration from example-proxy-app
    modelParameters = {
      model: 'claude-sonnet-4-20250514',
      api_key: 'proxy-placeholder',
      base_url: 'http://localhost:8080',
      temperature: 0.7,
      max_tokens: 1000,
    };

    client = new AnthropicClient(modelParameters);
  });

  describe('Tool Call Message Flow - Real Proxy', () => {
    it.skip('should handle sequential thinking tool calls without message mismatch errors', async () => {
      // Skip in CI, only run when proxy is available
      if (!process.env.RUN_PROXY_TESTS) {
        return;
      }

      const sequentialThinkingTool = new SequentialThinkingTool();
      
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: 'Hello! Please respond with a simple greeting and confirm you can access the Anthropic API.',
        },
      ];

      try {
        // First call - might trigger sequential thinking
        const response1 = await client.processCompletion(
          messages, 
          modelParameters, 
          [sequentialThinkingTool]
        );

        console.log('First response:', response1);

        // If we got tool calls, we need to handle them
        if (response1.toolCalls && response1.toolCalls.length > 0) {
          for (const toolCall of response1.toolCalls) {
            // Execute the tool
            const toolResult = await sequentialThinkingTool.run(toolCall.arguments);
            
            // Add tool result to messages
            messages.push({
              role: 'user',
              toolResult: {
                call_id: toolCall.call_id,
                result: toolResult.result || '',
                success: toolResult.success,
                error: toolResult.error,
              },
            });
          }

          // Make another call with tool results
          const response2 = await client.processCompletion(
            messages,
            modelParameters,
            [sequentialThinkingTool]
          );

          console.log('Second response:', response2);
        }

        // We should eventually get a text response
        expect(response1.content || response1.toolCalls).toBeTruthy();
      } catch (error) {
        console.error('Integration test error:', error);
        throw error;
      }
    });
  });

  describe('Message History Management', () => {
    it('should build correct message history for tool calls', () => {
      // Test the message parsing logic
      const messagesWithToolUse: LLMMessage[] = [
        {
          role: 'user',
          content: 'Use a tool',
        },
        {
          role: 'assistant',
          toolCall: {
            call_id: 'test_123',
            name: 'test_tool',
            arguments: { param: 'value' },
            id: 'test_123',
          },
        },
        {
          role: 'user',
          toolResult: {
            call_id: 'test_123',
            result: 'Success',
            success: true,
          },
        },
      ];

      // Access the private method through type assertion for testing
      const anthropicMessages = (client as any).parseMessages(messagesWithToolUse);

      // Should have 3 messages
      expect(anthropicMessages).toHaveLength(3);
      
      // First should be user message
      expect(anthropicMessages[0]).toMatchObject({
        role: 'user',
        content: 'Use a tool',
      });

      // Second should be assistant with tool_use
      expect(anthropicMessages[1]).toMatchObject({
        role: 'assistant',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_use',
            id: 'test_123',
            name: 'test_tool',
          }),
        ]),
      });

      // Third should be user with tool_result
      expect(anthropicMessages[2]).toMatchObject({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_result',
            tool_use_id: 'test_123',
            content: expect.stringContaining('Success'),
          }),
        ]),
      });
    });
  });
});