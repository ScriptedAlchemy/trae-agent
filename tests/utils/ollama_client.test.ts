import { describe, it, expect, beforeEach, rs } from '@rstest/core';
import { OllamaClient } from '../../trae_agent/utils/models/ollama_client';
import { Config } from '../../trae_agent/utils/config';

// Mock fetch globally
global.fetch = rs.fn();

describe('OllamaClient', () => {
  let ollamaClient: OllamaClient;
  let mockConfig: Config;
  let mockFetch: any;

  beforeEach(() => {
    const configData = {
      default_provider: 'ollama',
      model_providers: {
        ollama: {
          model: 'llama2',
          base_url: 'http://localhost:11434',
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.9
        }
      }
    };
    mockConfig = new Config(configData);
    ollamaClient = new OllamaClient(mockConfig);
    
    // Reset fetch mock
    mockFetch = global.fetch as any;
    mockFetch.mockClear();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(ollamaClient).toBeDefined();
      expect(ollamaClient.supportsToolCalling()).toBe(false); // Ollama typically doesn't support tool calling
    });

    it('should use default base URL if not provided', () => {
      const configWithoutUrl = { ...mockConfig };
      delete configWithoutUrl.ollama_base_url;
      
      const client = new OllamaClient(configWithoutUrl);
      expect(client).toBeDefined();
    });
  });

  describe('Chat Completion', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you today?'
        },
        done: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      const result = await ollamaClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello! How can I help you today?');
      expect(result.toolCalls).toBeUndefined();
    });

    it('should handle multiple messages', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: 'That\'s great to hear!'
        },
        done: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'I\'m doing well' }
      ];

      const result = await ollamaClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('That\'s great to hear!');
    });
  });

  describe('Tool Calling Support', () => {
    it('should not support tool calling by default', () => {
      expect(ollamaClient.supportsToolCalling()).toBe(false);
    });

    it('should handle tool calls gracefully when not supported', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: 'I cannot use tools, but I can help you with information.'
        },
        done: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const messages = [
        { role: 'user' as const, content: 'Use a tool to get the weather' }
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

      const result = await ollamaClient.createChatCompletion(messages, tools);

      expect(result).toBeDefined();
      expect(result.toolCalls).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      await expect(ollamaClient.createChatCompletion(messages)).rejects.toThrow('Ollama API error: Error: Connection refused');
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Model not found'
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      await expect(ollamaClient.createChatCompletion(messages)).rejects.toThrow('Ollama API error: Model not found');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: ''
        },
        done: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      const result = await ollamaClient.createChatCompletion(messages);

      expect(result.content).toBe('');
    });
  });

  describe('Configuration', () => {
    it('should use correct model configuration', () => {
      expect((ollamaClient as any).modelName).toBe('llama2');
      expect((ollamaClient as any).config.model_providers.ollama.max_tokens).toBe(1024);
      expect((ollamaClient as any).config.model_providers.ollama.temperature).toBe(0.7);
    });

    it('should handle different models', () => {
      const configData = {
        default_provider: 'ollama',
        model_providers: {
          ollama: {
            model: 'codellama',
            base_url: 'http://localhost:11434',
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.9
          }
        }
      };
      const config = new Config(configData);

      const client = new OllamaClient(config);
      expect((client as any).modelName).toBe('codellama');
    });

    it('should handle custom base URL', () => {
      const configData = {
        default_provider: 'ollama',
        model_providers: {
          ollama: {
            model: 'llama2',
            base_url: 'http://custom-ollama:11434',
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.9
          }
        }
      };
      const config = new Config(configData);

      const client = new OllamaClient(config);
      expect(client).toBeDefined();
    });
  });

  describe('Streaming Support', () => {
    it('should handle streaming responses if supported', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: 'This is a streamed response.'
        },
        done: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const messages = [
        { role: 'user' as const, content: 'Tell me a story' }
      ];

      const result = await ollamaClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('This is a streamed response.');
    });
  });
});