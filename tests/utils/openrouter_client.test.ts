import { describe, it, expect, beforeEach, rs } from '@rstest/core';
import { OpenRouterClient } from '../../trae_agent/utils/models/openrouter_client';
import { Config } from '../../trae_agent/utils/config';
import { ChatMessage } from '../../trae_agent/utils/types';

// Mock fetch for OpenRouter API calls
global.fetch = rs.fn();

describe('OpenRouterClient', () => {
  let openRouterClient: OpenRouterClient;
  let mockConfig: Config;

  beforeEach(() => {
    const configData = {
      default_provider: 'openrouter',
      model_providers: {
        openrouter: {
          api_key: 'sk-or-test-key',
          model: 'anthropic/claude-3-opus',
          max_tokens: 2048,
          temperature: 0.7
        }
      }
    };
    mockConfig = new Config(configData);
    openRouterClient = new OpenRouterClient(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(openRouterClient).toBeDefined();
      expect(openRouterClient.supportsToolCalling()).toBe(true);
    });

    it('should throw error with missing API key', () => {
      const configData = {
        default_provider: 'openrouter',
        model_providers: {
          openrouter: {
            model: 'anthropic/claude-3-opus'
          }
        }
      };
      const invalidConfig = new Config(configData);
      
      expect(() => new OpenRouterClient(invalidConfig)).toThrow('OpenRouter API key is required');
    });
  });

  describe('Chat Completion', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finish_reason: 'stop'
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await openRouterClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello! How can I help you today?');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-or-test-key',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized'
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      await expect(openRouterClient.createChatCompletion(messages)).rejects.toThrow('OpenRouter API error: Unauthorized');
    });

    it('should handle tool calls', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York"}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather?' }
      ];

      const tools = [{
        name: 'get_weather',
        description: 'Get weather information',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          }
        }
      }];

      const result = await openRouterClient.createChatCompletion(messages, tools);

      expect(result).toBeDefined();
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.[0]?.name).toBe('get_weather');
    });
  });

  describe('Tool Calling Support', () => {
    it('should support tool calling', () => {
      expect(openRouterClient.supportsToolCalling()).toBe(true);
    });
  });
});