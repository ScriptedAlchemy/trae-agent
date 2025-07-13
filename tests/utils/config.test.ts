import { describe, it, expect, beforeEach } from '@rstest/core';
import { Config } from '../../trae_agent/utils/config';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Config', () => {
  let tempConfigPath: string;

  beforeEach(() => {
    tempConfigPath = join(tmpdir(), `test_config_${Date.now()}.json`);
  });

  afterEach(() => {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
  });

  afterEach(() => {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
  });

  describe('Configuration Loading', () => {
    it('should load valid configuration from file', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: 'test-key',
            model: 'gpt-4'
          }
        }
      };
      
      writeFileSync(tempConfigPath, JSON.stringify(configData, null, 2));
      const config = new Config(tempConfigPath);
      
      expect(config.default_provider).toBe('openai');
      expect(config.model_providers.openai?.api_key).toBe('test-key');
      expect(config.model_providers.openai?.model).toBe('gpt-4');
    });

    it('should create config from object', () => {
      const configData = {
        default_provider: 'anthropic',
        model_providers: {
          anthropic: {
            api_key: 'test-anthropic-key',
            model: 'claude-3-sonnet-20240229'
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.default_provider).toBe('anthropic');
      expect(config.model_providers.anthropic?.api_key).toBe('test-anthropic-key');
      expect(config.model_providers.anthropic?.model).toBe('claude-3-sonnet-20240229');
    });
  });

  describe('Provider Configuration', () => {
    it('should handle OpenAI configuration', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: 'sk-test123',
            model: 'gpt-4',
            base_url: 'https://api.openai.com/v1'
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.default_provider).toBe('openai');
      expect(config.model_providers.openai?.api_key).toBe('sk-test123');
      expect(config.model_providers.openai?.model).toBe('gpt-4');
      expect(config.model_providers.openai?.base_url).toBe('https://api.openai.com/v1');
    });

    it('should handle Anthropic configuration', () => {
      const configData = {
        default_provider: 'anthropic',
        model_providers: {
          anthropic: {
            api_key: 'sk-ant-test123',
            model: 'claude-3-opus-20240229'
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.default_provider).toBe('anthropic');
      expect(config.model_providers.anthropic?.api_key).toBe('sk-ant-test123');
      expect(config.model_providers.anthropic?.model).toBe('claude-3-opus-20240229');
    });

    it('should handle Azure configuration', () => {
      const configData = {
        default_provider: 'azure',
        model_providers: {
          azure: {
            api_key: 'azure-test-key',
            model: 'gpt-4',
            base_url: 'https://test.openai.azure.com',
            api_version: '2024-02-15-preview'
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.default_provider).toBe('azure');
      expect(config.model_providers.azure?.api_key).toBe('azure-test-key');
      expect(config.model_providers.azure?.model).toBe('gpt-4');
      expect(config.model_providers.azure?.base_url).toBe('https://test.openai.azure.com');
      expect(config.model_providers.azure?.api_version).toBe('2024-02-15-preview');
    });

    it('should handle Ollama configuration', () => {
      const configData = {
        default_provider: 'ollama',
        model_providers: {
          ollama: {
            model: 'llama2',
            base_url: 'http://localhost:11434'
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.default_provider).toBe('ollama');
      expect(config.model_providers.ollama?.model).toBe('llama2');
      expect(config.model_providers.ollama?.base_url).toBe('http://localhost:11434');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing API key for OpenAI', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            model: 'gpt-4'
            // Missing api_key
          }
        }
      };
      
      const config = new Config(configData);
      expect(config.model_providers.openai?.api_key).toBe('');
    });

    it('should handle invalid provider', () => {
      const configData = {
        default_provider: 'invalid_provider',
        model_providers: {
          invalid_provider: {
            api_key: 'test-key',
            model: 'test-model'
          }
        }
      };
      
      const config = new Config(configData);
      expect(config.default_provider).toBe('invalid_provider');
    });

    it('should handle missing model for required providers', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: 'test-key'
            // Missing model
          }
        }
      };
      
      const config = new Config(configData);
      expect(config.model_providers.openai?.model).toBe('');
    });
  });

  describe('Environment Variable Support', () => {
    it('should handle environment variable placeholders', () => {
      // The Config class stores the raw value without substitution
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: '${TEST_API_KEY}',
            model: 'gpt-4'
          }
        }
      };
      
      const config = new Config(configData);
      
      // Config stores the raw placeholder value
      expect(config.model_providers.openai?.api_key).toBe('${TEST_API_KEY}');
    });
  });

  describe('Model Parameters', () => {
    it('should handle model parameters configuration', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: 'test-key',
            model: 'gpt-4',
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.9
          }
        }
      };
      
      const config = new Config(configData);
      
      expect(config.model_providers.openai?.temperature).toBe(0.7);
      expect(config.model_providers.openai?.max_tokens).toBe(2000);
      expect(config.model_providers.openai?.top_p).toBe(0.9);
    });
  });

  describe('Configuration Serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const configData = {
        default_provider: 'openai',
        model_providers: {
          openai: {
            api_key: 'test-key',
            model: 'gpt-4'
          }
        }
      };
      
      const config = new Config(configData);
      const serialized = JSON.parse(JSON.stringify(configData));
      const deserialized = new Config(serialized);
      
      expect(deserialized.default_provider).toBe(config.default_provider);
      expect(deserialized.model_providers.openai?.api_key).toBe(config.model_providers.openai?.api_key);
      expect(deserialized.model_providers.openai?.model).toBe(config.model_providers.openai?.model);
    });
  });
});