import { describe, it, expect, beforeEach, rs } from '@rstest/core';
import { GoogleClient } from '../../trae_agent/utils/models/google_client';
import { Config } from '../../trae_agent/utils/config';

// Mock the Google Generative AI SDK
rs.mock('@google/generative-ai');

describe('GoogleClient', () => {
  let googleClient: GoogleClient;
  let mockConfig: Config;

  beforeEach(() => {
    const configData = {
      default_provider: 'google',
      model_providers: {
        google: {
          model: 'gemini-pro',
          api_key: 'test-api-key',
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 0.9
        }
      }
    };
    mockConfig = new Config(configData);

    googleClient = new GoogleClient(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(googleClient).toBeDefined();
      expect(googleClient.supportsToolCalling()).toBe(true);
    });

    it('should throw error with missing API key', () => {
      const invalidConfigData = {
        default_provider: 'google',
        model_providers: {
          google: {
            model: 'gemini-pro'
            // Missing api_key
          }
        }
      };
      const invalidConfig = new Config(invalidConfigData);
      
      expect(() => new GoogleClient(invalidConfig)).toThrow();
    });
  });

  describe('Chat Completion', () => {
    it('should create chat completion successfully', async () => {
      const mockResponse = {
        response: {
          text: () => 'Hello! How can I help you today?',
          candidates: [{
            content: {
              parts: [{ text: 'Hello! How can I help you today?' }]
            }
          }]
        }
      };

      const mockModel = {
        generateContent: () => Promise.resolve(mockResponse)
      };

      const mockGoogleAI = {
        getGenerativeModel: () => mockModel
      };

      // Override the internal client
      (googleClient as any).client = mockGoogleAI;

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      const result = await googleClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello! How can I help you today?');
    });

    it('should handle system messages correctly', async () => {
      const mockResponse = {
        response: {
          text: () => 'I understand the instructions.',
          candidates: [{
            content: {
              parts: [{ text: 'I understand the instructions.' }]
            }
          }]
        }
      };

      const mockModel = {
        generateContent: () => Promise.resolve(mockResponse)
      };

      const mockGoogleAI = {
        getGenerativeModel: () => mockModel
      };

      (googleClient as any).client = mockGoogleAI;

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello' }
      ];

      const result = await googleClient.createChatCompletion(messages);

      expect(result).toBeDefined();
      expect(result.content).toBe('I understand the instructions.');
    });
  });

  describe('Tool Calling Support', () => {
    it('should support tool calling', () => {
      expect(googleClient.supportsToolCalling()).toBe(true);
    });

    it('should handle tool calls in messages', async () => {
      const mockResponse = {
        response: {
          text: () => '',
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'get_weather',
                  args: { location: 'New York' }
                }
              }]
            }
          }]
        }
      };

      const mockModel = {
        generateContent: () => Promise.resolve(mockResponse)
      };

      const mockGoogleAI = {
        getGenerativeModel: () => mockModel
      };

      (googleClient as any).client = mockGoogleAI;

      const messages = [
        { role: 'user' as const, content: 'What\'s the weather in New York?' }
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

      const result = await googleClient.createChatCompletion(messages, tools);

      expect(result).toBeDefined();
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.[0]?.name).toBe('get_weather');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockModel = {
        generateContent: () => Promise.reject(new Error('API Error'))
      };

      const mockGoogleAI = {
        getGenerativeModel: () => mockModel
      };

      (googleClient as any).client = mockGoogleAI;

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      await expect(googleClient.createChatCompletion(messages)).rejects.toThrow('API Error');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        response: {
          text: () => '',
          candidates: []
        }
      };

      const mockModel = {
        generateContent: () => Promise.resolve(mockResponse)
      };

      const mockGoogleAI = {
        getGenerativeModel: () => mockModel
      };

      (googleClient as any).client = mockGoogleAI;

      const messages = [
        { role: 'user' as const, content: 'Hello' }
      ];

      const result = await googleClient.createChatCompletion(messages);

      expect(result.content).toBe('');
    });
  });

  describe('Message Parsing', () => {
    it('should parse messages correctly', () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const parsed = (googleClient as any).parseMessages(messages);

      expect(parsed).toBeDefined();
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should handle tool call results', () => {
      const messages = [
        { role: 'user', content: 'What\'s the weather?' },
        { 
          role: 'assistant', 
          content: '',
          toolCalls: [{
            id: 'call_1',
            name: 'get_weather',
            arguments: { location: 'NYC' }
          }]
        },
        {
          role: 'tool',
          content: 'Sunny, 75°F',
          toolCallId: 'call_1'
        }
      ];

      const parsed = (googleClient as any).parseMessages(messages);

      expect(parsed).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should use correct model configuration', () => {
      expect((googleClient as any).config.model).toBe('gemini-pro');
      expect((googleClient as any).config.max_tokens).toBe(2048);
      expect((googleClient as any).config.temperature).toBe(0.7);
    });

    it('should handle different models', () => {
      const configData = {
        default_provider: 'google',
        model_providers: {
          google: {
            model: 'gemini-1.5-pro',
            api_key: 'test-api-key',
            max_tokens: 2048,
            temperature: 0.7,
            top_p: 0.9
          }
        }
      };
      const config = new Config(configData);

      const client = new GoogleClient(config);
      expect((client as any).config.model_providers.google.model).toBe('gemini-1.5-pro');
    });
  });
});