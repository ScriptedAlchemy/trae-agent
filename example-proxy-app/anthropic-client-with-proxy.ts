// Enhanced Anthropic Client with Proxy Support
import Anthropic from '@anthropic-ai/sdk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import type { Agent } from 'http';

interface ProxyConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageOptions {
  max_tokens?: number;
  temperature?: number;
  [key: string]: any;
}

export class AnthropicClientWithProxy {
  private config: ProxyConfig;
  private client: Anthropic;

  constructor(config: ProxyConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): Anthropic {
    const clientOptions: {
      apiKey: string;
      baseURL?: string;
    } = {
      apiKey: this.config.api_key || process.env.ANTHROPIC_API_KEY || '',
    };

    // Configure base URL if provided (for proxy servers)
    if (this.config.base_url) {
      clientOptions.baseURL = this.config.base_url;
      console.log(`🔗 Using base URL: ${this.config.base_url}`);
    }

    return new Anthropic(clientOptions);
  }

  async sendMessage(messages: Message[], options: MessageOptions = {}): Promise<Anthropic.Messages.Message> {
    try {
      console.log('📤 Sending message to Anthropic via proxy...');
      
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: this.config.max_tokens || 1024,
        temperature: this.config.temperature || 0.7,
        messages: messages,
        ...options
      });

      console.log('📥 Received response from Anthropic');
      return response;
    } catch (error) {
      console.error('❌ Error communicating with Anthropic:', (error as Error).message);
      throw error;
    }
  }

  // Test connectivity
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing connection to Anthropic API...');
      if (this.config.base_url) {
        console.log(`📡 Using base URL: ${this.config.base_url}`);
      }
      
      const testMessage: Message[] = [{
        role: 'user',
        content: 'Hello! This is a test message to verify connectivity.'
      }];

      const response = await this.sendMessage(testMessage, { max_tokens: 50 });
      
      console.log('✅ Connection test successful!');
      if (response.content[0] && 'text' in response.content[0]) {
        console.log('📝 Test response:', response.content[0].text);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', (error as Error).message);
      return false;
    }
  }
}
